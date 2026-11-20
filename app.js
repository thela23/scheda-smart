/* Scheda Smart — interfaccia.
 * Dati della scheda: dati.js · Algoritmo del tempo: motore.js · Progetto e fonti: docs/APP_SMART.md
 *
 * Salvataggio solo in localStorage (funziona anche da file locale, senza login):
 *   ss_sedute_v1   { "<YYYY-MM-DD>_<luogo>_<giorno>": seduta }  — stesso formato della vecchia app
 *   ss_carichi_v1  { ts, loads: { "<luogo>:<giorno>:<slug>": "24 kg" } }  — solo gli scostamenti
 *   ss_ui_v1       ultima vista, luogo, giorno, minuti (per riprendere dopo un ricaricamento)
 *   ss_backup_v1   data dell'ultima esportazione
 * La chiave di un esercizio deriva dal nome: rinominarlo spezza il suo storico.
 */
(function () {
  "use strict";

  /* ===================== utilità ===================== */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var slug = function (s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var oggi = function () { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var dmy = function (s) { var p = String(s).split("-"); return p[2] + "/" + p[1]; };
  var dnum = function (s) { var p = String(s).split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  var fmtNum = function (v) { return String(Math.round(v * 100) / 100).replace(".", ","); };
  var fmtT = function (s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + pad(s % 60); };
  var VID = function (id) { return "https://www.youtube.com/watch?v=" + id; };
  function leggi(k, f) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (_) { return f; } }
  function scrivi(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }

  /* ===================== dati salvati ===================== */
  var LS = { sed: "ss_sedute_v1", car: "ss_carichi_v1", ui: "ss_ui_v1", bk: "ss_backup_v1" };
  var SEDUTE = leggi(LS.sed, {}) || {};
  var CARICHI = leggi(LS.car, null);
  if (!CARICHI || !CARICHI.loads) CARICHI = { ts: 0, loads: {} };
  function salvaSedute() { scrivi(LS.sed, SEDUTE); syncPresto(); }
  function salvaCarichi() { CARICHI.ts = Date.now(); scrivi(LS.car, CARICHI); syncPresto(); }
  // quando è cambiato ogni carico: serve alla sincronizzazione per far vincere la modifica più recente
  function segnaCarico(key) { if (!CARICHI.tk) CARICHI.tk = {}; CARICHI.tk[key] = Date.now(); }
  // sedute eliminate (Azzera / Elimina): così non tornano dall'altro dispositivo
  LS.canc = "ss_cancellate_v1"; LS.sync = "ss_sync_v1";
  var CANC = leggi(LS.canc, {}) || {};
  function cancella(id) { delete SEDUTE[id]; CANC[id] = Date.now(); scrivi(LS.canc, CANC); salvaSedute(); }

  /* ===================== stato della vista ===================== */
  var vista = "allena", luogo = "casa", dayIx = 0, budget = 0, full = 0, R = null;
  var KEYS = [];          // KEYS[blocco][esercizio] = chiave stabile dell'esercizio
  var HX = "", HMODE = "kg";
  var L = function () { return SCHEDA.luoghi[luogo]; };
  var G = function () { return L().giorni[dayIx]; };

  function calcolaChiavi() {
    var seen = {};
    KEYS = G().blocchi.map(function (b) {
      return b.ex.map(function (e) {
        var base = luogo + ":" + G().id + ":" + slug(e.name);
        seen[base] = (seen[base] || 0) + 1;
        return seen[base] > 1 ? base + "-" + seen[base] : base;
      });
    });
  }
  // ATTIVA: data della seduta che stai continuando dallo Storico (null = la seduta di oggi)
  var ATTIVA = null;
  // PARTE: stai facendo la seconda (terza…) parte di una seduta corta → { origine: id della prima parte, k: numero }
  var PARTE = null;
  function salvaUI() {
    scrivi(LS.ui, { data: oggi(), vista: vista, luogo: luogo, day: dayIx, budget: budget, attiva: ATTIVA, parte: PARTE,
      focus: !!(typeof F !== "undefined" && F && F.open) });
  }

  /* ===================== carichi ===================== */
  function caricoDi(key, e) { var v = CARICHI.loads[key]; return (v !== undefined && v !== "") ? v : (e.load || ""); }
  function modificato(key) { return CARICHI.loads[key] !== undefined; }
  // primo numero seguito da "kg" (cosi' "2 × 8 kg" legge 8), altrimenti il primo numero ("2 tubi")
  function numMatch(str) {
    var s = String(str || "").replace(/,/g, ".");
    var m = s.match(/(\d+(?:\.\d+)?)(\s*kg)/i);
    if (m) return m;
    m = s.match(/(\d+(?:\.\d+)?)/);
    return m || null;
  }
  function kgDi(load) { var m = numMatch(load); return m ? parseFloat(m[1]) : null; }
  function unitaDi(load) { return /kg/i.test(load) ? " kg" : /tub/i.test(load) ? " tubi" : ""; }
  // passo di riserva quando dischi.js non sa montare il carico (bilanciere e manubri usano passo(): il più vicino montabile)
  function stepDi(e, load) { return e.k === "bil" ? 2.5 : /kg/i.test(load) ? 2 : 1; }
  // − / +: col bilanciere e i manubri si va al carico successivo che si può davvero montare coi tuoi dischi (dischi.js);
  // per il resto (tubi, zaino…) il passo di sempre
  function passo(e, load, d) {
    var v = window.Dischi && Dischi.attrezzo(e, load) ? Dischi.vicino(e, load, d) : null;
    return v || bump(load, d, stepDi(e, load));
  }
  function passoTesto(e, load, d) {
    var a = kgDi(load), b = kgDi(passo(e, load, d));
    var x = a != null && b != null ? Math.abs(b - a) : stepDi(e, load);
    return (d < 0 ? "−" : "+") + fmtNum(x || stepDi(e, load));
  }
  // cosa montare: chip «10 + 1 per lato», oppure l'avviso col carico possibile più vicino (tocchi e lo metti)
  function montaHTML(e, load, cls) {
    var m = window.Dischi ? Dischi.montaggio(e, load) : null;
    if (!m) return "";
    if (m.ok) return '<span class="' + cls + ' monta" title="Dischi da montare">⚙ ' + esc(m.testo) + '</span>';
    return '<span class="' + cls + ' less">Coi tuoi dischi non si monta</span>' + m.vicini.filter(Boolean).map(function (v) {
      return '<button type="button" class="' + cls + ' sug" data-sug="' + esc(v) + '" data-f="sug">metti ' + esc(v) + '</button>';
    }).join("");
  }
  // superserie che coi tuoi dischi non si carica tutta insieme (ogni carico da solo magari sì): avviso + correzioni
  function avvisoBlocco(bi, b, cls) {
    if (!window.Dischi) return "";
    var es = [], keys = [];
    b.ex.forEach(function (x, ei) { if (x.n > 0) { es.push({ e: x.e, load: caricoDi(KEYS[bi][ei], x.e) }); keys.push(KEYS[bi][ei]); } });
    if (es.length < 2 || Dischi.insieme(es)) return "";
    if (es.some(function (x) { var m = Dischi.montaggio(x.e, x.load); return m && !m.ok; })) return "";   // lo dice già il carico
    var ag = Dischi.aggiusta(es);
    return '<div class="' + cls + ' warn"><b>Coi tuoi dischi non si caricano insieme</b> · ' +
      (ag.length ? 'basta cambiare di poco: ' + ag.map(function (a) {
        return '<button type="button" class="chip sug" data-sugkey="' + esc(keys[a.i]) + '" data-sug="' + esc(a.load) + '" data-f="sugk">' + esc(es[a.i].e.name) + ' ' + esc(a.load) + '</button>';
      }).join(" ") : 'cambia uno dei due carichi.') + '</div>';
  }
  function bump(str, d, step) {
    var raw = String(str || ""), m = numMatch(raw);
    if (!m) return raw;
    var v = Math.max(0, parseFloat(m[1]) + d * step);
    var out = String(Math.round(v * 100) / 100).replace(".", ",");
    return raw.slice(0, m.index) + out + raw.slice(m.index + m[1].length);
  }

  /* ===================== sedute ===================== */
  function dataSeduta() { return ATTIVA || oggi(); }
  function sid() { return PARTE ? PARTE.origine + "_p" + PARTE.k : dataSeduta() + "_" + luogo + "_" + G().id; }
  function sedutaOggi() { return SEDUTE[sid()] || null; }
  function assicuraSeduta() {
    var id = sid();
    if (!SEDUTE[id]) {
      SEDUTE[id] = { date: dataSeduta(), tab: luogo, day: G().id, dayName: G().nome, ts: Date.now(), ex: {}, comment: "" };
      if (PARTE) { SEDUTE[id].parte = PARTE.k; SEDUTE[id].origine = PARTE.origine; }
    }
    var s = SEDUTE[id];
    // le priorità con cui è stata calcolata: così la seduta resta uguale fino alla fine, qualunque cosa succeda allo storico
    if (!s.pri) s.pri = priOggi();
    if (!s.cambio && !Object.keys(s.ex).length) s.cambio = cambioOra();
    if (R) { s.budget = budget; s.minuti = R.minuti; s.stimolo = Math.round(R.stimolo * 100); s.pieno = full; }
    return s;
  }
  /* ===================== settimana e seconda parte (settimana.js) ===================== */
  // le parti della seduta in corso prima di questa (per la seconda parte: quello che è già fatto)
  function partiPrima() {
    if (!PARTE) return [];
    return Settimana.parti(SEDUTE, PARTE.origine).filter(function (id) { var x = SEDUTE[id]; return !x.parte || x.parte < PARTE.k; });
  }
  // priorità dei muscoli per questa seduta: quelle salvate nella seduta se esiste già (sedute vecchie: quelle normali),
  // altrimenti alzate per i muscoli in ritardo negli ultimi 7 giorni. PRI_INFO serve a spiegarlo nel pannello.
  var PRI_INFO = null;
  function priOggi() {
    var s = SEDUTE[sid()];
    var escludi = PARTE ? Settimana.parti(SEDUTE, PARTE.origine) : [];
    escludi.push(sid());
    PRI_INFO = Settimana.priorita(PRIORITA, SEDUTE, SCHEDA, luogo, dataSeduta(), escludi);
    var pri = s && s.pri ? s.pri : s && s.ex && Object.keys(s.ex).length ? PRIORITA : PRI_INFO.pri;
    // nel pannello si spiegano solo i muscoli alzati davvero in questa seduta
    PRI_INFO.ritardo = PRI_INFO.ritardo.filter(function (r) { return (pri[r.m] || 0) > (PRIORITA[r.m] || 0); });
    return pri;
  }
  // secondi per smontare i dischi tra un blocco e l'altro, coi carichi di adesso (dischi.js). Come le priorità, la
  // seduta iniziata tiene quelli con cui è nata: cambiare un carico a metà non rimescola la seduta.
  function cambioOra() {
    var s = SEDUTE[sid()];
    if (s && s.cambio) return s.cambio;
    if (s && s.ex && Object.keys(s.ex).length) return null;   // sedute iniziate prima della v25: come allora
    if (!window.Dischi) return null;
    var K = Settimana.chiavi(luogo, G());
    var bl = G().blocchi.map(function (b, bi) { return b.ex.map(function (e, ei) { return { e: e, load: caricoDi(K[bi][ei], e) }; }); });
    return bl.map(function (a, i) { return bl.map(function (b, j) { return j > i ? Dischi.scarico(a, b) : 0; }); });
  }
  function opzOggi() {
    var o = { misura: PRIORITA, cambio: cambioOra() };
    if (PARTE) o.fatto = Settimana.fattoDi(SEDUTE, partiPrima(), luogo, G());
    return o;
  }
  function calcolaOra(min) { return TempoSmart.calcola(G(), min, priOggi(), opzOggi()); }
  function minimo() { return Math.min(15, full); }
  // la seconda parte si propone solo se vale la pena: almeno +10% di stimolo sulla seduta completa
  function propostaParte() {
    if (PARTE || ATTIVA) return null;
    var sp = Settimana.secondaParte(SEDUTE, SCHEDA, luogo, oggi());
    if (!sp) return null;
    var pri = Settimana.priorita(PRIORITA, SEDUTE, SCHEDA, luogo, oggi(), Settimana.parti(SEDUTE, sp.origine)).pri;
    var F = TempoSmart.calcola(sp.giorno, 999, pri, { fatto: sp.fatto, misura: PRIORITA });
    if (F.stimolo - F.prima < 0.1) return null;
    sp.minuti = F.pieno; sp.daA = [Math.round(F.prima * 100), Math.round(F.stimolo * 100)];
    return sp;
  }
  function avviaParte(origine, k) {
    var s0 = SEDUTE[origine]; if (!s0 || !SCHEDA.luoghi[s0.tab]) return;
    var ix = SCHEDA.luoghi[s0.tab].giorni.map(function (g) { return g.id; }).indexOf(s0.day); if (ix < 0) return;
    Tasti.play("space"); Tasti.haptic(); fermaTimer();
    ATTIVA = null; PARTE = { origine: origine, k: k };
    scegli(s0.tab, ix, s0.budget || 15);
    Tasti.land($("#titolo"));
  }

  // x = esercizio nel piano di oggi (serie, myo); se cambia modalita' le serie segnate ripartono
  function assicuraEx(s, key, e, x) {
    var r = s.ex[key];
    if (!r) r = s.ex[key] = { name: e.name, load: "", kg: null, done: [], tot: 0, reps: "", note: "" };
    if (x && x.n > 0) {
      var myo = !!x.myo;
      if (!!r.myo !== myo) r.done = [];
      r.myo = myo; r.tot = myo ? 4 : x.n;
    }
    var load = caricoDi(key, e);
    r.name = e.name; r.load = load; r.kg = kgDi(load);
    return r;
  }
  function salva(s) { s.ts = Date.now(); salvaSedute(); }
  // serie "efficaci": un myo-reps completo vale 2,5 serie, come nel motore
  function serieEff(r) {
    var d = (r && r.done) || [];
    if (r && r.myo) return (d[0] ? 1 : 0) + 0.5 * d.slice(1).filter(Boolean).length;
    return d.filter(Boolean).length;
  }
  function haSerie(r) { return !!(r && r.done && r.done.some(Boolean)); }
  // seduta lasciata a metà: serie fatte meno di quelle previste (come lo Storico conta «fatte / totali»)
  function incompleta(s) {
    var tot = 0, dn = 0;
    Object.keys(s.ex || {}).forEach(function (k) { var r = s.ex[k], c = serieEff(r); tot += r.myo ? 2.5 : (r.tot || c); dn += c; });
    return dn > 0 && dn < tot - 0.01;
  }

  function ultimaVolta(key) {
    var t = dataSeduta(), best = null, pp = partiPrima();
    Object.keys(SEDUTE).forEach(function (id) {
      var s = SEDUTE[id];
      if (!s || !s.ex) return;
      if (s.date >= t && pp.indexOf(id) < 0) return;
      var r = s.ex[key];
      if (!haSerie(r)) return;
      if (!best || s.date > best.s.date || (s.date === best.s.date && (s.ts || 0) > (best.s.ts || 0))) best = { s: s, r: r };
    });
    return best;
  }
  function topRange(reps) {
    var m = String(reps).match(/(\d+)\s*[–-]\s*(\d+)/);
    if (m) return +m[2];
    m = String(reps).match(/^(\d+)/);
    return m ? +m[1] : null;
  }
  // doppia progressione: se l'ultima volta hai chiuso tutto al limite alto, propone il passo successivo
  function suggerimento(e, last, loadNow) {
    if (!last || !last.r.reps || e.hold) return null;
    var top = topRange(e.reps); if (!top) return null;
    var r = last.r, nums = (String(r.reps).match(/\d+/g) || []).map(Number);
    var ok;
    if (r.myo) ok = r.done && r.done[0] && nums.length && nums[0] >= top;
    else ok = r.tot > 0 && r.done.filter(Boolean).length >= r.tot && nums.length >= r.tot &&
      nums.slice(0, r.tot).every(function (n) { return n >= top; });
    if (!ok || String(r.load) !== String(loadNow)) return null;
    if (numMatch(loadNow)) return { tipo: "carico", nuovo: passo(e, loadNow, 1) };
    return { tipo: "variante" };
  }

  /* ===================== giorno suggerito ===================== */
  function ordineSedute(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0); }
  function giornoSuggerito(l) {
    var ids = SCHEDA.luoghi[l].giorni.map(function (g) { return g.id; });
    var mie = Object.keys(SEDUTE).map(function (k) { return SEDUTE[k]; }).filter(function (s) {
      return s && s.tab === l && s.ex && Object.keys(s.ex).some(function (k) { return haSerie(s.ex[k]); });
    }).sort(ordineSedute);
    if (!mie.length) return { ix: 0, ultima: null };
    var u = mie[mie.length - 1], ix = Math.max(0, ids.indexOf(u.day));
    return { ix: u.date === oggi() ? ix : (ix + 1) % ids.length, ultima: u };
  }

  /* ===================== pannello tempo ===================== */
  var CIRC = 2 * Math.PI * 42;
  $("#ringv").setAttribute("stroke-dasharray", CIRC.toFixed(1));
  function verdetto(p) {
    if (p >= 0.97) return "Seduta completa, o quasi.";
    if (p >= 0.88) return "Quasi tutto lo stimolo, in molto meno tempo.";
    if (p >= 0.75) return "Seduta corta ma vera: la parte che conta resta.";
    return "Seduta di mantenimento: tiene quello che hai, meglio di zero.";
  }

  // "Quadricipiti + Spinta orizzontale" → "quadricipiti e <em>spinta</em> orizzontale": una sola parola in corsivo
  function sottotitolo(sub) {
    var p = String(sub || "").split(/\s*\+\s*/);
    var low = function (s) { return s.toLowerCase(); };
    if (p.length < 2) return esc(low(p[0]));
    var w = p[1].split(" ");
    return esc(low(p[0])) + " e <em>" + esc(low(w[0])) + "</em>" + (w.length > 1 ? " " + esc(w.slice(1).join(" ")) : "");
  }

  function renderSelettori() {
    $("#luoghi").innerHTML = Object.keys(SCHEDA.luoghi).map(function (k) {
      return '<button type="button" data-l="' + k + '" aria-pressed="' + (k === luogo) + '">' + esc(SCHEDA.luoghi[k].label) + '</button>';
    }).join("");
    $("#days").innerHTML = L().giorni.map(function (g, i) {
      return '<button type="button" data-i="' + i + '" aria-pressed="' + (i === dayIx) + '" style="--hue:var(--' + g.hue + ');--hue2:var(--' + g.hue + '2)">' + g.id + '</button>';
    }).join("");
    var g = G();
    // l'accento viene dal giorno, come in Granalume viene dallo sfondo
    document.documentElement.style.setProperty("--dc", "var(--" + g.hue + ")");
    document.documentElement.style.setProperty("--dc2", "var(--" + g.hue + "2)");
    document.documentElement.style.setProperty("--dcs", "var(--" + g.hue + "-soft)");
    $("#titolo").innerHTML = esc(g.nome) + '<span class="sub">' + sottotitolo(g.sub) + '</span>';
    var sg = giornoSuggerito(luogo), h = "";
    if (PARTE) {
      var s0 = SEDUTE[PARTE.origine];
      $("#hint").innerHTML = '<b>' + (PARTE.k === 2 ? 'Seconda' : PARTE.k === 3 ? 'Terza' : PARTE.k + 'ª') + ' parte del ' + esc(g.nome) +
        (s0 ? (s0.date === oggi() ? ' di oggi' : ' del ' + dmy(s0.date)) : '') + '</b>: qui c\'è solo quello che mancava. ' +
        '<button type="button" class="btn-sm" id="aoggi">Seduta nuova</button>';
      return;
    }
    if (ATTIVA) {
      $("#hint").innerHTML = '<b>Stai continuando la seduta del ' + dmy(ATTIVA) + '.</b> <button type="button" class="btn-sm" id="aoggi">Torna a oggi</button>';
      return;
    }
    if (sg.ultima) {
      var u = sg.ultima, nomeU = (L().giorni.filter(function (x) { return x.id === u.day; })[0] || {}).nome || u.dayName;
      h = u.date === oggi() ? "Seduta di oggi: <b>" + esc(nomeU) + "</b>." :
        "Ultima seduta: <b>" + esc(nomeU) + "</b> del " + dmy(u.date) + (sg.ix === dayIx ? " → oggi tocca il <b>" + esc(g.nome) + "</b>." : ".");
    } else h = "Nessuna seduta ancora registrata qui: si parte dal <b>" + esc(L().giorni[0].nome) + "</b>.";
    // l'ultima seduta è rimasta a metà (e non è quella che hai davanti): si può riprendere con un tocco
    if (sg.ultima && incompleta(sg.ultima)) {
      var idU = Settimana.idDi(sg.ultima);
      if (idU !== sid()) h += ' <button type="button" class="btn-sm" data-riprendi="' + esc(idU) + '">Riprendi la seduta interrotta</button>';
    } else {
      // seduta corta di oggi o di ieri: il resto si può fare adesso, come seconda parte
      var sp = propostaParte();
      if (sp) h += '<span class="parte">Hai ancora il resto del <b>' + esc(sp.giorno.nome) + '</b>' + (sp.data === oggi() ? ' di oggi' : ' di ieri') +
        ': ~' + sp.minuti + ' min, porta la seduta dal ' + sp.daA[0] + ' al ' + sp.daA[1] + '%. ' +
        '<button type="button" class="btn-sm pri" data-parte="' + esc(sp.origine) + '" data-k="' + sp.prossima + '">Fai la seconda parte</button></span>';
    }
    $("#hint").innerHTML = h;
  }

  function renderDial() {
    R = calcolaOra(budget);
    var sl = $("#t"), mn = minimo();
    sl.min = mn; sl.max = full; sl.value = budget;
    sl.style.setProperty("--p", ((budget - mn) / Math.max(1, full - mn) * 100) + "%");
    $("#min").textContent = R.minuti;
    if (PARTE) $("#of").textContent = R.minuti >= full ? "tutto quello che mancava" : "il resto intero è " + full + " min";
    else $("#of").textContent = R.minuti >= full ? "seduta completa" : "invece di " + full + " min · " + (full - R.minuti) + " min risparmiati";
    $("#pct").textContent = Math.round(R.stimolo * 100) + "%";
    $("#ringv").setAttribute("stroke-dashoffset", (CIRC * (1 - R.stimolo)).toFixed(1));
    $("#verdict").textContent = PARTE && R.prima != null ? "Con la prima parte (" + Math.round(R.prima * 100) + "%) arrivi al " + Math.round(R.stimolo * 100) + "% della seduta completa." : verdetto(R.stimolo);
    // muscoli in ritardo questa settimana: si dice solo quando cambia davvero qualcosa (seduta tagliata)
    var rit = PRI_INFO && PRI_INFO.ritardo.length && R.minuti < full ? PRI_INFO.ritardo : [];
    $("#ritardo").hidden = !rit.length;
    if (rit.length) $("#ritardo").innerHTML = '<b>' + (rit.every(function (r) { return /quadricipiti|femorali|glutei/.test(r.m); }) ? 'Gambe in ritardo' : 'Muscoli in ritardo') +
      '</b> negli ultimi 7 giorni: ' + rit.map(function (r) { return esc(NOMI_MUSCOLI[r.m].toLowerCase()) + ' ' + Math.round(r.copertura * 100) + '%'; }).join(', ') +
      ' della settimana prevista. ' + (rit.some(function (r) { return R.muscoli.some(function (m) { return m.id === r.m && m.ora > 0; }); }) ?
        'Oggi hanno più spazio.' : 'Con questi minuti non ci stanno: aggiungine qualcuno, o falle nella seconda parte.');
    var opts = [[15, "lampo"], [25, "corta"], [35, "media"], [full, PARTE ? "tutto" : "completa"]].filter(function (o, i, a) { return i === a.length - 1 || o[0] < full; });
    $("#presets").innerHTML = opts.map(function (o) {
      return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (budget === o[0]) + '">' + o[0] + '′<small>' + o[1] + '</small></button>';
    }).join("");

    $("#mus").innerHTML = R.muscoli.filter(function (m) { return m.peso >= 0.5; }).map(function (m) {
      var p = Math.round(m.pct * 100), lo = p < 75 ? "lo" : "";
      return '<div class="mu"><div class="row"><b>' + esc(NOMI_MUSCOLI[m.id]) + (m.peso >= 1 ? ' <small style="color:var(--accent);font-size:10px;letter-spacing:.06em">PRIORITÀ</small>' :
        m.pesoOggi > m.peso ? ' <small style="color:var(--accent);font-size:10px;letter-spacing:.06em">IN RITARDO</small>' : '') +
        '</b><span class="' + lo + '">' + p + '%</span></div><div class="bar"><i class="' + lo + '" style="width:' + p + '%"></i></div></div>';
    }).join("");
    var ch = R.modifiche;
    $("#chn").className = "n" + (ch.length ? "" : " ok");
    $("#chn").textContent = ch.length ? ch.length + " modifiche" : "niente";
    $("#chl").innerHTML = ch.length ? ch.map(function (c) { return '<li><b>' + esc(c.t) + '</b>' + (c.d ? ' — ' + esc(c.d) : '') + '</li>'; }).join("")
      : '<li>' + (PARTE ? 'È tutto quello che mancava.' : 'È la seduta completa della scheda.') + '</li>';

    var myo = R.blocchi.some(function (b) { return b.ex.some(function (x) { return x.myo; }); });
    $("#prima").innerHTML = L().prima.map(function (n) {
      return '<div class="pre' + (n.warn ? ' warn' : '') + '"><b>' + esc(n.t) + '</b><p>' + n.p + '</p>' +
        (n.v ? '<p><a href="' + VID(n.v) + '" target="_blank" rel="noopener">Guarda il video ↗</a></p>' : '') + '</div>';
    }).join("") + (myo ? '<div class="myo-box"><b>Oggi ci sono myo-reps.</b> S = una serie quasi al limite, poi 3 mini-serie (1, 2, 3) da 3–5 ripetizioni con 3–5 respiri in mezzo. Stesso peso. Spiegazione completa nella Guida.</div>' : '');
    $("#sesh").innerHTML = PARTE ? "La <em>seconda</em> parte" : "Tutta la <em>seduta</em>";
  }

  /* ===================== blocchi ed esercizi ===================== */
  // le due coppie di manubri di casa (dati.js → paio): nelle superserie con due carichi si preparano tutte e due
  var PAIO = { metallo: "manubri di metallo", leggeri: "manubri leggeri" };
  function paioHTML(e, cls) { return e.paio && PAIO[e.paio] ? '<span class="' + cls + ' paio-' + e.paio + '">' + PAIO[e.paio] + '</span>' : ''; }
  function exHTML(x, key, bi, ei, s) {
    var e = x.e, rec = s && s.ex ? s.ex[key] : null;
    if (rec && !!rec.myo !== !!x.myo) rec = Object.assign({}, rec, { done: [] });
    var load = caricoDi(key, e), num = !!numMatch(load);
    var last = x.n > 0 ? ultimaVolta(key) : null;
    var sug = x.n > 0 ? suggerimento(e, last, load) : null;

    var chips = "";
    if (x.stato === "fatto") chips = '<span class="chip ok">fatto nella prima parte</span>';
    else if (x.n === 0) chips = '<span class="chip less">saltato oggi</span>';
    else if (x.myo) chips = '<span class="chip myo">myo-reps</span><span class="chip">S da ' + esc(e.reps) + ' + 3 mini da 3–5</span>';
    else chips = '<span class="chip' + (x.n < e.n ? ' less' : '') + '">' + x.n + ' × ' + esc(e.reps) + '</span>';
    if (x.n > 0) {
      if (load) chips += '<button type="button" class="chip load' + (modificato(key) ? ' mod' : '') + '" data-ed="1">' + esc(load) + '<span class="pen">✎</span></button>';
      chips += paioHTML(e, "chip paio") + montaHTML(e, load, "chip");
      if (e.rir) chips += '<span class="chip">RIR ' + esc(e.rir) + '</span>';
      if (sug && sug.tipo === "carico") chips += '<button type="button" class="chip sug" data-sug="' + esc(sug.nuovo) + '" title="L\'ultima volta hai chiuso tutto al limite alto">↑ prova ' + esc(sug.nuovo) + '</button>';
      if (sug && sug.tipo === "variante") chips += '<span class="chip sug">↑ variante più dura</span>';
    }

    var play = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    var h = '<div class="ex' + (x.n === 0 ? ' gone' : '') + '" data-key="' + esc(key) + '" data-b="' + bi + '" data-e="' + ei + '">' +
      '<div class="nmrow"><div class="nmcol"><div class="nm">' + esc(e.name) + '</div>' +
      (e.cue && x.n > 0 ? '<div class="cue">' + esc(e.cue) + '</div>' : '') + '</div>' +
      '<div class="vids"><a class="vid" href="' + VID(e.v) + '" target="_blank" rel="noopener" aria-label="Video: ' + esc(e.name) + '">' + play + '</a>' +
      (e.v2 ? '<a class="vid alt" href="' + VID(e.v2) + '" target="_blank" rel="noopener" aria-label="Video della variante">＋</a>' : '') + '</div></div>' +
      '<div class="chips">' + chips + '</div>';
    if (x.n === 0) return h + '</div>';

    h += '<div class="ledit" hidden>' +
      (num ? '<button type="button" class="stp" data-d="-1" aria-label="Diminuisci">−</button>' : '') +
      '<input class="lval" value="' + esc(load) + '" aria-label="Carico">' +
      (num ? '<button type="button" class="stp" data-d="1" aria-label="Aumenta">+</button>' : '') +
      '<button type="button" class="btn-sm lreset">Ripristina</button></div>';
    if (last) h += '<div class="last">Ultima volta ' + dmy(last.s.date) + ': <b>' + esc(last.r.load || "—") + '</b>' +
      (last.r.reps ? ' · ' + esc(last.r.reps) : '') + ' · ' + fmtNum(serieEff(last.r)) + ' serie' + (last.r.myo ? ' (myo)' : '') + '</div>';

    var done = (rec && rec.done) || [], tot = x.myo ? 4 : x.n;
    h += '<div class="sets"><span class="cap">' + (x.myo ? 'S + mini' : 'fatte') + '</span>';
    for (var j = 0; j < tot; j++) {
      var on = !!done[j], txt = x.myo ? ["S", "1", "2", "3"][j] : String(j + 1);
      h += '<button type="button" class="set' + (x.myo && j ? ' mini' : '') + '" data-j="' + j + '" data-txt="' + txt + '" aria-pressed="' + on + '"' +
        ' aria-label="' + esc(e.name) + (x.myo ? (j ? ' mini-serie ' + j : ' serie di attivazione') : ' serie ' + (j + 1)) + '">' + (on ? '✓' : txt) + '</button>';
    }
    h += '</div>';
    var note = (rec && rec.note) || "";
    h += '<div class="xtra"><input class="reps" value="' + esc((rec && rec.reps) || "") + '" inputmode="text" aria-label="Ripetizioni fatte" placeholder="' +
      (e.hold ? 'secondi tenuti (facolt.)' : x.myo ? 'rip fatte, es. 14-4-4-3' : 'rip fatte, es. 10-9-8') + '">' +
      '<button type="button" class="nbtn' + (note ? ' has' : '') + '">Nota</button></div>' +
      '<div class="exnote"' + (note ? '' : ' hidden') + '><textarea placeholder="Nota — es. non finito, dolore, sensazioni…" aria-label="Nota esercizio">' + esc(note) + '</textarea></div>';
    return h + '</div>';
  }

  function renderBlocchi() {
    var s = sedutaOggi(), num = 0;
    $("#blocks").innerHTML = R.blocchi.map(function (b, bi) {
      if (!b.tempo) return "";
      var n = ++num;
      var live = b.ex.filter(function (x) { return x.n > 0; }).length;
      var giri = Math.max.apply(null, b.ex.map(function (x) { return x.myo ? 1 : x.n; }));
      var rest = giri < 2 ? '' : ' · rec ' + (b.rest < b.restPieno ? '<s>' + b.restPieno + 's</s>' + b.rest + ' s' : b.rest + ' s');
      var ramp = b.ramp ? '<div class="ramp"><b>Prima: ramp-up</b> · bilanciere vuoto × 5' + (b.ramp >= 100 ? ' → × 3 al ~60%' : '') + '. Non conta come serie.</div>' :
        b.ex.some(function (x) { return x.n > 0 && x.e.k === "bil"; }) ? '<div class="ramp"><b>Prima: avvicinamento</b> · 1 × 5 a metà carico sul bilanciere. Non conta come serie.</div>' : '';
      ramp = avvisoBlocco(bi, b, "ramp") + ramp;
      if (b.scarico) ramp = '<div class="ramp"><b>Prima: smonta</b> · i dischi del blocco prima servono qui: toglili prima di caricare (conta ~' + b.scarico + ' s).</div>' + ramp;
      return '<div class="block" data-b="' + bi + '"><div class="bh"><span>Blocco ' + n + ' · ' + (live > 1 ? 'superserie' : 'esercizio singolo') + '</span>' +
        '<span class="t">~' + Math.round(b.tempo / 60) + '′' + rest + '</span></div>' + ramp +
        b.ex.map(function (x, ei) { return exHTML(x, KEYS[bi][ei], bi, ei, s); }).join("") +
        (giri > 1 ? '<button type="button" class="restbtn" data-sec="' + b.rest + '"><span>⏱ Recupero ' + b.rest + ' s</span><span>avvia</span></button>' : '') +
        '</div>';
    }).join("");
    progresso();
  }

  function progresso() {
    var tutti = $$("#blocks .set");
    var fatti = tutti.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; }).length;
    $("#progt").textContent = fatti + " / " + tutti.length + " serie fatte" + (tutti.length && fatti === tutti.length ? " · seduta finita" : "");
    $("#pbar").style.width = (tutti.length ? fatti / tutti.length * 100 : 0) + "%";
    $("#fgow").innerHTML = !fatti ? "Inizia<small>una cosa alla volta</small>" :
      fatti < tutti.length ? "Riprendi<small>" + fatti + " di " + tutti.length + " serie fatte</small>" : "Rivedi<small>seduta finita</small>";
    $$("#blocks .block").forEach(function (bl) {
      var s = $$(".set", bl);
      bl.classList.toggle("complete", s.length > 0 && s.every(function (b) { return b.getAttribute("aria-pressed") === "true"; }));
    });
  }

  function renderAllena() {
    calcolaChiavi(); renderSelettori(); renderDial(); renderBlocchi();
    var s = sedutaOggi(); $("#scmt").value = s ? s.comment || "" : "";
    var rb = $("#reset"); rb.textContent = "Azzera seduta"; rb.classList.remove("danger"); delete rb.dataset.armed;
  }

  function scegli(l, ix, minuti) {
    luogo = l; dayIx = ix;
    full = calcolaOra(999).pieno;
    // se questa seduta è già iniziata, si riapre con i suoi minuti (se no le serie segnate non tornano col piano)
    var gia = sedutaOggi();
    if (!minuti && gia && gia.budget) minuti = gia.budget;
    budget = minuti ? Math.max(minimo(), Math.min(full, minuti)) : full;
    renderAllena(); salvaUI();
  }

  /* ===================== timer di recupero ===================== */
  var TIMER = null;
  function avviaTimer(sec, label) {
    fermaTimer();
    TIMER = { fine: Date.now() + sec * 1000, tot: sec, label: label, id: setInterval(tick, 250), s: null };
    salvaTimer(); $("#timer").hidden = false; tick(); renderF(true);
  }
  function tick() {
    if (!TIMER) return;
    var left = (TIMER.fine - Date.now()) / 1000;
    if (left <= 0) return fineTimer();
    var s = Math.ceil(left), nuovo = s !== TIMER.s; TIMER.s = s;
    if (nuovo && s <= 3) Tasti.play("tick", { vol: .55 });   // gli ultimi tre secondi si sentono
    $("#tval").textContent = fmtT(left);
    $("#tlab").textContent = TIMER.label;
    $("#tbar").style.width = Math.min(100, left / TIMER.tot * 100) + "%";
    var ft = F.open && $("#fT");
    if (ft && nuovo) { ft.textContent = fmtT(left); Tasti.land(ft, { dy: 5, fade: .3 }); }
  }
  function fineTimer() {
    clearInterval(TIMER.id); TIMER = null; salvaTimer();
    $("#tval").textContent = "Vai!"; $("#tlab").textContent = "Recupero finito";
    $("#tbar").style.width = "0";
    Tasti.play("gong"); Tasti.haptic([200, 100, 200]);
    renderF(true);
    setTimeout(function () { if (!TIMER) $("#timer").hidden = true; }, 5000);
  }
  function fermaTimer() { if (TIMER) clearInterval(TIMER.id); TIMER = null; salvaTimer(); $("#timer").hidden = true; }
  function piu15() { if (TIMER) { TIMER.fine += 15000; TIMER.tot += 15; TIMER.s = null; salvaTimer(); tick(); } }
  // il recupero in corso resta salvato: se l'app si chiude (chiamata, audio bloccato…) riparte da dove era
  function salvaTimer() { scrivi("ss_timer_v1", TIMER ? { fine: TIMER.fine, tot: TIMER.tot, label: TIMER.label } : null); }
  function riprendiTimer() {
    var t = leggi("ss_timer_v1", null);
    if (!t || !t.fine || t.fine - Date.now() < 1500) { scrivi("ss_timer_v1", null); return; }
    TIMER = { fine: t.fine, tot: t.tot, label: t.label, id: setInterval(tick, 250), s: null };
    $("#timer").hidden = false; tick();
  }
  $("#tstop").addEventListener("click", function () { fermaTimer(); renderF(true); });
  $("#tplus").addEventListener("click", piu15);

  // recupero automatico dopo una serie: le regole sono in sequenza.js (le stesse del motore del tempo)
  function recuperoAuto(bi, ei, j) {
    if (!sedutaOggi()) return;
    var q = Sequenza.coda(R), i = q.findIndex(function (v) { return v.bi === bi && v.ei === ei && v.j === j; });
    var r = i < 0 ? null : Sequenza.riposo(R, q, i, fatto);
    if (r) avviaTimer(r.sec, r.testo);
  }

  // schermo acceso durante la seduta (se il browser lo permette)
  var WL = null;
  function tieniAcceso() {
    try {
      if (WL || !("wakeLock" in navigator)) return;
      navigator.wakeLock.request("screen").then(function (w) { WL = w; w.addEventListener("release", function () { WL = null; }); }).catch(function () {});
    } catch (_) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && vista === "allena" && sedutaOggi()) tieniAcceso();
    if (TIMER) tick();
  });

  /* ===================== eventi: allenati ===================== */
  $("#luoghi").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || b.dataset.l === luogo) return;
    Tasti.play("tick"); fermaTimer(); ATTIVA = null; PARTE = null; scegli(b.dataset.l, giornoSuggerito(b.dataset.l).ix); Tasti.land($("#titolo"));
  });
  $("#days").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (PARTE && +b.dataset.i === dayIx) return;     // stesso giorno: resti nella seconda parte («Seduta nuova» per uscire)
    Tasti.play("tick"); fermaTimer(); ATTIVA = null; PARTE = null; scegli(luogo, +b.dataset.i); Tasti.land($("#titolo"));
  });
  // lo slider ha gli scatti, come in Granalume: uno ogni 28 ms al massimo, più deciso agli estremi
  var lastNotch = 0;
  function scatto(el) {
    var now = performance.now(); if (now - lastNotch < 28) return; lastNotch = now;
    var x = (+el.value - +el.min) / ((+el.max - +el.min) || 1), end = x <= 0 || x >= 1;
    Tasti.play(end ? "down" : "notch", { vol: end ? .3 : .42, rate: .82 + .36 * x });
  }
  $("#hint").addEventListener("click", function (e) {
    var rp = e.target.closest("[data-riprendi]"); if (rp) { riprendi(rp.dataset.riprendi); return; }
    var pa = e.target.closest("[data-parte]"); if (pa) { avviaParte(pa.dataset.parte, +pa.dataset.k); return; }
    if (!e.target.closest("#aoggi")) return;
    Tasti.play("tick"); fermaTimer(); ATTIVA = null; PARTE = null; scegli(luogo, giornoSuggerito(luogo).ix); Tasti.land($("#titolo"));
  });
  $("#t").addEventListener("input", function (e) {
    var prima = $("#min").textContent;
    budget = +e.target.value; scatto(e.target); renderDial(); renderBlocchi(); salvaUI();
    if ($("#min").textContent !== prima) Tasti.land($("#min"), { dy: 4, fade: .2 });
  });
  $("#presets").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    Tasti.play("tick"); budget = +b.dataset.v; renderDial(); renderBlocchi(); salvaUI(); Tasti.land($("#min"));
  });

  function exCtx(el) {
    var ex = el.closest(".ex"); if (!ex) return null;
    var bi = +ex.dataset.b, ei = +ex.dataset.e;
    return { el: ex, key: ex.dataset.key, bi: bi, ei: ei, x: R.blocchi[bi].ex[ei], e: R.blocchi[bi].ex[ei].e };
  }
  function applicaCarico(c, val) {
    CARICHI.loads[c.key] = val; segnaCarico(c.key); salvaCarichi();
    var s = sedutaOggi();
    if (s && s.ex[c.key]) { s.ex[c.key].load = val; s.ex[c.key].kg = kgDi(val); salva(s); }
    var chip = c.el && $(".chip.load", c.el);
    if (chip) { chip.innerHTML = esc(val) + '<span class="pen">✎</span>'; chip.classList.add("mod"); }
  }

  $("#blocks").addEventListener("click", function (ev) {
    var t = ev.target, c;
    var set = t.closest(".set");
    if (set) {
      c = exCtx(set);
      var s = assicuraSeduta(), r = assicuraEx(s, c.key, c.e, c.x), j = +set.dataset.j;
      var on = set.getAttribute("aria-pressed") !== "true";
      r.done[j] = on; salva(s); Tasti.haptic();
      set.setAttribute("aria-pressed", on); set.textContent = on ? "✓" : set.dataset.txt;
      progresso(); tieniAcceso(); renderSelettori();
      if (on) recuperoAuto(c.bi, c.ei, j);
      return;
    }
    if (t.closest("[data-ed]")) { c = exCtx(t); var ed = $(".ledit", c.el); ed.hidden = !ed.hidden; if (!ed.hidden) $(".lval", ed).focus(); return; }
    var stp = t.closest(".stp");
    if (stp) { c = exCtx(stp); var inp = $(".lval", c.el); inp.value = passo(c.e, inp.value, +stp.dataset.d); applicaCarico(c, inp.value); renderBlocchi(); return; }
    if (t.closest(".lreset")) {
      c = exCtx(t); delete CARICHI.loads[c.key]; segnaCarico(c.key); salvaCarichi();
      var s2 = sedutaOggi(); if (s2 && s2.ex[c.key]) { s2.ex[c.key].load = c.e.load; s2.ex[c.key].kg = kgDi(c.e.load); salva(s2); }
      renderBlocchi(); return;
    }
    var sk = t.closest("[data-sugkey]");
    if (sk) { applicaCarico({ key: sk.dataset.sugkey, el: null }, sk.dataset.sug); renderBlocchi(); return; }
    var sug = t.closest("[data-sug]");
    if (sug) { c = exCtx(sug); applicaCarico(c, sug.dataset.sug); renderBlocchi(); return; }
    if (t.closest(".nbtn")) { c = exCtx(t); var nb = $(".exnote", c.el); nb.hidden = !nb.hidden; if (!nb.hidden) $("textarea", nb).focus(); return; }
    var rb = t.closest(".restbtn");
    if (rb) { avviaTimer(+rb.dataset.sec, "Recupero"); return; }
  });

  $("#blocks").addEventListener("input", function (ev) {
    var t = ev.target, c = exCtx(t); if (!c) return;
    if (t.classList.contains("lval")) { applicaCarico(c, t.value); return; }
    var s = assicuraSeduta(), r = assicuraEx(s, c.key, c.e, null);
    if (t.classList.contains("reps")) r.reps = t.value;
    else if (t.tagName === "TEXTAREA") { r.note = t.value; $(".nbtn", c.el).classList.toggle("has", !!t.value.trim()); }
    salva(s);
  });

  $("#scmt").addEventListener("input", function (e) { var s = assicuraSeduta(); s.comment = e.target.value; salva(s); });

  $("#reset").addEventListener("click", function () {
    var b = $("#reset");
    if (!sedutaOggi()) return;
    if (!b.dataset.armed) {
      b.dataset.armed = "1"; b.textContent = "Sicuro? Tocca di nuovo"; b.classList.add("danger");
      setTimeout(function () { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = "Azzera seduta"; b.classList.remove("danger"); } }, 3500);
      return;
    }
    cancella(sid()); fermaTimer(); renderAllena();
  });

  /* ===================== una cosa alla volta ===================== */
  // Un esercizio per schermata, a tutto schermo. Salva esattamente come i cerchi della lista
  // (assicuraSeduta / assicuraEx / recuperoAuto): lista e schermata restano sempre allineate.
  var F = { open: false, pos: 0, pick: null, q: [] };
  var ORD = ["prima", "seconda", "terza", "quarta", "quinta", "sesta"];

  function recDi(bi, ei) {
    var s = sedutaOggi(), x = R.blocchi[bi].ex[ei], r = s && s.ex ? s.ex[KEYS[bi][ei]] : null;
    return r && !!r.myo === !!x.myo ? r : null;   // cambiata modalità (myo/normale): le serie ripartono, come nella lista
  }
  function fatto(it) { var r = recDi(it.bi, it.ei); return !!(r && r.done && r.done[it.j]); }
  // l'ordine delle serie: sequenza.js (superserie a giri, myo di fila, come nel motore del tempo)
  function codaF() { return Sequenza.coda(R); }
  // i tasti delle ripetizioni: il range della scheda più una (se ne fai di più, si vede)
  function tastiRip(e, x, j) {
    if (e.hold) return [];
    if (x.myo && j > 0) return [3, 4, 5, 6];
    var m = String(e.reps).match(/(\d+)\s*[–-]\s*(\d+)/), out = [], k;
    if (m) {
      var lo = +m[1], hi = +m[2], span = hi - lo;
      if (span <= 4) for (k = lo; k <= hi + 1; k++) out.push(k);
      else out = [lo, lo + Math.round(span / 3), lo + Math.round(2 * span / 3), hi, hi + 1];
    } else {
      var c = /max/i.test(e.reps) ? (e.r || 10) : (+(String(e.reps).match(/\d+/) || [])[0] || e.r || 10);
      for (k = c - 2; k <= c + 2; k++) if (k > 0) out.push(k);
    }
    return out;
  }
  function ripDi(r, j) { var a = String((r && r.reps) || "").split(/[-\s,;/]+/); return /^\d+$/.test(a[j] || "") ? +a[j] : null; }
  // scrive la ripetizione nella stringa della seduta ("10-9-8"), allo stesso posto della serie
  function scriviRip(r, j, n) {
    var a = String(r.reps || "").trim() ? String(r.reps).trim().split(/[-\s,;/]+/) : [];
    while (a.length < j) a.push("?");
    a[j] = String(n); r.reps = a.join("-");
  }

  // "8–10/lato" → "8–10 ripetizioni per lato"
  function ripTesto(reps) { var r = String(reps); return /\//.test(r) ? esc(r.replace(/\/\s*(\w+)/, " ripetizioni per $1")) : esc(r) + " ripetizioni"; }

  /* cronometro delle tenute (plank, hollow hold): 3 s per mettersi in posizione, poi il conto alla rovescia */
  var TEN = null;
  function tenutaTesto() {
    var ora = Date.now();
    if (ora < TEN.via) { TEN.pronto = true; return String(Math.ceil((TEN.via - ora) / 1000)); }
    TEN.pronto = false; return String(Math.max(0, Math.ceil((TEN.fine - ora) / 1000)));
  }
  function avviaTenuta(id, sec) {
    fermaTenuta();
    var t0 = Date.now();
    TEN = { id: id, via: t0 + 3000, fine: t0 + 3000 + sec * 1000, s: null, pronto: true };
    TEN.timer = setInterval(function () {
      if (!TEN) return;
      var fase = Date.now() < TEN.via ? "pronto" : "tieni";
      if (fase !== TEN.fase) {                       // da «in posizione» a «tieni»: suono deciso e ridisegno
        var via = TEN.fase === "pronto"; TEN.fase = fase; TEN.s = null;
        if (via) { Tasti.play("space"); Tasti.haptic(); }
        renderF(true); return;
      }
      var testo = tenutaTesto(), el = $("#fbig");
      if (testo !== TEN.s) {
        TEN.s = testo;
        if (el) { el.textContent = testo; Tasti.land(el, { dy: 5, fade: .3 }); }
        if (fase === "pronto" || (+testo <= 3 && +testo > 0)) Tasti.play("tick", { vol: .55 });
      }
      if (Date.now() >= TEN.fine) { fermaTenuta(); Tasti.play("gong"); Tasti.haptic([200, 100, 200]); renderF(true); }
    }, 100);
    renderF(true);
  }
  function fermaTenuta() { if (TEN) clearInterval(TEN.timer); TEN = null; }

  function renderF(anim) {
    if (!F.open || !R) return;
    F.q = codaF();
    // spostandoti su un'altra serie il cronometro della tenuta si ferma
    if (TEN && F.q[F.pos] && TEN.id !== KEYS[F.q[F.pos].bi][F.q[F.pos].ei] + ":" + F.q[F.pos].j) fermaTenuta();
    if (!F.q.length) { chiudiF(); return; }
    if (F.pos >= F.q.length) F.pos = F.q.length - 1;
    var it = F.q[F.pos], b = R.blocchi[it.bi], x = b.ex[it.ei], e = x.e, key = KEYS[it.bi][it.ei];
    var fatti = F.q.filter(fatto).length, finita = fatti === F.q.length;
    var live = b.ex.filter(function (y) { return y.n > 0; }).length;
    var nb = R.blocchi.slice(0, it.bi + 1).filter(function (bb) { return bb.tempo; }).length;
    $("#fbars").innerHTML = F.q.map(function (q, k) { return '<i class="' + (fatto(q) ? 'd' : k === F.pos ? 'c' : '') + '"></i>'; }).join("");
    $("#fblk").textContent = "Blocco " + nb + (live > 1 ? " · superserie" : "");
    $("#fcnt").textContent = fatti + " / " + F.q.length + " serie";
    var dw = $("#fdonew"), hero = "", ctl = "";

    // la seduta intera a lato, con le serie di ogni esercizio (si vede solo sul desktop)
    var visti = {}, rail = "", bloccoPrima = -1, nbl = 0;
    F.q.forEach(function (q) {
      var id = q.bi + ":" + q.ei; if (visti[id]) return; visti[id] = 1;
      var serieEs = [];
      F.q.forEach(function (z, kk) { if (z.bi === q.bi && z.ei === q.ei) serieEs.push({ z: z, kk: kk }); });
      var mancanti = serieEs.filter(function (o) { return !fatto(o.z); });
      if (q.bi !== bloccoPrima) { bloccoPrima = q.bi; nbl++; rail += '<div class="frb">Blocco ' + nbl + '</div>'; }
      rail += '<button type="button" class="fr' + (it.bi === q.bi && it.ei === q.ei ? ' cur' : '') + (mancanti.length ? '' : ' ok') + '" data-p="' + (mancanti[0] || serieEs[0]).kk + '">' +
        '<span class="frn">' + esc(R.blocchi[q.bi].ex[q.ei].e.name) + '</span><span class="frd">' +
        serieEs.map(function (o) { return '<i class="' + (fatto(o.z) ? 'd' : o.kk === F.pos ? 'c' : '') + '"></i>'; }).join("") + '</span></button>';
    });
    $("#frail").innerHTML = '<div class="frh">' + esc(G().nome) + '<span class="sub">' + sottotitolo(G().sub) + '</span></div>' + rail;

    if (TIMER) {
      // recupero: il conto alla rovescia prende il centro, Fatta diventa Salta
      // dopo il recupero si riparte da dove sei arrivato (F.pos), non dal primo esercizio lasciato indietro
      var dopo = !fatto(it) ? it : F.q.filter(function (q) { return !fatto(q); })[0], nx = dopo ? R.blocchi[dopo.bi].ex[dopo.ei].e : e;
      $("#fname").textContent = nx.name; $("#fvid").href = VID(nx.v); $("#fcue").textContent = "";
      var carDopo = dopo ? caricoDi(KEYS[dopo.bi][dopo.ei], nx) : "";
      var xDopo = dopo ? R.blocchi[dopo.bi].ex[dopo.ei] : null, breve = TIMER.tot <= 20;
      var cosa = !dopo ? 'basta' : xDopo.myo ? (dopo.j === 0 ? 'attivazione' : 'mini-serie ' + dopo.j) : (dopo.j + 1) + 'ª serie';
      hero = '<div class="fserie">' + (breve ? 'Respiri' : 'Recupero') + ', poi <em>' + cosa + '</em></div>' +
        '<div class="fhuge rest" id="fT">' + fmtT((TIMER.fine - Date.now()) / 1000) + '</div><div class="ftarget">' + esc(TIMER.label) +
        (carDopo ? ' · <b class="fcar">' + esc(carDopo) + '</b>' + (nx.paio ? ' · ' + PAIO[nx.paio] : '') : '') + '</div>';
      ctl = '<div class="freps"><button type="button" class="key sm" data-f="piu"><span class="cap"><span class="kw">+15 s</span></span></button></div><div class="fhint">Fatta salta il recupero</div>';
      dw.textContent = "Salta";
    } else if (finita) {
      $("#fname").textContent = ""; $("#fcue").textContent = ""; $("#fblk").textContent = "Seduta finita";
      hero = '<div class="fend"><h2>Fatto, <em>bravo</em>.</h2><div class="ftarget" style="margin-top:12px">' + F.q.length + ' serie · ' + esc(G().nome) +
        '. Scrivi com\'è andata nella lista, se ti va.</div></div>';
      dw.textContent = "Chiudi";
    } else {
      var r = recDi(it.bi, it.ei), gia = fatto(it), load = caricoDi(key, e), num = !!numMatch(load);
      var last = ultimaVolta(key), sug = suggerimento(e, last, load);
      if (F.pick == null) F.pick = ripDi(r, it.j);
      $("#fname").textContent = e.name; $("#fvid").href = VID(e.v);
      $("#fcue").textContent = e.cue || "";
      var lab, big, tgt;
      if (x.myo) {
        lab = it.j === 0 ? 'Serie di <em>attivazione</em>' : 'La <em>' + ORD[it.j - 1] + '</em> mini-serie di 3';
        big = it.j === 0 ? "S" : String(it.j);
        tgt = it.j === 0 ? ripTesto(e.reps) + ', finché ne restano 0–1 · poi 3 mini-serie' : '3–5 ripetizioni · prima 3–5 respiri';
      } else {
        lab = 'La <em>' + ORD[it.j] + '</em> serie di ' + x.n;
        big = String(it.j + 1);
        tgt = (e.hold ? esc(e.reps) : ripTesto(e.reps)) + (e.rir ? ' · RIR ' + esc(e.rir) : '') + (live > 1 || x.n > 1 ? ' · rec ' + b.rest + ' s' : '');
      }
      if (TEN && TEN.id === key + ":" + it.j) { big = tenutaTesto(); lab = TEN.pronto ? 'Mettiti in <em>posizione</em>' : '<em>Tieni</em>'; }
      hero = '<div class="fserie">' + lab + (gia ? ' · <span style="color:var(--ok)">fatta</span>' : '') + '</div>' +
        '<div class="fhuge' + (big === "S" ? ' word' : '') + '" id="fbig">' + big + '</div><div class="ftarget">' + tgt + '</div>' +
        (it.j === 0 && e.k === "bil" ? (b.ramp ? '<div class="framp"><b>Prima: ramp-up</b> · bilanciere vuoto × 5' + (b.ramp >= 100 ? ' → × 3 al ~60%' : '') + '</div>'
          : '<div class="framp"><b>Prima: avvicinamento</b> · 1 × 5 a metà carico, non conta</div>') : '') +
        (it.primo && b.scarico ? '<div class="framp"><b>Prima: smonta</b> · i dischi del blocco prima servono qui</div>' : '');
      // il prossimo esercizio col suo carico: in superserie si preparano tutti e due prima di partire
      var pk = -1;
      for (var kk = 1; kk < F.q.length; kk++) {
        var cand = F.q[(F.pos + kk) % F.q.length];
        if (!fatto(cand) && !(cand.bi === it.bi && cand.ei === it.ei)) { pk = (F.pos + kk) % F.q.length; break; }
      }
      ctl = "";
      if (pk >= 0) {
        var pq = F.q[pk], pe = R.blocchi[pq.bi].ex[pq.ei].e, pcar = caricoDi(KEYS[pq.bi][pq.ei], pe);
        ctl += '<button type="button" class="fnext" data-f="vai" data-p="' + pk + '"><span class="fnl">' +
          (pq.bi === it.bi && pq.j === it.j ? 'Subito dopo' : 'Poi') + '</span><span class="fnn">' + esc(pe.name) + '</span>' +
          (pcar ? '<span class="fnc">' + esc(pcar) + (pe.paio ? '<i class="paio-' + pe.paio + '">' + (pe.paio === "metallo" ? "metallo" : "leggeri") + '</i>' : '') + '</span>' : '') + '</button>';
      }
      ctl += '<div class="fload">' +
        (num ? '<button type="button" class="key sm" data-f="meno"><span class="cap"><span class="kw">' + passoTesto(e, load, -1) + '</span></span></button>' : '') +
        '<button type="button" class="val' + (num ? '' : ' txt') + '" id="fld" data-f="scrivi" aria-label="Scrivi il carico: ' + esc(load || "nessuno") + '">' +
        (num ? (function () { var mm = numMatch(load); return esc(load.slice(0, mm.index)) + esc(load.substr(mm.index, mm[1].length)) + '<small>' + esc(load.slice(mm.index + mm[1].length).trim()) + '</small>'; })() : esc(load || "—")) +
        '<span class="pen" aria-hidden="true">✎</span></button>' +
        (num ? '<button type="button" class="key sm" data-f="piu1"><span class="cap"><span class="kw">' + passoTesto(e, load, 1) + '</span></span></button>' : '') + '</div>';
      var mh = montaHTML(e, load, "chip");
      if (e.paio || mh) ctl += '<div class="fpaio">' + (e.paio ? paioHTML(e, "paio") : '') + mh + '</div>';
      ctl += avvisoBlocco(it.bi, b, "fpaio");
      var tr = tastiRip(e, x, it.j);
      if (e.hold) ctl += '<div class="freps"><button type="button" class="key sm' + (TEN ? ' on' : '') + '" data-f="tenuta"><span class="cap"><span class="kw">' +
        (TEN ? 'Ferma' : '▶ Avvia ' + e.hold + ' s') + '</span></span></button></div>';
      if (tr.length) ctl += '<div class="freps" role="group" aria-label="Ripetizioni fatte">' + tr.map(function (n) {
        return '<button type="button" class="key sm' + (F.pick === n ? ' on' : '') + '" data-r="' + n + '" aria-pressed="' + (F.pick === n) + '"><span class="cap"><span class="kw">' + n + '</span></span></button>';
      }).join("") + '</div>';
      var hint = "";
      if (sug && sug.tipo === "carico") hint = '<button type="button" class="chip sug" data-f="sug" data-sug="' + esc(sug.nuovo) + '">↑ L\'ultima volta hai chiuso tutto: prova ' + esc(sug.nuovo) + '</button>';
      else if (last) hint = 'Ultima volta ' + dmy(last.s.date) + ': ' + esc(last.r.load || "—") + (last.r.reps ? ' · ' + esc(last.r.reps) : '') + ' · ' + fmtNum(serieEff(last.r)) + ' serie';
      else if (tr.length) hint = 'Tocca le ripetizioni fatte, poi Fatta';
      ctl += '<div class="fhint">' + hint + '</div>';
      dw.textContent = gia ? "Avanti" : "Fatta";
    }
    $("#fhero").innerHTML = hero; $("#fctl").innerHTML = ctl;
    $("#fvid").hidden = finita && !TIMER;
    $("#fprev").disabled = !!TIMER || finita || F.pos === 0;
    $("#fnext").disabled = !!TIMER || finita || F.pos >= F.q.length - 1;
    if (anim) { Tasti.land($("#fname"), { dy: 12 }); Tasti.land($("#fbig") || $("#fT") || $(".fend"), { dy: 16 }); }
  }

  // carico scritto a mano (dischi strani come 1,25 kg): tocchi il numero, si apre il tastierino numerico.
  // Cambia solo il numero e lascia il resto ("24 kg/man" → "23,25 kg/man"); se non c'è un numero ("corpo libero")
  // si scrive il testo intero ("zaino 5 kg").
  function scriviCarico(key, e) {
    var cur = caricoDi(key, e), m = numMatch(cur), box = $("#fld"); if (!box) return;
    var unita = m ? cur.slice(m.index + m[1].length).trim() : "";
    var f = document.createElement("form");
    f.className = "fedit"; f.id = "fedit";
    f.innerHTML = '<input id="fin" ' + (m ? 'inputmode="decimal" enterkeyhint="done"' : 'enterkeyhint="done"') + ' autocomplete="off" aria-label="Carico" value="' +
      esc(m ? m[1].replace(".", ",") : cur) + '">' + (unita ? '<span class="un">' + esc(unita) + '</span>' : '') + '<button type="submit" class="btn pri">OK</button>';
    box.replaceWith(f);
    var inp = $("#fin"), fatto2 = false;
    inp.focus(); inp.select();
    var conferma = function () {
      if (fatto2) return; fatto2 = true;
      var v = inp.value.trim(), nuovo = cur;
      if (m) {
        var n = parseFloat(v.replace(",", "."));
        if (isFinite(n) && n >= 0 && n <= 500) nuovo = cur.slice(0, m.index) + String(Math.round(n * 100) / 100).replace(".", ",") + cur.slice(m.index + m[1].length);
      } else if (v) nuovo = v;
      if (nuovo !== cur) { applicaCarico({ key: key, el: null }, nuovo); Tasti.play("down"); Tasti.haptic(); }
      renderF(); if (nuovo !== cur) Tasti.land($("#fld"), { dy: 6, fade: .2 });
    };
    f.addEventListener("submit", function (ev) { ev.preventDefault(); conferma(); });
    inp.addEventListener("blur", function () { setTimeout(conferma, 120); });   // tocchi fuori: vale come OK
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { fatto2 = true; renderF(); } });
  }

  function prossima(da) {
    for (var k = 1; k <= F.q.length; k++) { var p = (da + k) % F.q.length; if (!fatto(F.q[p])) return p; }
    return da;
  }
  function apriF() {
    if (!R) return;
    F.q = codaF(); if (!F.q.length) return;
    var p = F.q.findIndex(function (q) { return !fatto(q); });
    F.open = true; F.pos = p < 0 ? 0 : p; F.pick = null;
    $("#focus").hidden = false; document.body.classList.add("focus");
    try { history.pushState({ f: 1 }, ""); } catch (_) {}
    renderF(true); tieniAcceso(); salvaUI();
  }
  function chiudiF(daIndietro) {
    if (!F.open) return;
    fermaTenuta();
    F.open = false; $("#focus").hidden = true; document.body.classList.remove("focus"); salvaUI();
    renderBlocchi();
    if (!daIndietro && history.state && history.state.f) { F.salta = true; try { history.back(); } catch (_) { F.salta = false; } }
  }
  // il gesto "indietro" dell'iPhone chiude la schermata invece di uscire dall'app
  // (il "back" fatto da chiudiF arriva dopo, anche se nel frattempo la schermata è stata riaperta: si ignora)
  window.addEventListener("popstate", function () {
    if (F.salta) {
      F.salta = false;
      if (F.open && !(history.state && history.state.f)) { try { history.pushState({ f: 1 }, ""); } catch (_) {} }
      return;
    }
    if (F.open) chiudiF(true);
  });

  function segnaF() {
    var it = F.q[F.pos], x = R.blocchi[it.bi].ex[it.ei], key = KEYS[it.bi][it.ei];
    var gia = fatto(it), s = assicuraSeduta(), r = assicuraEx(s, key, x.e, x);
    r.done[it.j] = true;
    if (F.pick != null) scriviRip(r, it.j, F.pick);
    salva(s); tieniAcceso(); Tasti.haptic();
    F.pick = null; F.pos = prossima(F.pos);
    renderBlocchi(); renderSelettori();
    var prima = TIMER;
    if (!gia) recuperoAuto(it.bi, it.ei, it.j);   // fa partire il recupero (e ridisegna) se serve
    if (TIMER === prima) renderF(true);
  }
  $("#fdone").addEventListener("click", function () {
    if (TIMER) { fermaTimer(); renderF(true); return; }
    if (F.q.length && F.q.every(fatto)) { chiudiF(); return; }
    segnaF();
  });
  $("#fprev").addEventListener("click", function () { if (F.pos > 0) { F.pos--; F.pick = null; renderF(true); } });
  $("#fnext").addEventListener("click", function () { if (F.pos < F.q.length - 1) { F.pos++; F.pick = null; renderF(true); } });
  $("#fclose").addEventListener("click", function () { Tasti.play("tick"); chiudiF(); });
  $("#fgo").addEventListener("click", apriF);
  $("#frail").addEventListener("click", function (e) {
    var b = e.target.closest("[data-p]"); if (!b || TIMER) return;
    Tasti.play("tick"); F.pos = +b.dataset.p; F.pick = null; renderF(true);
  });
  $("#fctl").addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-f],[data-r]"); if (!t) return;
    Tasti.haptic();
    if (t.dataset.r) { var n = +t.dataset.r; F.pick = F.pick === n ? null : n; renderF(); return; }
    var it = F.q[F.pos], x = R.blocchi[it.bi].ex[it.ei], key = KEYS[it.bi][it.ei], f = t.dataset.f;
    if (f === "piu") { piu15(); return; }
    if (f === "vai") { Tasti.play("tick"); F.pos = +t.dataset.p; F.pick = null; renderF(true); return; }
    if (f === "scrivi") { scriviCarico(key, x.e); return; }
    if (f === "tenuta") { if (TEN) { fermaTenuta(); renderF(); } else avviaTenuta(key + ":" + it.j, x.e.hold); return; }
    if (f === "meno" || f === "piu1") {
      var load = caricoDi(key, x.e);
      applicaCarico({ key: key, el: null }, passo(x.e, load, f === "meno" ? -1 : 1));
      renderF(); Tasti.land($("#fld"), { dy: f === "meno" ? 6 : -6, fade: .2 }); return;
    }
    if (f === "sug") { Tasti.play("tick"); applicaCarico({ key: key, el: null }, t.dataset.sug); renderF(); Tasti.land($("#fld")); }
    if (f === "sugk") { Tasti.play("tick"); applicaCarico({ key: t.dataset.sugkey, el: null }, t.dataset.sug); renderF(); }
  });

  /* ===================== tastiera del PC ===================== */
  function nelCampo(e) { return e.target.closest && e.target.closest("input,textarea,select,[contenteditable]"); }
  document.addEventListener("keydown", function (e) {
    if (nelCampo(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (F.open) {
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); Tasti.press($("#fdone")); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); Tasti.press($("#fprev")); }
      else if (e.code === "ArrowRight") { e.preventDefault(); Tasti.press($("#fnext")); }
      else if (e.code === "Escape") { e.preventDefault(); chiudiF(); }
    } else if (vista === "allena" && e.code === "Space") { e.preventDefault(); Tasti.press($("#fgo")); }
  });
  document.addEventListener("keyup", function (e) { if (e.code === "Space" && !nelCampo(e)) e.preventDefault(); });

  /* ===================== suoni (Guida) ===================== */
  function renderSuoni() {
    var p = Tasti.prefs();
    $$("#sw button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === p.switch); });
    $("#svol").value = p.volume; $("#svol").style.setProperty("--p", p.volume * 100 + "%");
    $("#son").checked = !!p.on;
  }
  $("#sw").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    Tasti.set({ switch: b.dataset.v, on: true }); renderSuoni();
    setTimeout(function () { Tasti.play("down"); setTimeout(function () { Tasti.play("up", { vol: .7 }); }, 90); }, 10);
  });
  $("#svol").addEventListener("input", function (e) { Tasti.set({ volume: +e.target.value }); e.target.style.setProperty("--p", e.target.value * 100 + "%"); });
  $("#svol").addEventListener("change", function () { Tasti.play("down"); });
  $("#son").addEventListener("change", function (e) { Tasti.set({ on: e.target.checked }); if (e.target.checked) Tasti.play("down"); });
  renderSuoni();

  /* ===================== storico ===================== */
  function tutteSedute() {
    return Object.keys(SEDUTE).map(function (k) { return SEDUTE[k]; })
      .filter(function (s) { return s && s.date && s.ex; }).sort(ordineSedute);
  }
  function nomeGiorno(key) { var p = key.split(":"); return (p[0] === "vacanza" ? "Vac. " : "") + (p[1] || ""); }
  function catalogo() {
    var m = {};
    tutteSedute().forEach(function (s) {
      Object.keys(s.ex).forEach(function (k) {
        var r = s.ex[k]; if (!haSerie(r)) return;
        if (!m[k]) m[k] = { key: k, name: r.name || k, n: 0, kg: 0 };
        m[k].n++; if (r.kg != null) m[k].kg++; if (r.name) m[k].name = r.name;
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.kg - a.kg || b.n - a.n || a.name.localeCompare(b.name); });
  }
  function serie(key) {
    var out = [];
    tutteSedute().forEach(function (s) {
      var r = s.ex[key]; if (!haSerie(r)) return;
      var rs = (String(r.reps || "").match(/\d+/g) || []).reduce(function (a, b) { return a + (+b); }, 0);
      out.push({ date: s.date, kg: r.kg == null ? null : r.kg, reps: r.reps || "", vol: (r.kg != null && rs) ? Math.round(r.kg * rs) : null,
        note: r.note || "", done: serieEff(r), tot: r.myo ? 2.5 : (r.tot || serieEff(r)), myo: !!r.myo, load: r.load || "" });
    });
    return out;
  }

  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) { var c0 = hi; lo = Math.max(0, c0 - 1); hi = c0 + 1; }
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var nz = raw / mag, step = (nz <= 1 ? 1 : nz <= 2 ? 2 : nz <= 2.5 ? 2.5 : nz <= 5 ? 5 : 10) * mag, out = [];
    for (var v = Math.floor(lo / step) * step; v <= hi + step * 1e-6; v += step) if (v >= lo - step * 1e-6) out.push(Math.round(v * 1e6) / 1e6);
    return out.length > 1 ? out : [lo, hi];
  }
  function scalaY(vals) {
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi === lo) { var d = Math.max(1, Math.abs(lo) * 0.06); hi = lo + d; lo = Math.max(0, lo - d); }
    var p = (hi - lo) * 0.14; lo = Math.max(0, lo - p); hi += p;
    var t = niceTicks(lo, hi, 3);
    return { lo: Math.min(lo, t[0]), hi: Math.max(hi, t[t.length - 1]), ticks: t };
  }
  function grafLinea(pts, field, unit, title, cap) {
    var W = 340, H = 172, Lm = 38, Rm = 14, T = 14, B = 26;
    var vp = pts.filter(function (p) { return p[field] != null; });
    if (!vp.length) return '<div class="chartbox"><h4>' + esc(title) + '</h4><p class="cap2">Nessun dato numerico ancora. Scrivi le ripetizioni per vedere il volume.</p></div>';
    var sc = scalaY(vp.map(function (p) { return p[field]; }));
    var x0 = dnum(vp[0].date), x1 = dnum(vp[vp.length - 1].date);
    var px = function (d) { return (vp.length < 2 || x1 === x0) ? Lm + (W - Lm - Rm) / 2 : Lm + (dnum(d) - x0) / (x1 - x0) * (W - Lm - Rm); };
    var py = function (v) { return T + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - T - B); };
    var g = "";
    sc.ticks.forEach(function (t) {
      var y = py(t).toFixed(1);
      g += '<line class="gl" x1="' + Lm + '" y1="' + y + '" x2="' + (W - Rm) + '" y2="' + y + '"/><text class="ax" x="' + (Lm - 6) + '" y="' + (+y + 3) + '" text-anchor="end">' + fmtNum(t) + '</text>';
    });
    var pp = vp.map(function (p) { return px(p.date).toFixed(1) + "," + py(p[field]).toFixed(1); });
    if (vp.length > 1) {
      g += '<path class="ar" d="M' + pp.join("L") + 'L' + px(vp[vp.length - 1].date).toFixed(1) + ',' + (H - B) + 'L' + px(vp[0].date).toFixed(1) + ',' + (H - B) + 'Z"/>';
      g += '<polyline class="ln" points="' + pp.join(" ") + '"/>';
    }
    vp.forEach(function (p) { g += '<circle class="pt' + (p.note ? ' note' : '') + '" cx="' + px(p.date).toFixed(1) + '" cy="' + py(p[field]).toFixed(1) + '" r="4"/>'; });
    var last = vp[vp.length - 1], lx = px(last.date), ly = py(last[field]);
    g += '<text class="dlab" x="' + lx.toFixed(1) + '" y="' + Math.max(T + 9, ly - 10).toFixed(1) + '" text-anchor="' + (lx > W - Rm - 34 ? 'end' : 'middle') + '">' + fmtNum(last[field]) + unit + '</text>';
    g += '<text class="ax" x="' + Lm + '" y="' + (H - 8) + '">' + dmy(vp[0].date) + '</text>';
    if (vp.length > 1) g += '<text class="ax" x="' + (W - Rm) + '" y="' + (H - 8) + '" text-anchor="end">' + dmy(last.date) + '</text>';
    vp.forEach(function (p, i) {
      var cx = px(p.date), a = i ? (px(vp[i - 1].date) + cx) / 2 : Lm, b = i < vp.length - 1 ? (cx + px(vp[i + 1].date)) / 2 : W - Rm;
      var x = Math.min(a, cx), w = Math.max(16, b - x);
      var tip = dmy(p.date) + " · " + fmtNum(p[field]) + unit + (p.reps ? " · " + p.reps + " rip" : "") + " · " + fmtNum(p.done) + " serie" + (p.note ? "\n" + p.note : "");
      g += '<rect class="hit" x="' + x.toFixed(1) + '" y="' + T + '" width="' + w.toFixed(1) + '" height="' + (H - T - B) + '" data-tip="' + esc(tip) + '"/>';
    });
    return '<div class="chartbox"><h4>' + esc(title) + '</h4><p class="cap2">' + esc(cap) + '</p><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + g + '</svg><div class="tip"></div></div>';
  }
  function lunedi(ds) {
    var p = String(ds).split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  function serieSettimana(s) { return Object.keys(s.ex).reduce(function (a, k) { return a + serieEff(s.ex[k]); }, 0); }
  function grafSettimane(ss) {
    var agg = {};
    ss.forEach(function (s) { var w = lunedi(s.date); agg[w] = (agg[w] || 0) + serieSettimana(s); });
    var base = dnum(lunedi(oggi())), weeks = [];
    for (var i = 11; i >= 0; i--) { var t = new Date(base); t.setUTCDate(t.getUTCDate() - i * 7); var k = t.toISOString().slice(0, 10); weeks.push({ w: k, n: agg[k] || 0 }); }
    var W = 340, H = 150, Lm = 30, Rm = 8, T = 12, B = 24;
    var max = Math.max.apply(null, weeks.map(function (x) { return x.n; }));
    var tk = niceTicks(0, Math.max(max, 1), 3), hi = Math.max(max, tk[tk.length - 1]);
    var py = function (v) { return T + (1 - v / hi) * (H - T - B); }, bw = (W - Lm - Rm) / weeks.length, g = "";
    tk.forEach(function (t) { var y = py(t).toFixed(1); g += '<line class="gl" x1="' + Lm + '" y1="' + y + '" x2="' + (W - Rm) + '" y2="' + y + '"/><text class="ax" x="' + (Lm - 6) + '" y="' + (+y + 3) + '" text-anchor="end">' + fmtNum(t) + '</text>'; });
    weeks.forEach(function (x, i) {
      var bx = Lm + i * bw + 1, w = Math.max(3, bw - 2);
      if (x.n > 0) { var y = py(x.n), h = (H - B) - y, r = Math.min(4, w / 2, h);
        g += '<path class="br" d="M' + bx.toFixed(1) + ',' + (y + h).toFixed(1) + 'V' + (y + r).toFixed(1) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',-' + r + 'h' + (w - 2 * r).toFixed(1) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'V' + (y + h).toFixed(1) + 'Z"/>'; }
      g += '<rect class="hit" x="' + bx.toFixed(1) + '" y="' + T + '" width="' + w.toFixed(1) + '" height="' + (H - T - B) + '" data-tip="' + esc("Settimana del " + dmy(x.w) + " · " + fmtNum(x.n) + " serie") + '"/>';
      if (i % 3 === 0) g += '<text class="ax" x="' + (bx + w / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + dmy(x.w) + '</text>';
    });
    return '<div class="chartbox"><h4>Serie per settimana</h4><p class="cap2">Ultime 12 settimane. Un myo-reps completo conta 2,5 serie.</p><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Serie per settimana">' + g + '</svg><div class="tip"></div></div>';
  }

  function renderStorico() {
    var ss = tutteSedute().filter(function (s) { return Object.keys(s.ex).some(function (k) { return haSerie(s.ex[k]) || s.ex[k].note; }) || s.comment; });
    var box = $("#hist");
    if (!ss.length) {
      box.innerHTML = '<div class="card"><div class="empty">Lo storico è vuoto: si riempie da solo.<br>Segna le serie mentre ti alleni e ogni seduta finisce qui, con carichi, ripetizioni e note.</div></div>';
      return;
    }
    var t = oggi(), d30 = dnum(t) - 30 * 864e5, wk = lunedi(t);
    var n30 = ss.filter(function (s) { return dnum(s.date) >= d30; }).length;
    var sett = ss.filter(function (s) { return lunedi(s.date) === wk; }).reduce(function (a, s) { return a + serieSettimana(s); }, 0);
    var conMin = ss.filter(function (s) { return s.minuti; });
    var medi = conMin.length ? Math.round(conMin.reduce(function (a, s) { return a + s.minuti; }, 0) / conMin.length) : null;
    var h = '<div class="tiles"><div class="tile"><div class="k">Sedute ultimi 30 gg</div><div class="v">' + n30 + '</div></div>' +
      '<div class="tile"><div class="k">Serie questa settimana</div><div class="v">' + fmtNum(sett) + '</div></div>' +
      '<div class="tile"><div class="k">Durata media scelta</div><div class="v">' + (medi ? medi + '′' : '—') + '</div></div></div>';

    var cat = catalogo();
    if (cat.length) {
      if (!HX || !cat.some(function (c) { return c.key === HX; })) HX = cat[0].key;
      var pts = serie(HX), hasVol = pts.filter(function (p) { return p.vol != null; }).length >= 2;
      if (HMODE === "vol" && !hasVol) HMODE = "kg";
      var field = HMODE === "vol" ? "vol" : "kg";
      var cur = cat.filter(function (c) { return c.key === HX; })[0];
      var unit = HMODE === "vol" ? "" : unitaDi((pts[pts.length - 1] || {}).load);
      h += '<div class="pick"><select id="hx" aria-label="Esercizio">' + cat.map(function (c) {
        return '<option value="' + esc(c.key) + '"' + (c.key === HX ? ' selected' : '') + '>' + esc(c.name) + ' · ' + esc(nomeGiorno(c.key)) + ' (' + c.n + ')</option>';
      }).join("") + '</select>' +
        (hasVol ? '<div class="seg hm"><button type="button" data-hm="kg" aria-pressed="' + (HMODE === "kg") + '">carico</button><button type="button" data-hm="vol" aria-pressed="' + (HMODE === "vol") + '">volume</button></div>' : '') + '</div>';
      h += grafLinea(pts, field, unit, cur.name, (HMODE === "vol" ? "Volume (carico × ripetizioni) per seduta" : "Carico per seduta") + " · i punti arancioni hanno una nota");
    }
    h += grafSettimane(ss);
    h += '<h2>Sedute</h2><div style="display:flex;flex-direction:column;gap:8px">' + ss.slice().reverse().map(function (s) {
      var tot = 0, dn = 0, rows = "";
      Object.keys(s.ex).forEach(function (k) {
        var r = s.ex[k], c = serieEff(r);
        tot += r.myo ? 2.5 : (r.tot || c); dn += c;
        if (!c && !r.note) return;
        rows += '<div class="row"><div>' + esc(r.name) + (r.note ? '<div class="exn">' + esc(r.note) + '</div>' : '') + '</div><div class="v">' +
          (r.load ? esc(r.load) + ' · ' : '') + (r.myo ? 'myo ' : '') + fmtNum(c) + '/' + fmtNum(r.myo ? 2.5 : (r.tot || c)) + (r.reps ? '<br>' + esc(r.reps) + ' rip' : '') + '</div></div>';
      });
      var id = Settimana.idDi(s);
      // per una parte, la percentuale è della seduta intera (parti di prima + questa)
      var tempo = s.minuti ? ' · ' + s.minuti + '′' + (s.parte ? ' (in tutto ' + s.stimolo + '%)' : s.pieno && s.minuti < s.pieno ? ' (' + s.stimolo + '%)' : '') : '';
      return '<details class="sess"><summary><span class="dt">' + dmy(s.date) + '</span><span class="dn">' + esc((s.tab === "vacanza" ? "Vacanza · " : "") + (s.dayName || s.day) + (s.parte ? " · " + s.parte + "ª parte" : "")) + tempo + (s.comment ? ' · nota' : '') + '</span>' +
        '<span class="sc">' + fmtNum(dn) + '/' + fmtNum(tot) + '</span></summary><div class="bd">' + (rows || '<p class="cap2">Nessuna serie segnata.</p>') +
        (s.comment ? '<div class="cm">' + esc(s.comment) + '</div>' : '') +
        '<div class="acts">' + (dn < tot - 0.01 && SCHEDA.luoghi[s.tab] ? '<button type="button" class="btn pri" data-riprendi="' + esc(id) + '">Riprendi questa seduta</button>' : '') +
        '<button type="button" class="btn-sm" data-del="' + esc(id) + '">Elimina seduta</button></div></div></details>';
    }).join("") + '</div>';
    box.innerHTML = h;
  }

  // riprende una seduta interrotta: stesso luogo, giorno e minuti, le serie già fatte restano segnate,
  // e si riapre «una cosa alla volta» sulla prima serie che manca
  function riprendi(id) {
    var s = SEDUTE[id]; if (!s || !SCHEDA.luoghi[s.tab]) return;
    var ix = SCHEDA.luoghi[s.tab].giorni.map(function (g) { return g.id; }).indexOf(s.day); if (ix < 0) return;
    Tasti.play("space"); Tasti.haptic(); fermaTimer();
    ATTIVA = s.date === oggi() ? null : s.date;
    PARTE = s.origine && SEDUTE[s.origine] ? { origine: s.origine, k: s.parte } : null;
    scegli(s.tab, ix, s.budget || s.minuti);
    mostra("allena"); apriF();
  }

  $("#hist").addEventListener("change", function (e) { if (e.target.id === "hx") { HX = e.target.value; renderStorico(); } });
  $("#hist").addEventListener("click", function (e) {
    var hm = e.target.closest("[data-hm]"); if (hm) { HMODE = hm.dataset.hm; renderStorico(); return; }
    var rip = e.target.closest("[data-riprendi]");
    if (rip) { riprendi(rip.dataset.riprendi); return; }
    var del = e.target.closest("[data-del]");
    if (del) {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Sicuro? Tocca di nuovo"; del.classList.add("danger"); return; }
      cancella(del.dataset.del); renderStorico();
    }
  });

  // tooltip dei grafici
  var TIPEL = null;
  function nascondiTip() { if (TIPEL) { TIPEL.classList.remove("on"); TIPEL = null; } }
  function mostraTip(r) {
    var box = r.closest(".chartbox"), tip = box && $(".tip", box); if (!tip) return;
    var parts = String(r.getAttribute("data-tip") || "").split("\n");
    tip.innerHTML = '<b>' + esc(parts[0]) + '</b>' + (parts[1] ? '<i>' + esc(parts[1]) + '</i>' : '');
    tip.classList.add("on"); TIPEL = tip;
    var rb = box.getBoundingClientRect(), rr = r.getBoundingClientRect(), tw = tip.offsetWidth;
    tip.style.left = Math.max(6, Math.min(rr.left - rb.left + rr.width / 2 - tw / 2, rb.width - tw - 6)) + "px";
    tip.style.top = (rr.top - rb.top + 6) + "px";
  }
  document.addEventListener("pointerover", function (e) { var r = e.target.closest && e.target.closest(".hit"); if (r) mostraTip(r); else if (e.target.closest && !e.target.closest(".tip")) nascondiTip(); });
  document.addEventListener("pointerdown", function (e) { var r = e.target.closest && e.target.closest(".hit"); if (r) mostraTip(r); else nascondiTip(); });
  document.addEventListener("scroll", nascondiTip, true);

  /* ===================== backup: esporta / importa ===================== */
  function datiExport() {
    return JSON.stringify({ app: "scheda-smart", formato: 1, scheda: SCHEDA.versione, esportato: new Date().toISOString(), sedute: SEDUTE, carichi: CARICHI, cancellate: CANC }, null, 1);
  }
  function msg(t, err) { var m = $("#bkmsg"); m.textContent = t; m.className = "msg" + (err ? " err" : ""); }
  function infoBackup() {
    var b = leggi(LS.bk, null), n = Object.keys(SEDUTE).length;
    msg(n ? (b && b.ts ? "Ultima esportazione: " + new Date(b.ts).toLocaleDateString("it-IT") + "." : "Non hai ancora esportato i dati.") : "");
  }
  $("#exp").addEventListener("click", function () {
    // iPhone (app sulla schermata Home): i download non funzionano, si usa il foglio Condividi (Salva su File, Mail…)
    var nome = "allenamento-" + oggi() + ".json";
    try {
      var file = new File([datiExport()], nome, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer:coarse)").matches) {
        navigator.share({ files: [file], title: nome }).then(function () {
          scrivi(LS.bk, { ts: Date.now() }); msg("File " + nome + " condiviso. Mettilo in storico/ nella cartella del progetto.");
        }, function (err) { if (err && err.name !== "AbortError") msg("Condivisione non riuscita: usa «Copia dati».", true); });
        return;
      }
    } catch (_) {}
    try {
      var blob = new Blob([datiExport()], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "allenamento-" + oggi() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      scrivi(LS.bk, { ts: Date.now() });
      msg("File allenamento-" + oggi() + ".json scaricato. Spostalo in storico/ nella cartella del progetto.");
    } catch (_) { msg("Il browser non permette di scaricare il file: usa «Copia dati».", true); }
  });
  $("#cpy").addEventListener("click", function () {
    var txt = datiExport();
    var ok = function () { scrivi(LS.bk, { ts: Date.now() }); msg("Dati copiati: incollali in un file .json dentro storico/."); };
    try { navigator.clipboard.writeText(txt).then(ok, function () { msg("Copia non permessa da questo browser.", true); }); }
    catch (_) { msg("Copia non permessa da questo browser.", true); }
  });
  $("#imp").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (!d || d.app !== "scheda-smart" || !d.sedute) throw new Error("formato");
        var nuove = 0, agg = 0;
        Object.keys(d.sedute).forEach(function (id) {
          var s = d.sedute[id]; if (!s || !s.date || !s.ex) return;
          if (!SEDUTE[id]) { SEDUTE[id] = s; nuove++; }
          else if ((s.ts || 0) > (SEDUTE[id].ts || 0)) { SEDUTE[id] = s; agg++; }
        });
        // carichi e cancellazioni: stessa fusione della sincronizzazione (per esercizio vince la modifica più recente)
        var m = SyncGist.merge({ sedute: SEDUTE, carichi: CARICHI, cancellate: CANC }, { sedute: {}, carichi: d.carichi, cancellate: d.cancellate });
        SEDUTE = m.sedute; CARICHI = m.carichi; CANC = m.cancellate; scrivi(LS.car, CARICHI); scrivi(LS.canc, CANC);
        salvaSedute(); renderStorico();
        msg("Importato: " + nuove + " sedute nuove, " + agg + " aggiornate.");
      } catch (_) { msg("Questo file non è un backup della Scheda Smart.", true); }
      e.target.value = "";
    };
    fr.readAsText(f);
  });

  /* ===================== navigazione ===================== */
  function mostra(v) {
    vista = v;
    ["allena", "storico", "guida"].forEach(function (k) { $("#v-" + k).hidden = k !== v; });
    $$("#tabs button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === v); });
    if (v === "storico") { renderStorico(); infoBackup(); statoSync(); }
    if (v === "allena") renderAllena();
    salvaUI(); window.scrollTo(0, 0);
  }
  $("#tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { Tasti.play("tick"); mostra(b.dataset.v); } });

  /* ===================== sincronizzazione iPhone ↔ PC (gist privato, vedi sync.js) ===================== */
  var SY = leggi(LS.sync, null) || {};          // { token, gist, ultima, errore } — solo in questo dispositivo
  var syncT = null, syncInCorso = false, syncAncora = false, rinviato = false;
  function salvaSY() { scrivi(LS.sync, SY); }
  function syncAttivo() { return !!(SY && SY.token && window.SyncGist && window.fetch); }
  function syncPresto() { if (!syncAttivo()) return; clearTimeout(syncT); statoSync("attesa"); syncT = setTimeout(sincronizza, 2000); }
  function oraDi(ts) { var d = new Date(ts); return (d.toDateString() === new Date().toDateString() ? "oggi" : dmy(d.toISOString().slice(0, 10))) + " alle " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  // ridisegna con i dati arrivati dall'altro dispositivo, senza strappare il testo che stai scrivendo
  function staScrivendo() { var a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "range"; }
  function ridisegna() {
    if (staScrivendo()) { rinviato = true; return; }
    rinviato = false;
    if (vista === "allena") { renderAllena(); renderF(); } else if (vista === "storico") renderStorico();
  }
  document.addEventListener("focusout", function () { if (rinviato) setTimeout(function () { if (!staScrivendo()) ridisegna(); }, 50); });

  function sincronizza() {
    if (!syncAttivo()) return Promise.resolve();
    if (syncInCorso) { syncAncora = true; return Promise.resolve(); }
    syncInCorso = true; clearTimeout(syncT); statoSync("in corso");
    var tok = SY.token;
    var trovaId = SY.gist ? Promise.resolve(SY.gist) : SyncGist.trova(tok).then(function (id) { SY.gist = id; salvaSY(); return id; });
    return trovaId.then(function (id) {
      return SyncGist.leggi(tok, id).then(function (remoto) {
        var m = SyncGist.merge({ sedute: SEDUTE, carichi: CARICHI, cancellate: CANC }, remoto);
        var qui = { s: SEDUTE, c: CARICHI.loads, t: CARICHI.tk || {}, k: CANC };
        var la = { s: remoto.sedute || {}, c: (remoto.carichi || {}).loads || {}, t: (remoto.carichi || {}).tk || {}, k: remoto.cancellate || {} };
        var nuovo = { s: m.sedute, c: m.carichi.loads, t: m.carichi.tk, k: m.cancellate };
        if (!SyncGist.uguali(nuovo, qui)) {
          SEDUTE = m.sedute; CARICHI = m.carichi; CANC = m.cancellate;
          scrivi(LS.sed, SEDUTE); scrivi(LS.car, CARICHI); scrivi(LS.canc, CANC);
          ridisegna();
        }
        if (!SyncGist.uguali(nuovo, la))
          return SyncGist.scrivi(tok, id, { app: "scheda-smart", formato: 2, scheda: SCHEDA.versione, aggiornato: new Date().toISOString(),
            sedute: m.sedute, carichi: m.carichi, cancellate: m.cancellate });
      });
    }).then(function () {
      SY.ultima = Date.now(); SY.errore = ""; salvaSY(); statoSync();
    }, function (e) {
      if (e && e.tipo === "permesso" && SY.gist) SY.gist = null;   // il gist non c'è più: al prossimo giro lo ritrova o lo ricrea
      SY.errore = (e && e.message) || "Sincronizzazione non riuscita."; SY.tipoErr = e && e.tipo; salvaSY(); statoSync();
    }).then(function () {
      syncInCorso = false;
      if (syncAncora) { syncAncora = false; syncPresto(); }
    });
  }

  // il pallino in alto e la scheda «Sincronizzazione» nello Storico
  function statoSync(fase) {
    var dot = $("#sydot"), att = syncAttivo(), txt;
    if (!att) txt = "";
    else if (fase === "in corso") txt = "Sincronizzo…";
    else if (fase === "attesa") txt = "Modifiche da mandare";
    else if (SY.errore) txt = SY.errore;
    else txt = SY.ultima ? "Sincronizzato " + oraDi(SY.ultima) : "Collegato";
    dot.hidden = !att;
    dot.className = "sydot" + (!att ? "" : fase ? " va" : SY.errore ? (SY.tipoErr === "offline" ? " va" : " err") : " ok");
    dot.title = txt;
    var box = $("#sync"); if (!box) return;
    if (!att) {
      box.innerHTML = '<p>Per avere <b>gli stessi dati su iPhone e PC</b>: crea su GitHub un token con il solo permesso <b>gist</b> ' +
        '(<a href="https://github.com/settings/tokens/new?scopes=gist&description=Scheda%20Smart" target="_blank" rel="noopener">apri la pagina già impostata ↗</a>, ' +
        'scadenza «No expiration») e incollalo qui, <b>su ogni dispositivo</b>. Resta solo in questo dispositivo.</p>' +
        '<div class="sytok"><input type="password" id="sytok" placeholder="Token GitHub (ghp_…)" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Token GitHub">' +
        '<button type="button" class="btn pri" id="sycol">Collega</button></div>';
    } else {
      box.innerHTML = '<div class="syst"><span class="' + dot.className + '"></span><span>' + esc(txt) + '</span></div>' +
        '<p>Sedute, carichi e cancellazioni passano da soli tra i dispositivi collegati, anche dopo un periodo senza rete.</p>' +
        '<div class="bk"><button type="button" class="btn" id="synow">Sincronizza ora</button><button type="button" class="btn" id="syoff">Scollega questo dispositivo</button></div>';
    }
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("#sycol,#synow,#syoff"); if (!t) return;
    if (t.id === "sycol") {
      var v = ($("#sytok").value || "").trim();
      if (!/^(ghp_|github_pat_|gho_)[A-Za-z0-9_]{20,}$/.test(v)) { msg("Questo non sembra un token GitHub (inizia con ghp_).", true); return; }
      SY = { token: v }; salvaSY(); statoSync("in corso");
      sincronizza().then(function () {
        if (SY.errore && SY.tipoErr !== "offline") { msg(SY.errore + " Controlla il token e riprova.", true); SY = {}; salvaSY(); statoSync(); }
        else { msg("Collegato. Da ora questo dispositivo è sincronizzato."); renderStorico(); }
      });
    } else if (t.id === "synow") sincronizza();
    else if (t.id === "syoff") { SY = {}; salvaSY(); statoSync(); msg("Scollegato: i dati restano in questo dispositivo."); }
  });
  // quando si sincronizza: all'apertura, quando torni sull'app, quando torna la rete, e ogni 2 minuti mentre la usi
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") sincronizza(); });
  window.addEventListener("online", function () { sincronizza(); });
  setInterval(function () { if (document.visibilityState === "visible") sincronizza(); }, 120000);

  /* ===================== app sul telefono (solo online) ===================== */
  // Il service worker tiene una copia per usarla senza rete e porta le versioni nuove da solo.
  // Dal file locale (doppio clic sul PC) non si registra: lì non serve.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    var avevaSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(function () {});
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!avevaSW) { avevaSW = true; return; }   // prima installazione: niente avviso
      if (F.open || TIMER) return;                // mai interrompere una serie o un recupero
      var t = document.createElement("button");
      t.type = "button"; t.className = "aggiorna";
      t.innerHTML = "<b>Nuova versione pronta</b> · tocca per aggiornare";
      t.addEventListener("click", function () { location.reload(); });
      document.body.appendChild(t); Tasti.land(t, { dy: 30, soft: true, fade: 1 });
    });
    // chiede al telefono di non cancellare i dati (Safari può farlo con i siti non usati)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  }

  /* ===================== avvio ===================== */
  $("#ver").textContent = "Scheda " + SCHEDA.versione;
  $("#ver2").textContent = "Scheda " + SCHEDA.versione;
  $("#ver3").textContent = "Scheda " + SCHEDA.versione;
  var ui = leggi(LS.ui, null);
  if (ui && (ui.data === oggi() || ui.attiva) && SCHEDA.luoghi[ui.luogo] && SCHEDA.luoghi[ui.luogo].giorni[ui.day]) {
    luogo = ui.luogo; dayIx = ui.day;
    if (ui.parte && ui.parte.origine && SEDUTE[ui.parte.origine]) PARTE = ui.parte;
    if (ui.attiva) { ATTIVA = ui.attiva; if (!SEDUTE[sid()]) ATTIVA = null; }
    full = calcolaOra(999).pieno;
    budget = Math.max(minimo(), Math.min(full, +ui.budget || full));
    mostra(ui.vista || "allena");
  } else {
    var l0 = ui && SCHEDA.luoghi[ui.luogo] ? ui.luogo : "casa";
    luogo = l0; dayIx = giornoSuggerito(l0).ix;
    full = calcolaOra(999).pieno;
    var gia0 = sedutaOggi();
    budget = gia0 && gia0.budget ? Math.max(minimo(), Math.min(full, gia0.budget)) : full;
    mostra("allena");
  }
  riprendiTimer();
  // l'app era chiusa a metà seduta, nella schermata intera: si riapre lì
  if (ui && ui.focus && vista === "allena" && sedutaOggi() && (ui.data === oggi() || ATTIVA)) apriF();
  statoSync(); sincronizza();
})();
