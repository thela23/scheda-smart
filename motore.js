/* Motore "Tempo Smart" — ricalcola un allenamento per farlo stare in un tempo dato,
 * perdendo il meno stimolo possibile. Spiegazione completa: docs/APP_SMART.md
 *
 * Idea in tre righe:
 *  1. ogni scelta (togliere una serie, accorciare un recupero, passare ai myo-reps...) fa
 *     risparmiare secondi e costa un po' di stimolo;
 *  2. lo stimolo per muscolo ha rendimenti decrescenti (le prime serie valgono di piu'), pesato
 *     per la priorita' del muscolo;
 *  3. si applicano i tagli piu' "convenienti" finche' non si sta nel tempo, poi si rimette
 *     dentro quello che ci sta ancora.
 */
(function (root) {
  "use strict";

  /* ---------- modello del tempo (secondi) ---------- */
  var RT = { bil: 4, man: 3.5, iso: 3, corpo: 3, core: 2.5 };     // durata di una ripetizione
  var SETUP = { bil: 60, man: 30, iso: 15, corpo: 15, core: 10 };  // preparare il blocco (dischi!)
  var TRANS = 15;      // passaggio da un esercizio all'altro della superserie
  var FRIZIONE = 10;   // acqua, sistemarsi, respirare: per ogni serie
  var CAMBIO = 30;     // spostarsi al blocco successivo
  var RISC_PIENO = 180, RISC_BREVE = 90;
  var MYO_MINI = 3;    // mini-serie dopo quella di attivazione
  var MYO_PAUSA = 15;  // respiri tra le mini-serie

  /* ---------- modello dello stimolo ---------- */
  // Rendimenti decrescenti: g(x) = ln(1 + x/0.3), tarata su Krieger 2010
  // (1 serie ≈ 70% di 2–3 serie) e fermata a 11 serie per seduta (Remmert/Pelland 2025).
  var TETTO = 11;
  function g(x) { return Math.log(1 + Math.min(x, TETTO) / 0.3); }
  var MYO_EQ = 2.5;             // un myo-reps vale ~2,5 serie normali (studio Myo-Reps vs Straight-Sets, Univ. of Tampa: ≈ 3×12; stima prudente)
  var PENALITA_RECUPERO = 0.03; // −3% di efficacia per ogni −15 s di recupero (Singer 2024: effetto piccolo)
  var PENALITA_RISC = 0.004;    // piccola: il riscaldamento breve non toglie stimolo ma protegge meno

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function lavoro(e) {
    var t = e.hold ? e.hold : e.r * RT[e.k];
    return e.side ? t * 2 + 5 : t;
  }
  function mini(e) {
    var t = 5 * RT[e.k];
    return e.side ? t * 2 + 5 : t;
  }
  function tempoMyo(e) { return lavoro(e) * 1.1 + MYO_MINI * (mini(e) + MYO_PAUSA); }

  function recupero(b, sb) { return b.rest - 15 * sb.cut; }
  function recuperoMin(b, sb) {
    var pesante = b.ex.some(function (e, i) { return sb.ex[i].n > 0 && (e.k === "bil" || e.k === "man"); });
    return pesante ? 60 : 30;
  }

  function tempoBlocco(b, sb, st) {
    var att = [];
    b.ex.forEach(function (e, i) { if (sb.ex[i].n > 0) att.push({ e: e, s: sb.ex[i] }); });
    if (!att.length) return 0;
    var t = CAMBIO + Math.max.apply(null, att.map(function (a) { return SETUP[a.e.k]; }));
    var dritti = att.filter(function (a) { return !a.s.myo; });
    var myo = att.filter(function (a) { return a.s.myo; });
    var giri = Math.max(myo.length ? 1 : 0, Math.max.apply(null, dritti.map(function (a) { return a.s.n; }).concat([0])));

    for (var r = 0; r < giri; r++) {
      var qui = dritti.filter(function (a) { return a.s.n > r; });
      if (r === 0) qui = qui.concat(myo);
      if (r === 0 && !dritti.length) {
        // tutto il blocco in myo: attivazioni in fila, poi mini-serie alternate
        t += qui.reduce(function (s, a) { return s + lavoro(a.e) * 1.1; }, 0) + TRANS * (qui.length - 1);
        t += MYO_MINI * (qui.reduce(function (s, a) { return s + mini(a.e); }, 0) + MYO_PAUSA);
      } else {
        t += qui.reduce(function (s, a) { return s + (a.s.myo ? tempoMyo(a.e) : lavoro(a.e)); }, 0);
        t += TRANS * (qui.length - 1);
      }
      t += FRIZIONE * qui.length;
      if (r < giri - 1) t += recupero(b, sb);
    }
    return t;
  }

  /* Il ramp-up va prima del PRIMO bilanciere rimasto nella seduta, qualunque blocco sia:
     se il blocco che lo aveva sparisce, il ramp-up passa al bilanciere successivo. */
  function bloccoRamp(g0, st) {
    for (var i = 0; i < g0.blocchi.length; i++) {
      var b = g0.blocchi[i], sb = st.blocchi[i];
      if (b.ex.some(function (e, j) { return e.k === "bil" && sb.ex[j].n > 0; })) return i;
    }
    return -1;
  }
  function tempoRamp(g0, st) {
    var i = bloccoRamp(g0, st);
    if (i < 0) return 0;
    var pieno = g0.blocchi[i].ramp || 120;
    return st.rampPieno ? pieno : pieno / 2;
  }

  function tempoTotale(g0, st) {
    return (st.riscPieno ? RISC_PIENO : RISC_BREVE) + tempoRamp(g0, st) +
      g0.blocchi.reduce(function (s, b, i) { return s + tempoBlocco(b, st.blocchi[i], st); }, 0);
  }

  /* serie efficaci per muscolo */
  function volumi(g0, st) {
    var x = {};
    g0.blocchi.forEach(function (b, bi) {
      var sb = st.blocchi[bi], f = 1 - PENALITA_RECUPERO * sb.cut;
      b.ex.forEach(function (e, i) {
        var s = sb.ex[i];
        var eq = s.myo ? Math.min(MYO_EQ, e.n) : s.n;
        Object.keys(e.m).forEach(function (m) { x[m] = (x[m] || 0) + eq * e.m[m] * f; });
      });
    });
    return x;
  }

  function punteggio(g0, st, pieni, pri) {
    var x = volumi(g0, st), num = 0, den = 0;
    Object.keys(pieni).forEach(function (m) {
      var w = pri[m] || 0;
      num += w * g(x[m] || 0); den += w * g(pieni[m]);
    });
    var p = den ? num / den : 1;
    if (!st.riscPieno) p -= PENALITA_RISC;
    if (!st.rampPieno) p -= PENALITA_RISC;
    return p;
  }

  function statoPieno(g0) {
    return {
      riscPieno: true, rampPieno: true,
      blocchi: g0.blocchi.map(function (b) {
        return { cut: 0, ex: b.ex.map(function (e) { return { n: e.n, myo: false }; }) };
      })
    };
  }

  /* ---------- mosse possibili ---------- */
  function mosseTaglio(g0, st) {
    var out = [];
    if (st.riscPieno) out.push(function (s) { s.riscPieno = false; });
    if (st.rampPieno && bloccoRamp(g0, st) >= 0) out.push(function (s) { s.rampPieno = false; });
    g0.blocchi.forEach(function (b, bi) {
      var sb = st.blocchi[bi];
      if (sb.cut < 3 && recupero(b, sb) - 15 >= recuperoMin(b, sb))
        out.push(function (s) { s.blocchi[bi].cut++; });
      var candMyo = b.ex.map(function (e, i) { return e.myo && sb.ex[i].n >= 2 && !sb.ex[i].myo ? i : -1; })
        .filter(function (i) { return i >= 0; });
      if (candMyo.length) out.push(function (s) { candMyo.forEach(function (i) { s.blocchi[bi].ex[i].myo = true; }); });
      b.ex.forEach(function (e, i) {
        var s0 = sb.ex[i];
        if (s0.myo) out.push(function (s) { s.blocchi[bi].ex[i] = { n: 0, myo: false }; });
        else if (s0.n > 0) out.push(function (s) { s.blocchi[bi].ex[i].n--; });
      });
    });
    return out;
  }

  function mosseAggiunta(g0, st) {
    var out = [];
    if (!st.riscPieno) out.push(function (s) { s.riscPieno = true; });
    if (!st.rampPieno) out.push(function (s) { s.rampPieno = true; });
    g0.blocchi.forEach(function (b, bi) {
      var sb = st.blocchi[bi];
      if (sb.cut > 0) out.push(function (s) { s.blocchi[bi].cut--; });
      b.ex.forEach(function (e, i) {
        var s0 = sb.ex[i];
        if (s0.myo) out.push(function (s) { s.blocchi[bi].ex[i] = { n: e.n, myo: false }; });
        else if (s0.n < e.n) out.push(function (s) { s.blocchi[bi].ex[i].n++; });
      });
    });
    return out;
  }

  /* ---------- ottimizzazione ---------- */
  function ottimizza(g0, budget, pri) {
    var pieno = statoPieno(g0);
    var pieni = volumi(g0, pieno);
    var st = clone(pieno);
    var T = tempoTotale(g0, st), P = punteggio(g0, st, pieni, pri);

    // 1) taglia: la mossa con piu' secondi risparmiati per punto di stimolo perso
    while (T > budget) {
      var best = null;
      mosseTaglio(g0, st).forEach(function (mv) {
        var s2 = clone(st); mv(s2);
        var t2 = tempoTotale(g0, s2), p2 = punteggio(g0, s2, pieni, pri);
        var risp = T - t2; if (risp <= 0) return;
        var r = risp / (Math.max(P - p2, 0) + 1e-4);
        if (!best || r > best.r) best = { r: r, s: s2, t: t2, p: p2 };
      });
      if (!best) break;
      st = best.s; T = best.t; P = best.p;
    }
    // 2) riempi: rimetti quello che ci sta ancora, il piu' utile per secondo
    for (;;) {
      var bestA = null;
      mosseAggiunta(g0, st).forEach(function (mv) {
        var s2 = clone(st); mv(s2);
        var t2 = tempoTotale(g0, s2), p2 = punteggio(g0, s2, pieni, pri);
        if (t2 > budget || p2 <= P) return;
        var r = (p2 - P) / (Math.max(t2 - T, 0) + 1);
        if (!bestA || r > bestA.r) bestA = { r: r, s: s2, t: t2, p: p2 };
      });
      if (!bestA) break;
      st = bestA.s; T = bestA.t; P = bestA.p;
    }
    return { st: st, T: T, P: P, pieni: pieni };
  }

  /* ---------- risultato leggibile ---------- */
  // Per eccesso, sempre: cosi' la durata piena arrotondata (es. 56,2 → 57) contiene davvero tutta
  // la seduta, e lo slider al massimo non taglia nulla.
  function fmtMin(sec) { return Math.ceil(sec / 60 - 1e-9); }

  function calcola(g0, budgetMin, pri) {
    var pieno = statoPieno(g0);
    var tPieno = tempoTotale(g0, pieno);
    var o = ottimizza(g0, budgetMin * 60, pri);
    var st = o.st, x = volumi(g0, st);
    // un recupero accorciato su un blocco eliminato non conta nulla: non va mostrato
    st.blocchi.forEach(function (sb) { if (!sb.ex.some(function (s) { return s.n > 0; })) sb.cut = 0; });

    var muscoli = Object.keys(o.pieni).filter(function (m) { return (pri[m] || 0) > 0; })
      .sort(function (a, b) { return (pri[b] || 0) - (pri[a] || 0); })
      .map(function (m) {
        return { id: m, peso: pri[m], pieno: o.pieni[m], ora: x[m] || 0, pct: g(x[m] || 0) / g(o.pieni[m]) };
      });

    var modifiche = [];
    if (!st.riscPieno) modifiche.push({ t: "Riscaldamento lampo", d: "1:30 invece di 3:00 — solo mobilità specifica." });
    if (!st.rampPieno && bloccoRamp(g0, st) >= 0) modifiche.push({ t: "Ramp-up ridotto", d: "una sola serie leggera prima del bilanciere." });
    var iRamp = bloccoRamp(g0, st);
    var blocchi = g0.blocchi.map(function (b, bi) {
      var sb = st.blocchi[bi];
      if (sb.cut) {
        var nomi = b.ex.filter(function (e, i) { return sb.ex[i].n > 0; }).map(function (e) { return e.name; }).join(" + ");
        modifiche.push({ t: "Recupero più corto: " + b.rest + " → " + recupero(b, sb) + " s", d: nomi });
      }
      var ex = b.ex.map(function (e, i) {
        var s = sb.ex[i], stato = "uguale";
        if (s.myo) { stato = "myo"; modifiche.push({ t: e.name + ": myo-reps", d: "1 serie di attivazione + " + MYO_MINI + " mini-serie da 3–5." }); }
        else if (s.n === 0) { stato = "via"; modifiche.push({ t: e.name + ": saltato", d: "" }); }
        else if (s.n < e.n) { stato = "meno"; modifiche.push({ t: e.name + ": " + e.n + " → " + s.n + " serie", d: "" }); }
        return { e: e, n: s.n, myo: s.myo, stato: stato };
      });
      var ramp = bi === iRamp ? tempoRamp(g0, st) : 0;
      return { rest: recupero(b, sb), restPieno: b.rest, ex: ex, tempo: tempoBlocco(b, sb, st) + ramp, ramp: ramp };
    });

    return {
      minuti: fmtMin(o.T), secondi: o.T, pieno: fmtMin(tPieno),
      stimolo: Math.max(0, Math.min(1, o.P)), muscoli: muscoli, modifiche: modifiche, blocchi: blocchi,
      riscaldamento: st.riscPieno ? RISC_PIENO : RISC_BREVE
    };
  }

  var API = { calcola: calcola, g: g, costanti: { MYO_EQ: MYO_EQ, MYO_MINI: MYO_MINI, TETTO: TETTO } };
  if (typeof module !== "undefined") module.exports = API; else root.TempoSmart = API;
})(this);
