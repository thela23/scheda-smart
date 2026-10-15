// Controlli della fusione dei dati tra dispositivi. Uso: node app/prototipo/test/sync.js
const S = require("../sync.js");
let problemi = 0;
const ok = (cond, msg) => { if (!cond) { problemi++; console.log("  ✗ " + msg); } };
const sed = (id, ts, extra) => Object.assign({ date: id.slice(0, 10), tab: "casa", day: "A", ts, ex: {} }, extra || {});

// 1. sedute diverse sui due dispositivi: le tiene tutte
let m = S.merge({ sedute: { "2026-10-13_casa_A": sed("2026-10-13_casa_A", 10) } }, { sedute: { "2026-10-15_casa_B": sed("2026-10-15_casa_B", 20) } });
ok(Object.keys(m.sedute).length === 2, "unione delle sedute");

// 2. stessa seduta: vince la più recente
m = S.merge({ sedute: { x: sed("2026-10-15_casa_A", 100, { comment: "telefono" }) } }, { sedute: { x: sed("2026-10-15_casa_A", 50, { comment: "pc" }) } });
ok(m.sedute.x.comment === "telefono", "vince la seduta più recente");
m = S.merge({ sedute: { x: sed("2026-10-15_casa_A", 50, { comment: "pc" }) } }, { sedute: { x: sed("2026-10-15_casa_A", 100, { comment: "telefono" }) } });
ok(m.sedute.x.comment === "telefono", "vince la seduta più recente (ordine inverso)");

// 3. seduta eliminata su un dispositivo: non torna dall'altro
m = S.merge({ sedute: {}, cancellate: { x: 200 } }, { sedute: { x: sed("2026-10-15_casa_A", 100) } });
ok(!m.sedute.x && m.cancellate.x === 200, "seduta cancellata non torna");
// ... ma se dopo la cancellazione la rifai (ts più nuovo), resta
m = S.merge({ sedute: {}, cancellate: { x: 200 } }, { sedute: { x: sed("2026-10-15_casa_A", 300) } });
ok(!!m.sedute.x, "seduta rifatta dopo la cancellazione resta");

// 4. carichi: per esercizio vince la modifica più recente
m = S.merge({ carichi: { ts: 10, loads: { a: "24 kg", b: "12 kg" }, tk: { a: 10, b: 5 } } },
            { carichi: { ts: 8, loads: { a: "22 kg", b: "14 kg" }, tk: { a: 3, b: 8 } } });
ok(m.carichi.loads.a === "24 kg" && m.carichi.loads.b === "14 kg", "carichi per esercizio: " + JSON.stringify(m.carichi.loads));

// 5. «Ripristina» su un dispositivo (chiave tolta, tk più nuovo): il carico torna quello della scheda anche sull'altro
m = S.merge({ carichi: { ts: 30, loads: {}, tk: { a: 30 } } }, { carichi: { ts: 10, loads: { a: "26 kg" }, tk: { a: 10 } } });
ok(!("a" in m.carichi.loads), "ripristino del carico si propaga");

// 6. dati vecchi senza tk (backup del 14/10): valgono con la data generale
m = S.merge({ carichi: { ts: 1791888325793, loads: { "casa:A:floor-press-manubri": "24 kg/man" } } }, S.vuoto());
ok(m.carichi.loads["casa:A:floor-press-manubri"] === "24 kg/man", "carichi vecchi senza tk conservati");

// 7. fusione idempotente e commutativa
const A = { sedute: { x: sed("2026-10-13_casa_A", 10), y: sed("2026-10-14_casa_B", 40) }, cancellate: { z: 5 }, carichi: { ts: 4, loads: { a: "1" }, tk: { a: 4 } } };
const B = { sedute: { y: sed("2026-10-14_casa_B", 20), w: sed("2026-10-15_casa_C", 60) }, cancellate: { x: 1 }, carichi: { ts: 6, loads: { b: "2" }, tk: { b: 6 } } };
ok(S.uguali(S.merge(A, B), S.merge(B, A)), "commutativa");
ok(S.uguali(S.merge(S.merge(A, B), B), S.merge(A, B)), "idempotente");

// 8. il backup vero del 14/10 passa intatto
try {
  const bk = require("../../../storico/allenamento-2026-10-14.json");
  m = S.merge({ sedute: bk.sedute, carichi: bk.carichi }, S.vuoto());
  ok(Object.keys(m.sedute).length === Object.keys(bk.sedute).length, "backup del 14/10: tutte le sedute");
  ok(S.uguali(m.sedute, bk.sedute), "backup del 14/10: sedute identiche");
} catch (e) { console.log("  (backup del 14/10 non trovato: controllo saltato)"); }

console.log(problemi ? `\n${problemi} problemi` : "Nessun problema");
process.exitCode = problemi ? 1 : 0;
