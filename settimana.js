/* Scheda Smart — la settimana e la «seconda parte». Funzioni pure (niente pagina), così si provano in node:
 * node app/prototipo/test/settimana.js
 *
 * 1. Seconda parte. Dopo una seduta corta, quello che manca del giorno si può fare più tardi (la sera o il giorno
 *    dopo). fattoDi() somma le serie già fatte nelle parti precedenti; il motore (motore.js, opz.fatto) le toglie
 *    dal giorno e calcola lo stimolo come parte 1 + parte 2 insieme.
 *    Le parti sono sedute a sé, con id «<id della prima parte>_p2», «_p3»… e i campi { parte, origine }.
 *
 * 2. Muscoli in ritardo (le gambe). Il motore taglia prima i muscoli a priorità più bassa: con tante sedute da 15′
 *    le gambe (priorità 0,5) spariscono quasi del tutto. Qui si guardano gli ultimi 7 giorni: per ogni muscolo si
 *    confronta il volume fatto con quello della settimana completa della scheda (copertura). Se un muscolo ha avuto
 *    meno della metà della copertura dei muscoli prioritari (petto, bicipiti, tricipiti), oppure meno di un terzo
 *    della sua settimana completa (la dose di mantenimento), la sua priorità sale
 *    verso quella dei prioritari, in proporzione al ritardo. Mai sopra: la priorità resta braccia e petto.
 *    Vale per i muscoli con priorità da 0,5 in su (gambe, dorsali, spalle laterali); i piccoli (polpacci, core,
 *    deltoidi anteriori e posteriori) restano come sono.
 *    Perché: conta il volume settimanale per muscolo (Schoenfeld 2017; Pelland 2025), e per non perdere quello che
 *    hai basta circa un terzo del volume (Bickel 2011). Le due soglie tengono le gambe sopra quel minimo senza
 *    togliere il primo posto a braccia e petto. Se negli ultimi 7 giorni non hai fatto niente, non cambia nulla.
 */
(function (root) {
  "use strict";
  var GIORNI = 7;        // finestra: gli ultimi 7 giorni, quello della seduta compreso
  var SOGLIA = 0.5;      // in ritardo sotto la metà della copertura dei prioritari...
  var MINIMO = 1 / 3;    // ...o sotto un terzo della settimana completa (mantenimento, Bickel 2011)
  var PRI_MIN = 0.5;     // si alzano solo i muscoli con priorità da 0,5 a meno di 1
  var MYO_EQ = 2.5;

  function slug(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }
  function dnum(s) { var p = String(s).split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }

  // serie «efficaci» di un esercizio segnato, come nell'app: myo = S 1 + 0,5 per mini (max 2,5)
  function serieEff(r) {
    var d = (r && r.done) || [];
    if (r && r.myo) return (d[0] ? 1 : 0) + 0.5 * d.slice(1).filter(Boolean).length;
    return d.filter(Boolean).length;
  }

  // chiavi degli esercizi di un giorno, uguali a calcolaChiavi() dell'app
  function chiavi(luogo, g) {
    var seen = {};
    return g.blocchi.map(function (b) {
      return b.ex.map(function (e) {
        var base = luogo + ":" + g.id + ":" + slug(e.name);
        seen[base] = (seen[base] || 0) + 1;
        return seen[base] > 1 ? base + "-" + seen[base] : base;
      });
    });
  }
  // chiave → esercizio, per tutti i luoghi
  function indice(scheda) {
    var m = {};
    Object.keys(scheda.luoghi).forEach(function (l) {
      scheda.luoghi[l].giorni.forEach(function (g) {
        var K = chiavi(l, g);
        g.blocchi.forEach(function (b, bi) { b.ex.forEach(function (e, ei) { m[K[bi][ei]] = e; }); });
      });
    });
    return m;
  }

  /* ---------- seconda parte ---------- */
  function idDi(s, id) {
    if (id) return id;
    return s.origine ? s.origine + "_p" + s.parte : s.date + "_" + s.tab + "_" + s.day;
  }
  // le parti di una seduta, in ordine: [prima, _p2, _p3…] (solo quelle che esistono)
  function parti(sedute, origine) {
    var out = [];
    if (sedute[origine]) out.push(origine);
    for (var k = 2; k < 20; k++) if (sedute[origine + "_p" + k]) out.push(origine + "_p" + k);
    return out;
  }
  // numero della prossima parte: dopo la più alta che esiste (anche se una in mezzo è stata eliminata)
  function prossimaParte(sedute, origine) {
    var n = 1;
    for (var k = 2; k < 20; k++) if (sedute[origine + "_p" + k]) n = k;
    return n + 1;
  }
  // serie già fatte di un giorno nelle sedute indicate: fatto[bi][ei] = serie efficaci
  function fattoDi(sedute, ids, luogo, g) {
    var K = chiavi(luogo, g);
    return g.blocchi.map(function (b, bi) {
      return b.ex.map(function (e, ei) {
        return ids.reduce(function (s, id) {
          var r = sedute[id] && sedute[id].ex && sedute[id].ex[K[bi][ei]];
          return s + (r ? serieEff(r) : 0);
        }, 0);
      });
    });
  }
  // volume pieno del giorno in serie (myo contato come nel motore): per sapere quanto manca
  function serieGiorno(g) { return g.blocchi.reduce(function (s, b) { return s + b.ex.reduce(function (t, e) { return t + e.n; }, 0); }, 0); }
  function serieFatte(g, fatto) {
    return g.blocchi.reduce(function (s, b, bi) { return s + b.ex.reduce(function (t, e, ei) { return t + Math.min(e.n, fatto[bi][ei]); }, 0); }, 0);
  }

  /* L'ultima seduta di quel luogo, se è corta e di oggi o di ieri: si può fare la parte che manca.
   * → { origine, prossima (numero della parte nuova), fatto, mancano (serie), giorno } oppure null */
  function secondaParte(sedute, scheda, luogo, oggi) {
    var L = scheda.luoghi[luogo]; if (!L) return null;
    var cand = Object.keys(sedute).filter(function (id) {
      var s = sedute[id];
      return s && !s.origine && s.tab === luogo && s.ex && Object.keys(s.ex).some(function (k) { return serieEff(s.ex[k]) > 0; });
    }).sort(function (a, b) {
      var A = sedute[a], B = sedute[b];
      return A.date < B.date ? -1 : A.date > B.date ? 1 : (A.ts || 0) - (B.ts || 0);
    });
    if (!cand.length) return null;
    var origine = cand[cand.length - 1], s0 = sedute[origine];
    var giorni = (dnum(oggi) - dnum(s0.date)) / 864e5;
    if (giorni < 0 || giorni > 1) return null;
    // ...ma se dopo c'è stata un'altra seduta di quel luogo (un giorno diverso), la catena è chiusa
    var dopo = Object.keys(sedute).some(function (id) {
      var s = sedute[id];
      return s && s.tab === luogo && !s.origine && id !== origine && s.date >= s0.date && (s.ts || 0) > (s0.ts || 0) &&
        s.ex && Object.keys(s.ex).some(function (k) { return serieEff(s.ex[k]) > 0; });
    });
    if (dopo) return null;
    var g = null, ix = -1;
    L.giorni.forEach(function (x, i) { if (x.id === s0.day) { g = x; ix = i; } });
    if (!g) return null;
    var ids = parti(sedute, origine), fatto = fattoDi(sedute, ids, luogo, g);
    var mancano = serieGiorno(g) - serieFatte(g, fatto);
    if (mancano < 2) return null;     // una serie sola non vale un altro riscaldamento
    return { origine: origine, prossima: prossimaParte(sedute, origine), fatto: fatto, mancano: mancano, giorno: g, ix: ix, data: s0.date };
  }

  /* ---------- muscoli in ritardo ---------- */
  // volume della settimana completa della scheda di quel luogo (tutti i giorni, tutte le serie)
  function obiettivo(scheda, luogo) {
    var o = {};
    scheda.luoghi[luogo].giorni.forEach(function (g) {
      g.blocchi.forEach(function (b) { b.ex.forEach(function (e) { Object.keys(e.m).forEach(function (m) { o[m] = (o[m] || 0) + e.n * e.m[m]; }); }); });
    });
    return o;
  }
  // volume fatto negli ultimi GIORNI fino a «data» compresa, escluse le sedute in «escludi»
  function fattoSettimana(sedute, scheda, data, escludi) {
    var idx = indice(scheda), x = {}, fine = dnum(data), inizio = fine - (GIORNI - 1) * 864e5;
    Object.keys(sedute).forEach(function (id) {
      var s = sedute[id];
      if (!s || !s.ex || !s.date || (escludi && escludi.indexOf(id) >= 0)) return;
      var t = dnum(s.date); if (t < inizio || t > fine) return;
      Object.keys(s.ex).forEach(function (k) {
        var e = idx[k], c = serieEff(s.ex[k]); if (!e || !c) return;
        var eq = Math.min(c, e.n);
        Object.keys(e.m).forEach(function (m) { x[m] = (x[m] || 0) + eq * e.m[m]; });
      });
    });
    return x;
  }

  /* → { pri (priorità da usare), ritardo: [{ m, copertura, rif, da, a }], copertura: {m: 0..} } */
  function priorita(pri, sedute, scheda, luogo, data, escludi) {
    var ob = obiettivo(scheda, luogo), fa = fattoSettimana(sedute, scheda, data, escludi), cop = {};
    Object.keys(ob).forEach(function (m) { cop[m] = ob[m] ? (fa[m] || 0) / ob[m] : 0; });
    var top = Object.keys(pri).filter(function (m) { return pri[m] >= 1 && ob[m]; });
    var rif = top.length ? top.reduce(function (s, m) { return s + cop[m]; }, 0) / top.length : 0;
    var out = {}, ritardo = [];
    Object.keys(pri).forEach(function (m) { out[m] = pri[m]; });
    if (rif > 0) Object.keys(pri).forEach(function (m) {
      var p = pri[m]; if (p < PRI_MIN || p >= 1 || !ob[m]) return;
      var rapp = cop[m] / rif;
      var def = Math.max(0, Math.min(1, Math.max((SOGLIA - rapp) / SOGLIA, (MINIMO - cop[m]) / MINIMO)));
      if (def <= 0) return;
      out[m] = Math.round((p + (1 - p) * def) * 100) / 100;
      ritardo.push({ m: m, copertura: cop[m], rif: rif, da: p, a: out[m] });
    });
    ritardo.sort(function (a, b) { return a.copertura - b.copertura; });
    return { pri: out, ritardo: ritardo, copertura: cop, rif: rif };
  }

  var API = { chiavi: chiavi, serieEff: serieEff, idDi: idDi, parti: parti, prossimaParte: prossimaParte, fattoDi: fattoDi, secondaParte: secondaParte,
    obiettivo: obiettivo, fattoSettimana: fattoSettimana, priorita: priorita, costanti: { GIORNI: GIORNI, SOGLIA: SOGLIA, MINIMO: MINIMO, PRI_MIN: PRI_MIN, MYO_EQ: MYO_EQ } };
  if (typeof module !== "undefined") module.exports = API; else root.Settimana = API;
})(this);
