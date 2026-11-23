// Controlli della «seconda parte» e dei muscoli in ritardo (settimana.js + motore.js con opz.fatto).
// Uso: node app/prototipo/test/settimana.js — deve rispondere «Nessun problema».
const D = require("../dati.js"), M = require("../motore.js"), S = require("../sequenza.js"), W = require("../settimana.js");
let problemi = 0, casi = 0;
const P = (msg) => { problemi++; if (problemi <= 40) console.log("  ✗ " + msg); };
const PRI = D.PRIORITA;

/* ---------- 1. seconda parte: per ogni giorno, ogni durata della prima parte e ogni durata della seconda ---------- */
// la prima parte fatta tutta come da piano → fatto[bi][ei] in serie efficaci
function fattoDa(R) { return R.blocchi.map(b => b.ex.map(x => x.n > 0 ? (x.myo ? Math.min(2.5, x.e.n) : x.n) : 0)); }

for (const l of Object.keys(D.SCHEDA.luoghi)) for (const g of D.SCHEDA.luoghi[l].giorni) {
  const pieno = M.calcola(g, 999, PRI).pieno;
  for (let b1 = 15; b1 < pieno; b1 += 2) {
    const R1 = M.calcola(g, b1, PRI), fatto = fattoDa(R1);
    const F = M.calcola(g, 999, PRI, { fatto, misura: PRI }), full2 = F.pieno;
    const nome = `${D.SCHEDA.luoghi[l].label} ${g.id} parte1 ${b1}′`;
    // a) la prima parte da sola vale quanto diceva il motore: un po' di più al massimo, perché le serie fatte contano
    //    piene (il motore toglieva qualcosa per i recuperi accorciati e il riscaldamento breve), mai di meno
    if (F.prima < R1.stimolo - 0.005 || F.prima > R1.stimolo + 0.04) P(`${nome}: «prima» ${F.prima.toFixed(3)} lontano dallo stimolo della parte 1 ${R1.stimolo.toFixed(3)}`);
    // b) prima + seconda completa = quasi tutta la seduta (resta fuori solo mezza serie per i myo, < 4%)
    if (F.stimolo < 0.96) P(`${nome}: con la seconda parte completa solo ${(F.stimolo * 100).toFixed(1)}%`);
    if (F.modifiche.length) P(`${nome}: seconda parte completa con ${F.modifiche.length} modifiche`);
    // c) mai più serie del piano: fatto + resto ≤ serie del giorno, e gli esercizi chiusi sono «fatto»
    F.blocchi.forEach((bl, bi) => bl.ex.forEach((x, ei) => {
      const f = fatto[bi][ei], e = g.blocchi[bi].ex[ei];
      if (f + x.n > e.n + 0.01) P(`${nome}: ${e.name} fatte ${f} + ancora ${x.n} > ${e.n}`);
      if (f > 0 && x.n === 0 && x.stato !== "fatto") P(`${nome}: ${e.name} chiuso ma stato «${x.stato}»`);
      if (f === 0 && x.stato === "fatto") P(`${nome}: ${e.name} segnato fatto senza serie`);
    }));
    let prev = null;
    for (let b2 = 15; b2 <= Math.max(15, full2); b2++) {
      casi++;
      const R = M.calcola(g, b2, PRI, { fatto, misura: PRI }), n2 = `${nome} + parte2 ${b2}′`;
      // d) rispetta il tempo (se il resto sta in meno di 15′ si fa tutto)
      if (R.secondi > Math.max(b2, full2) * 60 + 1) P(`${n2}: dura ${(R.secondi / 60).toFixed(1)} min`);
      // e) lo stimolo totale non scende sotto quello della parte 1 e non cala dando più tempo
      if (R.stimolo < R.prima - 0.009) P(`${n2}: totale ${R.stimolo.toFixed(3)} < parte 1 ${R.prima.toFixed(3)}`);
      if (prev && R.stimolo < prev - 0.005) P(`${n2}: stimolo ${R.stimolo.toFixed(3)} < ${prev.toFixed(3)} con un minuto in meno`);
      prev = R.stimolo;
      // f) nessun esercizio rifatto oltre il resto, niente myo su bilanciere, myo solo se restano ≥ 2 serie
      R.blocchi.forEach((bl, bi) => bl.ex.forEach((x, ei) => {
        const e = g.blocchi[bi].ex[ei], resto = F.blocchi[bi].ex[ei].n;
        if (!x.myo && x.n > resto) P(`${n2}: ${e.name} ${x.n} serie, ne restano ${resto}`);
        if (x.myo && (e.k === "bil" || resto < 2)) P(`${n2}: myo su ${e.name} (resto ${resto})`);
      }));
      // g) la coda di «una cosa alla volta» ha tutte e sole le serie del piano
      const q = S.coda(R), att = {}, vis = {};
      R.blocchi.forEach((bl, bi) => { if (bl.tempo) bl.ex.forEach((x, ei) => { if (x.n > 0) att[bi + ":" + ei] = x.myo ? 4 : x.n; }); });
      q.forEach(v => { const k = v.bi + ":" + v.ei; vis[k] = (vis[k] || 0) + 1; });
      for (const k of new Set([...Object.keys(att), ...Object.keys(vis)])) if (att[k] !== vis[k]) P(`${n2}: ${k} attese ${att[k]}, in coda ${vis[k]}`);
      // h) ramp-up sul primo bilanciere rimasto
      const bil = R.blocchi.findIndex(bl => bl.ex.some(x => x.e.k === "bil" && x.n > 0));
      if (bil >= 0 && !R.blocchi[bil].ramp) P(`${n2}: bilanciere senza ramp-up`);
    }
  }
}

/* ---------- 2. secondaParte(): quando si propone ---------- */
const g0 = D.SCHEDA.luoghi.casa.giorni[0];
const K = W.chiavi("casa", g0);
function seduta(date, day, serie, extra) {
  const g = D.SCHEDA.luoghi.casa.giorni.find(x => x.id === day), k = W.chiavi("casa", g), ex = {};
  serie.forEach(([bi, ei, n]) => { ex[k[bi][ei]] = { name: g.blocchi[bi].ex[ei].name, done: Array(n).fill(true), tot: n }; });
  return Object.assign({ date, tab: "casa", day, dayName: g.nome, ts: Date.parse(date) + 3600e3, ex }, extra || {});
}
let sp;
sp = W.secondaParte({ "2026-11-20_casa_A": seduta("2026-11-20", "A", [[1, 0, 3], [1, 1, 2]]) }, D.SCHEDA, "casa", "2026-11-20");
if (!sp || sp.prossima !== 2 || sp.origine !== "2026-11-20_casa_A") P("seduta corta di oggi: seconda parte non proposta");
sp = W.secondaParte({ "2026-11-19_casa_A": seduta("2026-11-19", "A", [[1, 0, 3]]) }, D.SCHEDA, "casa", "2026-11-20");
if (!sp) P("seduta corta di ieri: seconda parte non proposta");
sp = W.secondaParte({ "2026-11-18_casa_A": seduta("2026-11-18", "A", [[1, 0, 3]]) }, D.SCHEDA, "casa", "2026-11-20");
if (sp) P("seduta di 2 giorni fa: proposta lo stesso");
sp = W.secondaParte({ "2026-11-20_casa_A": seduta("2026-11-20", "A", [[1, 0, 3]]), "2026-11-20_casa_B": seduta("2026-11-20", "B", [[1, 0, 3]], { ts: Date.parse("2026-11-20") + 7200e3 }) }, D.SCHEDA, "casa", "2026-11-20");
if (sp && sp.origine === "2026-11-20_casa_A") P("dopo A c'è stato B: proposta la seconda parte di A");
const tutto = []; g0.blocchi.forEach((b, bi) => b.ex.forEach((e, ei) => tutto.push([bi, ei, e.n])));
sp = W.secondaParte({ "2026-11-20_casa_A": seduta("2026-11-20", "A", tutto) }, D.SCHEDA, "casa", "2026-11-20");
if (sp) P("seduta completa: proposta lo stesso");
// le parti si sommano e la numerazione salta i buchi
const sedP = { "2026-11-20_casa_A": seduta("2026-11-20", "A", [[1, 0, 2]]),
  "2026-11-20_casa_A_p3": seduta("2026-11-20", "A", [[1, 0, 1]], { parte: 3, origine: "2026-11-20_casa_A" }) };
sp = W.secondaParte(sedP, D.SCHEDA, "casa", "2026-11-20");
if (!sp || sp.prossima !== 4) P(`numerazione parti: attesa 4, avuta ${sp && sp.prossima}`);
if (!sp || sp.fatto[1][0] !== 3) P(`parti sommate: Floor press attese 3 serie, avute ${sp && sp.fatto[1][0]}`);
if (W.idDi(sedP["2026-11-20_casa_A_p3"]) !== "2026-11-20_casa_A_p3") P("idDi di una parte sbagliato");

/* ---------- 3. muscoli in ritardo ---------- */
let pr = W.priorita(PRI, {}, D.SCHEDA, "casa", "2026-11-20", []);
if (pr.ritardo.length || JSON.stringify(pr.pri) !== JSON.stringify(PRI)) P("settimana vuota: priorità cambiate");
// solo braccia e petto (3 sedute A corte senza gambe): gambe in ritardo, alzate ma mai sopra 1
const soloSu = {};
["2026-11-14", "2026-11-17", "2026-11-20"].forEach(d => { soloSu[d + "_casa_A"] = seduta(d, "A", [[1, 0, 3], [1, 1, 2], [2, 0, 3], [2, 1, 3]]); });
pr = W.priorita(PRI, soloSu, D.SCHEDA, "casa", "2026-11-20", []);
["quadricipiti", "glutei", "femorali"].forEach(m => { if (!(pr.pri[m] > PRI[m])) P(`${m} senza serie in settimana ma priorità non alzata`); });
Object.keys(pr.pri).forEach(m => {
  if (pr.pri[m] > W.costanti.SOPRA + 1e-9) P(`${m}: priorità ${pr.pri[m]} sopra ${W.costanti.SOPRA}`);
  if (pr.pri[m] > 1 && !(pr.copertura[m] < W.costanti.MINIMO)) P(`${m}: priorità sopra 1 ma non è sotto il mantenimento`);
  if (PRI[m] < 0.5 && pr.pri[m] !== PRI[m]) P(`${m}: muscolo piccolo alzato`);
  if (PRI[m] >= 1 && pr.pri[m] !== PRI[m]) P(`${m}: prioritario cambiato`);
});
// le sedute escluse (la catena in corso) e quelle fuori dagli ultimi 7 giorni non contano
const pr2 = W.priorita(PRI, soloSu, D.SCHEDA, "casa", "2026-11-20", ["2026-11-20_casa_A"]);
const pr3 = W.priorita(PRI, Object.assign({ "2026-11-01_casa_C": seduta("2026-11-01", "C", [[0, 0, 3], [1, 0, 3], [1, 1, 3]]) }, soloSu), D.SCHEDA, "casa", "2026-11-20", []);
if (Math.abs(pr3.copertura.quadricipiti - pr.copertura.quadricipiti) > 1e-9) P("una seduta di 19 giorni fa conta nella settimana");
if (!(pr2.copertura.petto < pr.copertura.petto)) P("la seduta esclusa conta lo stesso");
// gambe allenate quanto le braccia: nessun ritardo
const pari = Object.assign({}, soloSu, { "2026-11-19_casa_C": seduta("2026-11-19", "C", [[0, 0, 3], [1, 0, 3], [1, 1, 3]]), "2026-11-18_casa_B": seduta("2026-11-18", "B", [[0, 0, 3], [4, 1, 3]]) });
pr = W.priorita(PRI, pari, D.SCHEDA, "casa", "2026-11-20", []);
if (pr.ritardo.some(r => /quadricipiti|glutei|femorali/.test(r.m))) P("gambe allenate ma segnate in ritardo: " + pr.ritardo.map(r => r.m).join(", "));
// a 15′ con le gambe in ritardo il Giorno A rimette una gamba
pr = W.priorita(PRI, soloSu, D.SCHEDA, "casa", "2026-11-20", []);
const A15 = M.calcola(g0, 15, pr.pri, { misura: PRI });
if (!A15.blocchi[0].ex[0].n) P("Giorno A 15′ con le gambe in ritardo: niente Zercher");
if (A15.secondi > 15 * 60 + 1) P("Giorno A 15′ con le priorità alzate fuori tempo");

console.log(problemi ? `\n${problemi} problemi (${casi} seconde parti simulate)` : `Nessun problema (${casi} seconde parti simulate)`);
