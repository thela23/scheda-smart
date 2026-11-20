// Controlli dei dischi (dischi.js) e del tempo per smontarli nel motore. Uso: node app/prototipo/test/dischi.js
const D = require("../dati.js"), M = require("../motore.js"), X = require("../dischi.js"), W = require("../settimana.js");
let problemi = 0, casi = 0;
const P = (msg) => { problemi++; if (problemi <= 40) console.log("  ✗ " + msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) P(`${msg}: atteso ${JSON.stringify(b)}, avuto ${JSON.stringify(a)}`); };
const NORM = X.costanti.NORMALI, PLA = X.costanti.PLASTICA, BASE = { bil: 20, met: 2, pla: 0 };

// controllo indipendente di un montaggio: pesi giusti, dischi che ci sono, limite sulla plastica
function verifica(m, nome) {
  const usatiN = NORM.map(() => 0), usatiP = PLA.map(() => 0);
  m.forEach(p => {
    const lato = p.lato.norm.reduce((s, k, i) => s + k * NORM[i][0], 0) + p.lato.pla.reduce((s, k, i) => s + k * PLA[i][0], 0);
    if (Math.abs(BASE[p.tipo] + 2 * lato - p.peso) > 1e-9) P(`${nome}: ${p.tipo} ${p.peso} montato a ${BASE[p.tipo] + 2 * lato}`);
    if (p.tipo !== "pla" && p.lato.pla.some(Boolean)) P(`${nome}: dischi di plastica su ${p.tipo}`);
    if (p.tipo === "pla") { const kg = 2 * p.lato.norm.reduce((s, k, i) => s + k * NORM[i][0], 0); if (kg > X.costanti.MAX_NORMALI + 1e-9) P(`${nome}: ${kg} kg di dischi normali sulla plastica`); }
    p.lato.norm.forEach((k, i) => usatiN[i] += 2 * k); p.lato.pla.forEach((k, i) => usatiP[i] += 2 * k);
  });
  usatiN.forEach((u, i) => { if (u > NORM[i][1]) P(`${nome}: ${u} dischi da ${NORM[i][0]}, ne hai ${NORM[i][1]}`); });
  usatiP.forEach((u, i) => { if (u > PLA[i][1]) P(`${nome}: ${u} dischi da ${PLA[i][0]}, ne hai ${PLA[i][1]}`); });
}

/* ---------- 1. casi noti ---------- */
const bil = { k: "bil" }, met = { k: "man", paio: "metallo" }, met1 = { k: "man", paio: "metallo", manubri: 1 }, pla = { k: "iso", paio: "leggeri" };
eq(X.montaggio(bil, "60 kg").testo, "10 + 10 per lato", "Zercher 60");
eq(X.montaggio(bil, "70 kg").testo, "10 + 10 + 5 per lato", "Hip thrust 70");
eq(X.montaggio(bil, "20 kg").testo, "bilanciere vuoto", "bilanciere vuoto");
eq(X.montaggio(met, "24 kg/man").testo, "10 + 1 per lato", "Floor 24/man (impugnatura compresa)");
eq(X.montaggio(met, "24 kg tot").testo, "5 per lato", "Calf 24 tot = 12 per manubrio");
eq(X.montaggio(met, "2 × 10 kg").testo, "2 + 2 per lato", "Bulgarian 2×10");
eq(X.montaggio(pla, "7 kg").testo, "1 + 2,5 per lato", "alzate 7 sulla plastica");
eq(X.montaggio(bil, "57,5 kg").ok, false, "RDL 57,5: servono dischi da 1,25 sul bilanciere");
eq(X.montaggio(bil, "57,5 kg").vicini, ["56 kg", "58 kg"], "RDL 57,5 vicini");
eq(X.montaggio(met, "26 kg tot").ok, false, "13 kg per manubrio: dispari");
eq(X.montaggio(pla, "12 kg").ok, false, "12 kg sulla plastica oltre il limite di dischi normali");
eq(X.vicino(bil, "60 kg", 1), "62 kg", "bilanciere +2");
eq(X.vicino(met, "24 kg/man", 1), "26 kg/man", "manubri +2");
eq(X.vicino(met, "2 × 9 kg", 1), "2 × 10 kg", "formato 2 × N");
eq(X.vicino(pla, "2 × 7,5 kg", 1), "2 × 9 kg", "plastica: dopo 7,5 viene 9");
// 2 manubri di metallo: tre pesi diversi insieme non si caricano
eq(X.monta([{ tipo: "met", peso: 12 }, { tipo: "met", peso: 12 }, { tipo: "met", peso: 14 }]), null, "tre manubri di metallo");
// Floor 24/man + Rematore 24: stessi manubri
eq(X.pezziDi([{ e: met, load: "24 kg/man" }, { e: met1, load: "24 kg" }]).length, 2, "Floor + Rematore = 2 manubri");
// Zercher 60 (40 kg di dischi) + Floor 24/man (44 kg) = 84 > 76: non insieme → bisogna smontare
eq(X.insieme([{ e: bil, load: "60 kg" }, { e: met, load: "24 kg/man" }]), false, "Zercher + Floor insieme");
eq(X.scarico([{ e: bil, load: "60 kg" }], [{ e: met, load: "24 kg/man" }]), X.costanti.SCARICO, "Zercher → Floor: smontare");
eq(X.scarico([{ e: met, load: "24 kg/man" }], [{ e: met, load: "12 kg" }]), 0, "manubri → manubri: si ricaricano, niente in più");
eq(X.scarico([{ e: bil, load: "40 kg" }], [{ e: met, load: "12 kg" }]), 0, "OHP 40 + manubri 12: ci stanno");
eq(X.scarico([{ e: bil, load: "42 kg" }], [{ e: met, load: "26 kg tot" }]), 0, "carico impossibile dopo: niente «smonta»");

/* ---------- 2. tutti i pesi da 0 a 100: ogni montaggio trovato è giusto, e − / + portano a un peso montabile ---------- */
for (const [e, nome, fmt] of [[bil, "bilanciere", v => v + " kg"], [met, "manubri", v => v + " kg/man"], [met1, "manubrio", v => v + " kg"], [pla, "plastica", v => v + " kg"]]) {
  for (let v = 0; v <= 100; v += 0.25) {
    casi++;
    const load = fmt(String(v).replace(".", ",")), a = X.attrezzo(e, load);
    const pezzi = Array.from({ length: a.n }, () => ({ tipo: a.tipo, peso: a.peso }));
    const m = X.monta(pezzi);
    if (m) verifica(m, `${nome} ${load}`);
    const mg = X.montaggio(e, load);
    if (!!m !== mg.ok) P(`${nome} ${load}: monta e montaggio non d'accordo`);
    for (const d of [-1, 1]) {
      const n = X.vicino(e, load, d); if (!n) continue;
      const b = X.attrezzo(e, n);
      if (d > 0 ? b.peso <= a.peso : b.peso >= a.peso) P(`${nome} ${load}: ${d > 0 ? "+" : "−"} va a ${n}`);
      if (!X.montaggio(e, n).ok) P(`${nome} ${load}: ${d > 0 ? "+" : "−"} va a ${n}, che non si monta`);
    }
  }
}

/* ---------- 3. la scheda: ogni carico di partenza si monta, ogni superserie si carica tutta insieme ---------- */
for (const l of Object.keys(D.SCHEDA.luoghi)) for (const g of D.SCHEDA.luoghi[l].giorni) {
  g.blocchi.forEach((b, bi) => {
    const es = b.ex.map(e => ({ e, load: e.load }));
    es.forEach(x => { const m = X.montaggio(x.e, x.load); if (m && !m.ok) P(`${l} ${g.id}: ${x.e.name} ${x.load} non si monta (${m.vicini.join(" / ")})`); });
    if (!X.insieme(es)) P(`${l} ${g.id} blocco ${bi + 1}: la superserie non si carica tutta insieme (${b.ex.map(e => e.name + " " + e.load).join(" + ")})`);
    if (l === "vacanza" && X.pezziDi(es).length) P(`vacanza ${g.id}: dischi in vacanza?`);
  });
}

/* ---------- 4. il motore col tempo per smontare ---------- */
function cambio(g) {
  const bl = g.blocchi.map(b => b.ex.map(e => ({ e, load: e.load })));
  return bl.map((a, i) => bl.map((b, j) => j > i ? X.scarico(a, b) : 0));
}
const A = D.SCHEDA.luoghi.casa.giorni[0];
eq(cambio(A)[0][1], X.costanti.SCARICO, "Casa A: Zercher → Floor nel motore");
for (const g of D.SCHEDA.luoghi.casa.giorni) {
  const C = cambio(g), pieno = M.calcola(g, 999, D.PRIORITA, { cambio: C });
  const senza = M.calcola(g, 999, D.PRIORITA);
  const extra = C.reduce((s, r, i) => s + (r[i + 1] || 0), 0);
  if (Math.abs(pieno.secondi - senza.secondi - extra) > 1) P(`Casa ${g.id}: seduta completa ${pieno.secondi} s, attesi ${senza.secondi} + ${extra}`);
  let prev = null;
  for (let min = 15; min <= pieno.pieno; min++) {
    casi++;
    const R = M.calcola(g, min, D.PRIORITA, { cambio: C, misura: D.PRIORITA }), n = `Casa ${g.id} ${min}′`;
    if (R.secondi > min * 60 + 1) P(`${n}: dura ${(R.secondi / 60).toFixed(1)} min`);
    const somma = R.riscaldamento + R.blocchi.reduce((s, b) => s + b.tempo, 0);
    if (Math.abs(somma - R.secondi) > 1) P(`${n}: somma blocchi ${somma} ≠ ${R.secondi}`);
    if (prev && R.stimolo < prev - 0.005) P(`${n}: stimolo scende dando più tempo`);
    prev = R.stimolo;
    // «smonta» solo dove serve davvero: tra due blocchi di fila rimasti nella seduta che non stanno carichi insieme
    let ultimo = -1;
    R.blocchi.forEach((b, bi) => {
      if (!b.tempo) { if (b.scarico) P(`${n}: blocco ${bi + 1} sparito ma con «smonta»`); return; }
      const atteso = ultimo >= 0 ? C[ultimo][bi] : 0;
      if (b.scarico !== atteso) P(`${n}: blocco ${bi + 1} smonta ${b.scarico} s, atteso ${atteso}`);
      ultimo = bi;
    });
  }
  // con le priorità alzate e nella seconda parte vale lo stesso
  const R2 = M.calcola(g, 15, Object.assign({}, D.PRIORITA, { quadricipiti: 1, glutei: 1, femorali: 1 }), { cambio: C, misura: D.PRIORITA, fatto: g.blocchi.map(b => b.ex.map(() => 1)) });
  if (R2.secondi > 15 * 60 + 1 && R2.minuti > R2.pieno) P(`Casa ${g.id}: seconda parte con dischi fuori tempo`);
}

console.log(problemi ? `\n${problemi} problemi (${casi} casi)` : `Nessun problema (${casi} casi)`);
