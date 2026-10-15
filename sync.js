/* Scheda Smart — sincronizzazione tra iPhone e PC tramite un gist privato di GitHub (account personale).
 *
 * Il gist contiene un solo file, scheda-smart.json:
 *   { app: "scheda-smart", formato: 2, aggiornato, sedute: {id: seduta}, carichi: {ts, loads, tk}, cancellate: {id: ts} }
 * Ogni dispositivo tiene i suoi dati in localStorage come prima; a ogni modifica (e all'apertura) li fonde con
 * quelli del gist e riscrive il gist se serve. Funziona anche offline: si riallinea quando torna la rete.
 *
 * Regole della fusione (merge, pura e testata in test/sync.js):
 *   sedute      per id vince quella con ts più recente; sparisce se è stata cancellata dopo il suo ultimo ts
 *   cancellate  per id vince la data più recente (servono perché una seduta eliminata non torni dall'altro telefono)
 *   carichi     per esercizio vince la modifica più recente (tk[key] = quando è cambiato; senza valore = ripristinato)
 *
 * Il token (classico, solo permesso "gist") si incolla nell'app: resta solo in quel dispositivo.
 */
(function (root) {
  "use strict";
  var FILE = "scheda-smart.json", DESCR = "Scheda Smart · sincronizzazione (non modificare a mano)";

  function tsDi(s) { return (s && s.ts) || 0; }

  function merge(a, b) {
    a = a || {}; b = b || {};
    var canc = {}, k;
    [a.cancellate || {}, b.cancellate || {}].forEach(function (c) { for (k in c) canc[k] = Math.max(canc[k] || 0, c[k] || 0); });
    var sed = {};
    [a.sedute || {}, b.sedute || {}].forEach(function (S) {
      for (k in S) { var s = S[k]; if (s && (!sed[k] || tsDi(s) > tsDi(sed[k]))) sed[k] = s; }
    });
    for (k in sed) if (canc[k] && canc[k] >= tsDi(sed[k])) delete sed[k];

    var ca = a.carichi || {}, cb = b.carichi || {}, la = ca.loads || {}, lb = cb.loads || {}, ta = ca.tk || {}, tb = cb.tk || {};
    var loads = {}, tk = {}, keys = {};
    for (k in la) keys[k] = 1; for (k in lb) keys[k] = 1; for (k in ta) keys[k] = 1; for (k in tb) keys[k] = 1;
    for (k in keys) {
      // un carico senza data della modifica (dati vecchi) vale quanto la data generale dei suoi carichi
      var xa = ta[k] != null ? ta[k] : (k in la ? ca.ts || 0 : -1);
      var xb = tb[k] != null ? tb[k] : (k in lb ? cb.ts || 0 : -1);
      var vinceB = xb > xa, src = vinceB ? lb : la, t = vinceB ? xb : xa;
      if (k in src) loads[k] = src[k];
      if (t > 0) tk[k] = t;
    }
    return { sedute: sed, cancellate: canc, carichi: { ts: Math.max(ca.ts || 0, cb.ts || 0), loads: loads, tk: tk } };
  }

  // confronto stabile, per sapere se qualcosa è cambiato davvero
  function stabile(v) {
    if (Array.isArray(v)) return "[" + v.map(stabile).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stabile(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  function uguali(a, b) { return stabile(a) === stabile(b); }

  /* ---------- il gist ---------- */
  function api(token, path, opt) {
    opt = opt || {};
    return fetch("https://api.github.com" + path, {
      method: opt.method || "GET", cache: "no-store",
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "Content-Type": "application/json" },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    }).then(function (r) {
      if (r.status === 401) throw errore("token", "Il token non è valido o è scaduto.");
      if (r.status === 403 || r.status === 404) throw errore("permesso", "Il token non ha il permesso «gist».");
      if (!r.ok) throw errore("rete", "GitHub ha risposto " + r.status + ".");
      return r.json();
    }, function () { throw errore("offline", "Nessuna connessione: riprovo quando torna la rete."); });
  }
  function errore(tipo, msg) { var e = new Error(msg); e.tipo = tipo; return e; }

  // trova il gist della Scheda Smart (o lo crea, privato) e restituisce il suo id
  function trova(token) {
    return api(token, "/gists?per_page=100").then(function (lista) {
      var g = (lista || []).filter(function (x) { return x.files && x.files[FILE]; })[0];
      if (g) return g.id;
      var files = {}; files[FILE] = { content: JSON.stringify(vuoto(), null, 1) };
      return api(token, "/gists", { method: "POST", body: { description: DESCR, public: false, files: files } }).then(function (n) { return n.id; });
    });
  }
  function vuoto() { return { app: "scheda-smart", formato: 2, aggiornato: null, sedute: {}, carichi: { ts: 0, loads: {}, tk: {} }, cancellate: {} }; }
  function leggi(token, id) {
    return api(token, "/gists/" + id).then(function (g) {
      var f = g.files && g.files[FILE];
      if (!f) return vuoto();
      var testo = f.truncated && f.raw_url ? null : f.content;
      if (testo != null) return JSON.parse(testo || "{}");
      return fetch(f.raw_url, { cache: "no-store" }).then(function (r) { return r.json(); });
    });
  }
  function scrivi(token, id, dati) {
    var files = {}; files[FILE] = { content: JSON.stringify(dati, null, 1) };
    return api(token, "/gists/" + id, { method: "PATCH", body: { files: files } });
  }

  var API = { merge: merge, uguali: uguali, trova: trova, leggi: leggi, scrivi: scrivi, vuoto: vuoto, FILE: FILE };
  if (typeof module !== "undefined") module.exports = API; else root.SyncGist = API;
})(this);
