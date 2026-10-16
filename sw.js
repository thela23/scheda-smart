/* Scheda Smart — service worker: l'app funziona anche senza rete e si aggiorna da sola.
 * Rete prima (con un limite di 3 s, per il wifi lento della palestra), poi la copia salvata.
 * Così ogni versione nuova pubblicata arriva alla prima apertura con la rete, e senza rete l'app parte lo stesso.
 * A ogni pubblicazione alzare VERSIONE (uguale al ?v= degli script in index.html).
 * Funziona solo da https (GitHub Pages) o localhost: dal file locale non si registra e non serve. */
var VERSIONE = "v20";
var CACHE = "scheda-smart-" + VERSIONE;
var FILE = [
  "./", "index.html", "manifest.webmanifest",
  "dati.js?v=20", "motore.js?v=20", "tasti.js?v=20", "sync.js?v=20", "sequenza.js?v=20", "app.js?v=20",
  "fonts/Gloock-Regular.ttf", "fonts/InstrumentSerif-Italic.ttf", "fonts/Inter-Regular.ttf", "fonts/Inter-Medium.ttf", "fonts/Inter-SemiBold.ttf",
  "icone/apple-touch-icon.png", "icone/icona-192.png", "icone/icona-512.png", "icone/favicon-32.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("scheda-smart-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(new Promise(function (resolve) {
    var fatto = false;
    var dallaCache = function () {
      var nav = req.mode === "navigate";
      return caches.match(req, { ignoreSearch: nav }).then(function (r) { return r || (nav ? caches.match("index.html") : null); });
    };
    var t = setTimeout(function () { dallaCache().then(function (r) { if (r && !fatto) { fatto = true; resolve(r); } }); }, 3000);
    fetch(req).then(function (res) {
      if (res && res.ok) { var copia = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
      clearTimeout(t); if (!fatto) { fatto = true; resolve(res); }
    }).catch(function () {
      clearTimeout(t); dallaCache().then(function (r) { if (!fatto) { fatto = true; resolve(r || Response.error()); } });
    });
  }));
});
