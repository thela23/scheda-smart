/* Scheda Smart — tasti, suoni e movimento, presi da Granalume (ui/app.js, sezione
 * "sounds: the keys go thock"). Vedi docs/STILE_GRANALUME.md nella cartella del progetto.
 *
 *   Tasti.play(nome, {vol, rate})   suoni sintetizzati, senza file: down, up, space, tick, notch, gong
 *   Tasti.haptic()                  vibrazione (Android) o colpetto aptico (iPhone con iOS 18)
 *   Tasti.land(el, {dy, soft})      molla di Granalume: SNAP per ciò che atterra, SOFT per ciò che arriva
 *   Tasti.prefs() / Tasti.set({})   impostazioni salvate in localStorage "ss_suoni_v1": { on, volume, switch }
 *
 * Ogni elemento .key (keycap) e ogni .set (cerchio della serie) suona da solo: giù "thock", su il ritorno.
 */
var Tasti = (function () {
  "use strict";
  var LSK = "ss_suoni_v1";
  var P = { on: true, volume: 0.7, switch: "thock" };
  try { var v = JSON.parse(localStorage.getItem(LSK) || "null"); if (v) for (var k in v) P[k] = v[k]; } catch (_) {}
  function prefs() { return P; }
  function set(o) { for (var k in o) P[k] = o[k]; try { localStorage.setItem(LSK, JSON.stringify(P)); } catch (_) {} if (o.switch) synth(); }

  /* ---------- il motore dei suoni di Granalume, portato com'è ---------- */
  var SND = { ctx: null, out: null, bank: {}, data: null, dataFor: null, bankFor: null };
  var SR = 48000;
  // telefono o tablet (dito, non mouse): altoparlante piccolo, si usa la voce "tel" degli switch
  var PICCOLO = (function () { try { return matchMedia("(pointer:coarse)").matches; } catch (_) { return false; } })();
  function audio() {
    if (SND.ctx) return SND.ctx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    // iPhone: "ambient" si mescola alla musica (Spotify non si ferma) e segue il tasto silenzioso
    try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (_) {}
    var ctx; try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = new AC(); }
    SND.ctx = ctx;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 3; comp.attack.value = 0.001; comp.connect(ctx.destination);
    SND.out = ctx.createGain(); SND.out.connect(comp);
    var warm = ctx.createBufferSource(); warm.buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.08), ctx.sampleRate);
    warm.connect(ctx.destination); warm.start();
    if (ctx.state !== "running") ctx.resume().catch(function () {});
    return ctx;
  }
  function switchTake(o, variant) {
    return function (d, sr) {
      var seed = (o.seed || 1) * 7919 + variant * 104729;
      var rnd = function () { seed = seed * 16807 % 2147483647; return seed / 1073741823.5 - 1; };
      var k = function (fc) { return 1 - Math.exp(-2 * Math.PI * fc / sr); };
      var N = d.length, ex = new Float32Array(N), i, t;
      o.hits.map(function (h) { return [h[0] * (1 + rnd() * 0.12), h[1] * (1 + rnd() * 0.1), h[2], h[3]]; }).forEach(function (h) {
        var lp = 0, lp2 = 0, kb = k(h[3]), i0 = Math.round(h[0] * sr);
        for (i = i0; i < N; i++) { t = (i - i0) / sr; if (t > h[2] * 8) break; var n = rnd(); lp += kb * (n - lp); lp2 += kb * (lp - lp2); ex[i] += lp2 * h[1] * Math.exp(-t / h[2]); }
      });
      o.modes.forEach(function (m) {
        var f = m[0] * (1 + rnd() * 0.035), w = 2 * Math.PI * f / sr, r = Math.exp(-1 / (m[2] * sr)), c = 2 * r * Math.cos(w), r2 = r * r, b = (1 - r2) * m[1];
        var y1 = 0, y2 = 0;
        for (i = 0; i < N; i++) { var y = b * ex[i] + c * y1 - r2 * y2; y2 = y1; y1 = y; d[i] += y; }
      });
      var hp = 0, lo = 0, kt = k(o.tone), kh = k(o.low || 90);
      for (i = 0; i < N; i++) { var x = d[i] + ex[i] * (o.dry || 0.25); lo += kt * (x - lo); hp += kh * (lo - hp); d[i] = lo - hp; }
    };
  }
  var SOUNDS = {
    down: { dur: .06, seed: 7, tone: 5200, dry: .32, low: 190, hits: [[0, .55, .0004, 7000], [.003, 1, .0018, 2600]],
      modes: [[240, .55, .0055], [310, .75, .005], [400, 1, .0045], [520, .95, .004], [660, .85, .0035], [840, .7, .003], [1080, .5, .0025], [1400, .38, .002], [1850, .25, .0015], [2600, .14, .001]] },
    up: { dur: .04, seed: 11, tone: 6500, dry: .4, low: 260, hits: [[0, .8, .0007, 5000]],
      modes: [[480, .5, .003], [640, .7, .0028], [850, .8, .0025], [1150, .7, .002], [1550, .55, .0016], [2100, .4, .0012], [2900, .25, .0009]] },
    space: { dur: .085, seed: 3, tone: 4500, dry: .28, low: 150, hits: [[0, .45, .0005, 6500], [.0035, 1, .0024, 2000], [.011, .1, .0005, 6500]],
      modes: [[180, .5, .008], [235, .75, .0075], [300, 1, .0068], [390, .95, .006], [500, .85, .005], [650, .65, .0042], [850, .5, .0034], [1120, .35, .0026], [1500, .22, .0018], [2100, .12, .0012]] },
    tick: { dur: .025, seed: 19, plain: true, tone: 7000, dry: .45, low: 300, hits: [[0, .9, .0004, 8000]],
      modes: [[1300, .5, .0016], [1750, .7, .0014], [2400, .8, .0012], [3300, .6, .001], [4500, .3, .0008]] },
    notch: { dur: .022, seed: 23, plain: true, tone: 5200, dry: .3, low: 380, hits: [[0, .9, .0003, 6000]],
      modes: [[820, .55, .0013], [1180, .85, .0011], [1650, .7, .0009], [2300, .4, .0007], [3200, .2, .0005]] },
    // nuovo per la palestra: fine recupero, una campana chiara che si sente anche a qualche metro
    gong: { dur: 1.6, seed: 29, plain: true, tone: 9000, dry: .04, low: 160, hits: [[0, 1, .0006, 5000]],
      modes: [[660, .9, .45], [990, .7, .32], [1320, .55, .26], [1980, .35, .18], [2640, .2, .12], [3300, .12, .08]] }
  };
  // tel: come suona lo switch dall'altoparlante del telefono, che sotto i ~450 Hz non suona quasi nulla.
  // Il corpo grave del thock sparirebbe e i tre switch sembrerebbero tutti clacky: si aggiungono le armoniche
  // dei modi gravi (l'orecchio ricostruisce la nota bassa da sole: "fondamentale mancante") e si allunga il
  // thock, così la differenza resta. Su PC e cuffie non cambia niente: suona come Granalume.
  var SWITCHES = { thock: { f: .92, tau: 1.1, tone: .85, contact: .75, tel: { harm: [[2, 1.2]], tau: 2, tone: .45, contact: .2 } },
    creamy: { f: 1.2, tau: .7, tone: .62, contact: .2, knockLen: 1.8, knockBr: .5, bodyGain: .4, hiGain: .35, dry: .4, lowMul: 1.8, extra: [[660, 2.2, .007]], upVol: .5,
      tel: { harm: [[2, .5]], tau: 1.1, extra: [[1250, 2.2, .012]] } },
    clacky: { f: 1.9, tau: .8, tone: 2.2, contact: 2.5, knockLen: .5, knockBr: 2.2, bodyGain: .3, hiGain: 1.4, hiTau: 1.4, dry: 2, lowMul: 3, extra: [[3200, 1, .004]], upVol: 1.3, upF: 1.3,
      tel: { tone: 1.6, contact: 1, extra: [[4300, 1.4, .003], [2600, .8, .004]] } } };
  var nn = function (a, b) { return a == null ? b : a; };
  function voiced(o, sw, name) {
    var v = SWITCHES[sw] || SWITCHES.thock, f = v.f * (name === "up" ? nn(v.upF, 1) : 1), t = PICCOLO && v.tel ? v.tel : {};
    var modes = o.modes.map(function (m) {
      return [m[0] * f, m[1] * (m[0] < 450 ? nn(v.bodyGain, 1) : 1) * (m[0] > 1000 ? nn(v.hiGain, 1) : 1), m[2] * v.tau * nn(t.tau, 1) * (m[0] > 1000 ? nn(v.hiTau, 1) : 1)];
    });
    var arm = [];
    modes.forEach(function (m) { if (m[0] < 500) (t.harm || []).forEach(function (h) { arm.push([m[0] * h[0], m[1] * h[1], m[2]]); }); });
    modes = modes.concat(arm);
    (v.extra || []).concat(t.extra || []).forEach(function (m) { modes.push(m); });
    if (t.contact || t.tone) v = Object.assign({}, v, { contact: nn(t.contact, v.contact), tone: v.tone * nn(t.tone, 1) });
    return { seed: o.seed, dur: o.dur, tone: o.tone * v.tone, low: (o.low || 90) * nn(v.lowMul, f), dry: nn(o.dry, .25) * nn(v.dry, 1), modes: modes,
      hits: o.hits.map(function (h, i) { return i === 0 ? [h[0], Math.min(1, h[1] * v.contact), h[2], h[3] * v.tone] : [h[0], h[1], h[2] * nn(v.knockLen, 1), h[3] * nn(v.knockBr, v.tone)]; }) };
  }
  // quattro varianti di ogni suono, così una raffica non suona come una mitragliatrice
  function synth() {
    var sw = P.switch; if (SND.dataFor === sw) return;
    SND.data = {}; SND.dataFor = sw;
    Object.keys(SOUNDS).forEach(function (name) {
      var S = SWITCHES[sw] || SWITCHES.thock;
      var o = SOUNDS[name], v = o.plain ? o : voiced(o, sw, name), dur = o.dur * (o.plain ? 1 : S.tau * (PICCOLO && S.tel ? nn(S.tel.tau, 1) : 1));
      SND.data[name] = (name === "gong" ? [0] : [0, 1, 2, 3]).map(function (i) {
        var n = Math.round(SR * dur), d = new Float32Array(n), j, m = 0; switchTake(v, i)(d, SR);
        for (j = 0; j < n; j++) m = Math.max(m, Math.abs(d[j])); if (m) for (j = 0; j < n; j++) d[j] *= .85 / m;
        for (j = 0; j < 64 && j < n; j++) d[n - 1 - j] *= j / 64;
        return d;
      });
    });
  }
  function buffers() {
    if (SND.bankFor === SND.dataFor) return;
    SND.bank = {}; SND.bankFor = SND.dataFor;
    Object.keys(SND.data).forEach(function (name) {
      SND.bank[name] = SND.data[name].map(function (d) { var b = SND.ctx.createBuffer(1, d.length, SR); b.copyToChannel(d, 0); return b; });
    });
  }
  function play(name, o) {
    o = o || {}; var vol = nn(o.vol, 1), rate = nn(o.rate, 1);
    if (!P.on || !P.volume) return;
    if (name === "up") vol = Math.min(1, vol * nn((SWITCHES[P.switch] || SWITCHES.thock).upVol, 1));
    synth(); var ctx = audio(); if (!ctx) return; buffers();
    var start = function () {
      var src = ctx.createBufferSource(), g = ctx.createGain(), takes = SND.bank[name];
      src.buffer = takes[Math.floor(Math.random() * takes.length)]; src.playbackRate.value = rate * (1 + (Math.random() - .5) * .03);
      g.gain.value = Math.pow(P.volume, 1.6) * vol * (.9 + Math.random() * .1);
      src.connect(g); g.connect(SND.out); src.start(ctx.currentTime + .003);
    };
    var t0 = performance.now();
    var when = function () {
      if (ctx.state === "running" && ctx.currentTime > .04) start();
      else { if (ctx.state !== "running") ctx.resume().catch(function () {}); if (performance.now() - t0 < 600) requestAnimationFrame(when); }
    };
    when();
  }
  // l'audio si apre in silenzio al primo tocco, così il primo suono è intero
  (function () {
    var go = function () { removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true); synth(); if (P.on) audio(); };
    addEventListener("pointerdown", go, true); addEventListener("keydown", go, true);
    (window.requestIdleCallback || function (f) { setTimeout(f, 800); })(synth);
  })();

  /* ---------- vibrazione ---------- */
  var hap = null;
  function haptic(pattern) {
    try {
      if (navigator.vibrate) { navigator.vibrate(pattern || 8); return; }
      // iPhone (iOS 18): cliccare un interruttore nativo dà un colpetto aptico
      if (!hap) {
        hap = document.createElement("label"); hap.setAttribute("aria-hidden", "true");
        hap.style.cssText = "position:fixed;left:-200px;top:0;opacity:0;pointer-events:none";
        hap.innerHTML = '<input type="checkbox" switch tabindex="-1">'; document.body.appendChild(hap);
      }
      hap.click();
    } catch (_) {}
  }

  /* ---------- molle (Granalume: SNAP k 280 d 24, SOFT k 170 d 26) ---------- */
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function spring(k, d) { var a = [], x = 1, v = 0, dt = 1 / 120; for (var i = 0; i < 480; i++) { v += (-k * x - d * v) * dt; x += v * dt; if (i % 2 === 0) a.push(x); if (Math.abs(x) < .002 && Math.abs(v) < .02) break; } a.push(0); return a; }
  var SNAP = spring(280, 24), SOFT = spring(170, 26);
  function land(el, o) {
    o = o || {}; if (RM || !el || !el.animate) return;
    var dy = nn(o.dy, 10), fade = nn(o.fade, .6), s = o.soft ? SOFT : SNAP;
    var fr = s.map(function (x) { return { transform: "translateY(" + (x * dy).toFixed(2) + "px)", opacity: Math.max(0, Math.min(1, 1 - x * fade)) }; });
    el.animate(fr, { duration: fr.length * 1000 / 60, easing: "linear" });
  }

  /* ---------- ogni keycap suona da solo ---------- */
  function loud(k) { return k.classList.contains("space") || k.classList.contains("apply"); }
  document.addEventListener("pointerdown", function (e) {
    var k = e.target.closest && e.target.closest(".key,.set");
    if (!k || k.disabled) return;
    k.classList.add("down"); play(k.classList.contains("set") ? "down" : loud(k) ? "space" : "down");
  }, true);
  function up() { var d = document.querySelectorAll(".key.down,.set.down"); for (var i = 0; i < d.length; i++) d[i].classList.remove("down"); if (d.length) play("up", { vol: .7 }); }
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", up, true);
  // dalla tastiera del PC: il tasto si accende un attimo, con il suo suono, poi agisce
  function press(k) {
    if (!k || k.disabled) return;
    k.classList.add("down"); play(loud(k) ? "space" : "down");
    setTimeout(function () { k.classList.remove("down"); play("up", { vol: .7 }); k.click(); }, 85);
  }

  return { play: play, haptic: haptic, land: land, press: press, prefs: prefs, set: set };
})();
