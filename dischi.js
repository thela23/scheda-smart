/* Scheda Smart — i dischi di casa: cosa montare, quali carichi si possono fare, quando bisogna smontare.
 * Funzioni pure (niente pagina): node app/prototipo/test/dischi.js
 *
 * Attrezzatura (Francesco, 20/11/2026 — docs/PROFILO.md):
 *   dischi normali   4 × 10, 4 × 5, 4 × 2, 8 × 1 kg  → bilanciere (20 kg) e manubri di metallo (2 kg l'uno)
 *   dischi plastica  4 × 2,5, 4 × 1,25 kg            → solo sui manubri di plastica (impugnatura ~0 kg)
 *   sui manubri di plastica anche dischi normali, ma al massimo MAX_NORMALI kg per manubrio (paura di romperli)
 *   un bilanciere, due manubri di metallo, due di plastica
 *
 * Ogni attrezzo si carica uguale sui due lati. I dischi normali sono in comune tra bilanciere e manubri di metallo:
 * per questo due blocchi di fila possono non stare carichi insieme (Zercher 60 kg + Floor Press 24 kg/man = 84 kg di
 * dischi, ne hai 76) → prima di montare il secondo bisogna smontare il primo.
 */
(function (root) {
  "use strict";
  var NORMALI = [[10, 4], [5, 4], [2, 4], [1, 8]];
  var PLASTICA = [[2.5, 4], [1.25, 4]];
  var MAX_NORMALI = 10;           // kg di dischi normali per manubrio di plastica (Francesco, 20/11/2026: «sì, fino a 10»)
  var BASE = { bil: 20, met: 2, pla: 0 };
  var QUANTI = { bil: 1, met: 2, pla: 2 };   // attrezzi che hai
  var SCARICO = 45;               // secondi per smontare i dischi che servono al blocco dopo

  function r2(x) { return Math.round(x * 100) / 100; }
  function num(s) { var m = String(s || "").replace(/,/g, ".").match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; }

  /* ---------- che attrezzo usa un esercizio, e con quanto peso ---------- */
  // → { tipo: "bil"|"met"|"pla", n: quanti pezzi, peso: kg per pezzo } oppure null (corpo libero)
  function attrezzo(e, load) {
    var tipo = e.k === "bil" ? "bil" : e.paio === "metallo" ? "met" : e.paio === "leggeri" ? "pla" : null;
    if (!tipo) return null;
    var s = String(load == null ? e.load : load), v = num(s.replace(/^\s*\d+\s*[×x]\s*/, ""));
    if (v == null) return null;
    var n = tipo === "bil" ? 1 : (e.manubri || 2);
    if (/tot/i.test(s) && n > 1) v = v / n;          // «24 kg tot» con due manubri = 12 per manubrio
    return { tipo: tipo, n: n, peso: r2(v) };
  }

  /* ---------- combinazioni di dischi per un lato ---------- */
  // tutti i modi di fare «lato» kg con i dischi disponibili (dischi: [[peso, quanti]]), al massimo «max» per tipo
  function modi(lato, dischi, quantiMax) {
    var out = [];
    (function giu(i, resto, scelta) {
      if (Math.abs(resto) < 1e-9) { out.push(scelta.slice()); return; }
      if (i >= dischi.length || resto < 0) return;
      var p = dischi[i][0], m = Math.min(quantiMax[i], Math.floor(resto / p + 1e-9));
      for (var k = m; k >= 0; k--) { scelta.push(k); giu(i + 1, resto - k * p, scelta); scelta.pop(); }
      // la scelta ha un numero per tipo di disco, nell'ordine di «dischi»
    })(0, lato, []);
    return out.map(function (c) { while (c.length < dischi.length) c.push(0); return c; });
  }
  // il peso più alto che un attrezzo può avere da solo (oltre non si cerca)
  var TUTTI_N = NORMALI.reduce(function (s, d) { return s + d[0] * d[1]; }, 0);
  var MASSIMO = { bil: BASE.bil + TUTTI_N, met: BASE.met + TUTTI_N, pla: 7.5 + MAX_NORMALI };

  // un pezzo (un attrezzo) da caricare a «peso»: le combinazioni per lato possibili, come { norm: [..4], pla: [..2] }
  var CACHE = {};
  function combinazioni(tipo, peso) {
    var k = tipo + ":" + peso;
    if (!CACHE[k]) CACHE[k] = combinazioni0(tipo, peso);
    return CACHE[k];
  }
  function combinazioni0(tipo, peso) {
    var lato = r2((peso - BASE[tipo]) / 2);
    if (lato < -1e-9) return [];
    if (Math.abs(lato * 2 - Math.round(lato * 2)) > 1e-9 && tipo !== "pla") return [];
    if (tipo !== "pla") {
      return modi(lato, NORMALI, NORMALI.map(function (d) { return d[1]; })).map(function (c) { return { norm: c, pla: [0, 0] }; })
        .sort(function (a, b) { return tot(a) - tot(b); });
    }
    var tutte = modi(lato, PLASTICA.concat(NORMALI), PLASTICA.concat(NORMALI).map(function (d) { return d[1]; }));
    return tutte.map(function (c) { return { pla: c.slice(0, 2), norm: c.slice(2) }; }).filter(function (c) {
      var kgNorm = c.norm.reduce(function (s, k, i) { return s + k * NORMALI[i][0]; }, 0);
      return kgNorm * 2 <= MAX_NORMALI + 1e-9;
    }).sort(function (a, b) { return tot(a) - tot(b); });
  }

  /* ---------- un gruppo di attrezzi carichi tutti insieme ---------- */
  // pezzi: [{ tipo, peso }] (uno per attrezzo fisico). → [{ tipo, peso, lato: combinazione }] oppure null
  // Sceglie la soluzione con meno dischi in tutto (più facile da montare).
  function monta(pezzi) {
    var conta = { bil: 0, met: 0, pla: 0 };
    pezzi.forEach(function (p) { conta[p.tipo]++; });
    if (conta.bil > QUANTI.bil || conta.met > QUANTI.met || conta.pla > QUANTI.pla) return null;
    var opz = pezzi.map(function (p) { return combinazioni(p.tipo, p.peso); });
    if (opz.some(function (o) { return !o.length; })) return null;
    var dispN = NORMALI.map(function (d) { return d[1]; }), dispP = PLASTICA.map(function (d) { return d[1]; });
    var best = null, scelta = [];
    (function giu(i, dischi) {
      if (best && dischi >= best.dischi) return;
      if (i === pezzi.length) { best = { dischi: dischi, scelta: scelta.slice() }; return; }
      for (var j = 0; j < opz[i].length; j++) {
        var c = opz[i][j], ok = true, k;
        for (k = 0; k < 4; k++) if (c.norm[k] * 2 > dispN[k]) ok = false;
        for (k = 0; k < 2; k++) if (c.pla[k] * 2 > dispP[k]) ok = false;
        if (!ok) continue;
        for (k = 0; k < 4; k++) dispN[k] -= c.norm[k] * 2;
        for (k = 0; k < 2; k++) dispP[k] -= c.pla[k] * 2;
        scelta.push(c); giu(i + 1, dischi + tot(c) * 2); scelta.pop();
        for (k = 0; k < 4; k++) dispN[k] += c.norm[k] * 2;
        for (k = 0; k < 2; k++) dispP[k] += c.pla[k] * 2;
      }
    })(0, 0);
    return best ? pezzi.map(function (p, i) { return { tipo: p.tipo, peso: p.peso, lato: best.scelta[i] }; }) : null;
  }
  function tot(c) { return c.norm.reduce(function (s, k) { return s + k; }, 0) + c.pla.reduce(function (s, k) { return s + k; }, 0); }

  /* ---------- gli attrezzi fisici di un blocco (superserie) ---------- */
  // es: lista di { e, load } degli esercizi attivi. Gli esercizi coi manubri dello stesso tipo e dello stesso peso
  // usano gli stessi manubri (Floor Press 24 kg/man + Rematore 24 kg = due manubri, non tre).
  function pezziDi(es) {
    var per = { bil: {}, met: {}, pla: {} };
    es.forEach(function (x) {
      var a = attrezzo(x.e, x.load); if (!a) return;
      per[a.tipo][a.peso] = Math.max(per[a.tipo][a.peso] || 0, a.n);
    });
    var out = [];
    Object.keys(per).forEach(function (t) {
      Object.keys(per[t]).forEach(function (w) { for (var i = 0; i < per[t][w]; i++) out.push({ tipo: t, peso: +w }); });
    });
    return out;
  }

  /* ---------- testo: cosa montare ---------- */
  function fmt(v) { return String(r2(v)).replace(".", ","); }
  function latoTesto(c) {
    var p = [];
    NORMALI.forEach(function (d, i) { for (var k = 0; k < c.norm[i]; k++) p.push(fmt(d[0])); });
    PLASTICA.forEach(function (d, i) { for (var k = 0; k < c.pla[i]; k++) p.push(fmt(d[0])); });
    return p.length ? p.join(" + ") : "niente";
  }
  // → { testo: "10 + 1 per lato", ok: true } · { ok: false, vicini: [giù, su] } · null se non usa dischi
  function montaggio(e, load) {
    var a = attrezzo(e, load); if (!a) return null;
    var pezzi = []; for (var i = 0; i < a.n; i++) pezzi.push({ tipo: a.tipo, peso: a.peso });
    var m = monta(pezzi);
    if (!m) return { ok: false, peso: a.peso, tipo: a.tipo, vicini: [vicino(e, load, -1), vicino(e, load, 1)] };
    var t = latoTesto(m[0].lato);
    return { ok: true, peso: a.peso, tipo: a.tipo, testo: t === "niente" ? (a.tipo === "bil" ? "bilanciere vuoto" : "senza dischi") : t + " per lato" };
  }

  /* ---------- il carico possibile più vicino (per i tasti − e +) ---------- */
  // il carico che si può montare, sopra (d = 1) o sotto (d = -1) quello attuale; testo nello stesso formato
  function vicino(e, load, d) {
    var a = attrezzo(e, load); if (!a) return null;
    var passo = a.tipo === "pla" ? 0.25 : 1;
    // si parte dal primo punto della griglia dalla parte giusta (57,5 → 57 o 58), poi un passo alla volta
    var v = d > 0 ? Math.floor(a.peso / passo + 1e-9) * passo : Math.ceil(a.peso / passo - 1e-9) * passo;
    for (var i = 0; i < 400; i++) {
      v = r2(v + d * passo);
      if (v < BASE[a.tipo] || v > MASSIMO[a.tipo]) return null;
      var pezzi = []; for (var j = 0; j < a.n; j++) pezzi.push({ tipo: a.tipo, peso: v });
      if (monta(pezzi)) return scrivi(load == null ? e.load : load, a, v);
    }
    return null;
  }
  // rimette il nuovo peso nella stringa del carico, conservando il formato («24 kg/man», «2 × 9 kg», «24 kg tot»)
  function scrivi(s, a, v) {
    s = String(s);
    var tot = /tot/i.test(s) && a.n > 1, out = fmt(tot ? v * a.n : v);
    var pre = s.match(/^\s*\d+\s*[×x]\s*/), corpo = pre ? s.slice(pre[0].length) : s;
    var m = corpo.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)/);
    if (!m) return s;
    return (pre ? pre[0] : "") + corpo.slice(0, m.index) + out + corpo.slice(m.index + m[1].length);
  }

  /* ---------- blocchi di fila: serve smontare? ---------- */
  // prima/dopo: liste { e, load } dei due blocchi. Il blocco dopo ricarica i suoi attrezzi; quelli del blocco prima
  // che non riusa restano carichi. Se i dischi non bastano per tutti e due, bisogna smontare prima → SCARICO secondi.
  function scarico(prima, dopo) {
    var pd = pezziDi(dopo); if (!pd.length) return 0;
    if (!monta(pd)) return 0;          // il blocco dopo non si monta comunque: lo dice l'avviso sul carico, non è uno «smonta»
    var tipiDopo = {}; pd.forEach(function (p) { tipiDopo[p.tipo] = (tipiDopo[p.tipo] || 0) + 1; });
    var resta = pezziDi(prima).filter(function (p) {
      // un attrezzo del blocco prima resta carico solo se il blocco dopo non ne ha bisogno
      if (!tipiDopo[p.tipo]) return true;
      return false;
    });
    if (!resta.length) return 0;
    return monta(resta.concat(pd)) ? 0 : SCARICO;
  }
  function insieme(es) { var p = pezziDi(es); return !p.length || !!monta(p); }
  // superserie che non si carica tutta insieme: per ogni esercizio, il carico più vicino (fino a 3 passi) che la
  // rende possibile lasciando gli altri come sono → [{ i, load }], il più vicino per esercizio
  function aggiusta(es) {
    var out = [];
    es.forEach(function (x, i) {
      if (!attrezzo(x.e, x.load)) return;
      var best = null;
      [-1, 1].forEach(function (d) {
        var l = x.load;
        for (var k = 0; k < 3; k++) {
          l = vicino(x.e, l, d); if (!l) break;
          var prova = es.map(function (y, j) { return j === i ? { e: y.e, load: l } : y; });
          if (insieme(prova)) {
            var dist = Math.abs(attrezzo(x.e, l).peso - attrezzo(x.e, x.load).peso);
            if (!best || dist < best.dist) best = { i: i, load: l, dist: dist };
            break;
          }
        }
      });
      if (best) out.push({ i: best.i, load: best.load });
    });
    return out;
  }

  var API = { attrezzo: attrezzo, combinazioni: combinazioni, monta: monta, pezziDi: pezziDi, montaggio: montaggio,
    vicino: vicino, scarico: scarico, insieme: insieme, aggiusta: aggiusta, costanti: { MAX_NORMALI: MAX_NORMALI, SCARICO: SCARICO, NORMALI: NORMALI, PLASTICA: PLASTICA } };
  if (typeof module !== "undefined") module.exports = API; else root.Dischi = API;
})(this);
