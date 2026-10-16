/* Scheda Smart — l'ordine delle serie e i recuperi della seduta, in un posto solo.
 * Lo usano «una cosa alla volta» e i cerchi della lista (app.js), e lo controlla test/sequenza.js.
 * Segue lo stesso modello del tempo di motore.js (tempoBlocco), così l'app fa quello che il motore ha stimato:
 *
 *   superserie normale     giro 1: A1 B1 → recupero → giro 2: A2 B2 → recupero → … (nessun recupero dopo l'ultimo giro)
 *   esercizio myo da solo  S → 15 s → mini 1 → 15 s → mini 2 → 15 s → mini 3
 *   superserie tutta myo   S di A, S di B → 15 s → mini 1 di A, mini 1 di B → 15 s → … (la serie dell'altro fa da pausa)
 *   superserie mista       giro 1: le serie normali, poi il myo tutto di fila (S, 15 s, mini…) → recupero →
 *                          giri dopo: solo le serie normali. Così le mini-serie restano a 15–20 s l'una dall'altra
 *                          (protocollo di Fagerli) e non vengono separate da un recupero intero.
 *
 * Una voce della coda: { bi, ei, j, giro, primo } — j = indice della serie dell'esercizio (myo: 0 = S, 1–3 = mini),
 * giro = turno del blocco in cui cade.
 */
(function (root) {
  "use strict";
  var MYO_PAUSA = 15;

  function coda(R) {
    var q = [];
    R.blocchi.forEach(function (b, bi) {
      if (!b.tempo) return;
      var live = [];
      b.ex.forEach(function (x, ei) { if (x.n > 0) live.push({ x: x, ei: ei }); });
      if (!live.length) return;
      var dritti = live.filter(function (o) { return !o.x.myo; }), myo = live.filter(function (o) { return o.x.myo; });
      var primo = true;
      var metti = function (ei, j, giro) { q.push({ bi: bi, ei: ei, j: j, giro: giro, primo: primo }); primo = false; };
      if (!dritti.length) {
        // tutto myo: attivazioni in fila, poi le mini-serie alternate
        for (var j = 0; j < 4; j++) myo.forEach(function (o) { metti(o.ei, j, j); });
      } else {
        var giri = Math.max.apply(null, dritti.map(function (o) { return o.x.n; }));
        for (var g = 0; g < giri; g++) {
          dritti.forEach(function (o) { if (g < o.x.n) metti(o.ei, g, g); });
          if (g === 0) myo.forEach(function (o) { for (var k = 0; k < 4; k++) metti(o.ei, k, 0); });
        }
      }
    });
    return q;
  }

  /* Il recupero da far partire dopo aver segnato la voce i (null = nessuno):
   *   { sec, tipo: "giro" | "myo", testo }
   * fatto(voce) dice se una serie è già segnata (la voce i compresa). */
  function riposo(R, q, i, fatto) {
    var it = q[i]; if (!it) return null;
    var b = R.blocchi[it.bi], x = b.ex[it.ei];
    var delBlocco = q.filter(function (v) { return v.bi === it.bi; });
    var giroChiuso = delBlocco.filter(function (v) { return v.giro === it.giro; }).every(fatto);
    var dopo = delBlocco.filter(function (v) { return v.giro > it.giro && !fatto(v); });
    var dritti = b.ex.some(function (y) { return y.n > 0 && !y.myo; });
    if (giroChiuso) {
      if (!dopo.length) return null;                                   // ultimo giro del blocco: si passa oltre
      var g = dopo[0].giro, tot = Math.max.apply(null, delBlocco.map(function (v) { return v.giro; })) + 1;
      if (dritti) return { sec: b.rest, tipo: "giro", testo: "Recupero · poi giro " + (g + 1) + " di " + tot };
      return { sec: MYO_PAUSA, tipo: "myo", testo: "3–5 respiri, poi mini-serie " + g };
    }
    if (x.myo) {
      // dentro il giro: se dopo tocca di nuovo a questo esercizio (myo di fila), 15 s di respiri
      var resto = q.slice(i + 1).filter(function (v) { return v.bi === it.bi && v.giro === it.giro && !fatto(v); });
      if (resto.length && resto[0].ei === it.ei) return { sec: MYO_PAUSA, tipo: "myo", testo: "3–5 respiri, poi mini-serie " + resto[0].j };
    }
    return null;
  }

  var API = { coda: coda, riposo: riposo, MYO_PAUSA: MYO_PAUSA };
  if (typeof module !== "undefined") module.exports = API; else root.Sequenza = API;
})(this);
