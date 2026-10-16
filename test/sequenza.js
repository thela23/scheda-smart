// Controlli dell'ordine delle serie e dei recuperi di «una cosa alla volta».
// Uso: node app/prototipo/test/sequenza.js — per ogni giorno e ogni durata (15′ … completa) simula la seduta
// facendo le serie nell'ordine dell'app e controlla le regole da allenatore.
const D = require("../dati.js"), M = require("../motore.js"), S = require("../sequenza.js");
let problemi = 0, sedute = 0;
const P = (msg) => { problemi++; if (problemi <= 40) console.log("  ✗ " + msg); };

for (const l of Object.keys(D.SCHEDA.luoghi)) for (const g of D.SCHEDA.luoghi[l].giorni) {
  const full = M.calcola(g, 999, D.PRIORITA).pieno;
  for (let min = 15; min <= full; min++) {
    const R = M.calcola(g, min, D.PRIORITA), q = S.coda(R), nome = `${D.SCHEDA.luoghi[l].label} ${g.id} ${min}′`;
    sedute++;
    // 1. ogni serie del piano compare una volta sola (myo = S + 3 mini)
    const attese = {}, viste = {};
    R.blocchi.forEach((b, bi) => { if (!b.tempo) return; b.ex.forEach((x, ei) => { if (x.n > 0) attese[bi + ":" + ei] = x.myo ? 4 : x.n; }); });
    q.forEach(v => { const k = v.bi + ":" + v.ei; viste[k] = (viste[k] || 0) + 1; });
    for (const k of new Set([...Object.keys(attese), ...Object.keys(viste)])) if (attese[k] !== viste[k]) P(`${nome}: ${k} attese ${attese[k]} serie, in coda ${viste[k]}`);
    // 2. dentro ogni esercizio le serie sono in ordine (S prima delle mini, serie 1 prima della 2)
    const ultimo = {};
    q.forEach(v => { const k = v.bi + ":" + v.ei; if (ultimo[k] != null && v.j !== ultimo[k] + 1) P(`${nome}: ${k} serie ${v.j} dopo la ${ultimo[k]}`); ultimo[k] = v.j; });
    // 3. i blocchi non si mescolano
    for (let i = 1; i < q.length; i++) if (q[i].bi < q[i - 1].bi) P(`${nome}: si torna al blocco ${q[i].bi} dopo il ${q[i - 1].bi}`);

    // simulazione: si fa tutto in ordine, segnando i recuperi che partono
    const done = new Set(), fatto = v => done.has(v.bi + ":" + v.ei + ":" + v.j);
    const eventi = [];
    q.forEach((v, i) => { done.add(v.bi + ":" + v.ei + ":" + v.j); eventi.push({ v, r: S.riposo(R, q, i, fatto) }); });
    eventi.forEach(({ v, r }, i) => {
      const b = R.blocchi[v.bi], x = b.ex[v.ei], nx = eventi[i + 1] && eventi[i + 1].v;
      const stessoBlocco = nx && nx.bi === v.bi;
      // 4. mai un recupero intero tra due serie dello stesso giro di una superserie
      if (r && r.tipo === "giro" && stessoBlocco && nx.giro === v.giro) P(`${nome}: recupero a metà giro dopo ${x.e.name}`);
      // 5. dopo un giro chiuso (con altro da fare nel blocco) c'è sempre un recupero, della durata del motore
      if (stessoBlocco && nx.giro > v.giro) {
        if (!r) P(`${nome}: giro chiuso senza recupero dopo ${x.e.name}`);
        const dritti = b.ex.some(y => y.n > 0 && !y.myo);
        if (r && dritti && r.sec !== b.rest) P(`${nome}: recupero ${r.sec}s invece di ${b.rest}s`);
      }
      // 6. nessun recupero dopo l'ultima serie del blocco
      if (!stessoBlocco && r) P(`${nome}: recupero dopo l'ultima serie del blocco (${x.e.name})`);
      // 7. myo: tra due serie dello stesso esercizio myo c'è o la pausa di 15 s o UNA serie myo dell'altro esercizio;
      //    mai un recupero intero o una serie normale
      if (x.myo && v.j < 3) {
        const k = eventi.findIndex((e2, kk) => kk > i && e2.v.bi === v.bi && e2.v.ei === v.ei);
        const inMezzo = eventi.slice(i + 1, k);
        if (k < 0) P(`${nome}: ${x.e.name} myo senza mini-serie ${v.j + 1}`);
        else if (inMezzo.length === 0 && !(r && r.sec === S.MYO_PAUSA)) P(`${nome}: ${x.e.name} mini-serie ${v.j + 1} senza i 15 s di respiri`);
        else if (inMezzo.some(e2 => !b.ex[e2.v.ei].myo)) P(`${nome}: tra le mini-serie di ${x.e.name} c'è una serie normale`);
        else if (inMezzo.length > 1 || (r && r.tipo === "giro") || inMezzo.some(e2 => e2.r && e2.r.tipo === "giro")) P(`${nome}: mini-serie di ${x.e.name} troppo distanti`);
      }
    });
    // 8. la sequenza riproduce il modello del tempo: stesso numero di recuperi interi del motore
    let recMotore = 0;
    R.blocchi.forEach(b => { if (!b.tempo) return; const dr = b.ex.filter(x => x.n > 0 && !x.myo); if (dr.length) recMotore += Math.max(...dr.map(x => x.n)) - 1; });
    const recApp = eventi.filter(e => e.r && e.r.tipo === "giro").length;
    if (recApp !== recMotore) P(`${nome}: ${recApp} recuperi nell'app, ${recMotore} nel motore del tempo`);
  }
}
// 9. manubri (Casa): ogni esercizio coi manubri dice quale coppia usare, e in una superserie due carichi diversi
//    non finiscono mai sulla stessa coppia (se no tocca smontare i dischi a ogni giro)
const manubri = e => e.k === "man" || (e.k === "iso" && /kg/.test(e.load || ""));
for (const g of D.SCHEDA.luoghi.casa.giorni) g.blocchi.forEach((b, bi) => {
  const m = b.ex.filter(manubri);
  m.forEach(e => { if (!/^(metallo|leggeri)$/.test(e.paio || "")) P(`Casa ${g.id} blocco ${bi + 1}: ${e.name} senza coppia di manubri`); });
  for (let i = 0; i < m.length; i++) for (let k = i + 1; k < m.length; k++) {
    const ka = parseFloat(String(m[i].load).replace(",", ".").match(/(\d+(?:\.\d+)?)\s*kg/)[1]), kb = parseFloat(String(m[k].load).replace(",", ".").match(/(\d+(?:\.\d+)?)\s*kg/)[1]);
    const perMan = (e, v) => /tot/.test(e.load) ? v / 2 : v;
    if (perMan(m[i], ka) !== perMan(m[k], kb) && m[i].paio === m[k].paio) P(`Casa ${g.id} blocco ${bi + 1}: ${m[i].name} e ${m[k].name} hanno carichi diversi sulla stessa coppia`);
  }
});

console.log(problemi ? `\n${problemi} problemi su ${sedute} sedute simulate` : `Nessun problema (${sedute} sedute simulate)`);
process.exitCode = problemi ? 1 : 0;
