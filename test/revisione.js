// Controlli automatici del motore Tempo Smart. Uso: node app/prototipo/test/revisione.js
const D = require("../dati.js");
const M = require("../motore.js");
let problemi = 0;
const P = (msg) => { problemi++; console.log("  ✗ " + msg); };
const giorni = [];
Object.keys(D.SCHEDA.luoghi).forEach(l => D.SCHEDA.luoghi[l].giorni.forEach(g => giorni.push(Object.assign({}, g, { nome: D.SCHEDA.luoghi[l].label + " · " + g.nome }))));
for (const g of giorni) {
  const pieno = M.calcola(g, 999, D.PRIORITA);
  const max = pieno.pieno;
  console.log(`== ${g.nome}: pieno ${max} min (${pieno.secondi.toFixed(0)} s)`);
  // 1. al massimo dello slider nessuna modifica
  const top = M.calcola(g, max, D.PRIORITA);
  if (top.modifiche.length) P(`slider al massimo (${max}′): ${top.modifiche.length} modifiche → ${top.modifiche.map(m => m.t).join("; ")}`);
  let prev = null;
  for (let b = 15; b <= max; b++) {
    const r = M.calcola(g, b, D.PRIORITA);
    // 2. rispetta il budget
    if (r.secondi > b * 60 + 1) P(`${b}′: dura ${(r.secondi / 60).toFixed(1)} min, oltre il budget`);
    // 3. lo stimolo non scende se do piu' tempo
    if (prev && r.stimolo < prev.stimolo - 0.005) P(`${b}′: stimolo ${(r.stimolo * 100).toFixed(1)}% < ${(prev.stimolo * 100).toFixed(1)}% a ${b - 1}′`);
    // 4. ramp-up presente se c'e' un bilanciere
    const bil = r.blocchi.findIndex(bl => bl.ex.some(x => x.e.k === "bil" && x.n > 0));
    if (bil >= 0 && !r.blocchi[bil].ramp) P(`${b}′: bilanciere nel blocco ${bil + 1} senza ramp-up`);
    // 5. niente myo sul bilanciere
    r.blocchi.forEach(bl => bl.ex.forEach(x => { if (x.myo && x.e.k === "bil") P(`${b}′: myo su bilanciere ${x.e.name}`); }));
    // 6. messaggi coerenti: niente "recupero" su blocchi spariti, niente "ramp-up ridotto" senza bilanciere
    r.modifiche.forEach(m => {
      if (/^Recupero/.test(m.t) && !m.d) P(`${b}′: messaggio "${m.t}" su un blocco eliminato`);
      if (/^Ramp-up/.test(m.t) && bil < 0) P(`${b}′: "Ramp-up ridotto" ma nessun bilanciere`);
    });
    // 7. la somma dei blocchi + riscaldamento = totale
    const somma = r.riscaldamento + r.blocchi.reduce((s, bl) => s + bl.tempo, 0);
    if (Math.abs(somma - r.secondi) > 1) P(`${b}′: somma blocchi ${somma.toFixed(0)} ≠ totale ${r.secondi.toFixed(0)}`);
    // 8. percentuali in [0,1]
    r.muscoli.forEach(m => { if (!(m.pct >= 0 && m.pct <= 1.0001)) P(`${b}′: ${m.id} pct ${m.pct}`); });
    prev = r;
  }
}
console.log(problemi ? `\n${problemi} problemi` : "\nNessun problema");
