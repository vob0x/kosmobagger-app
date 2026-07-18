import { Game, TANK_MAX, BAT_MAX } from "./engine.js";
import { CARD_BACK, WORLD_COLORS } from "./cards.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Sound v2 (Web Audio: Hall, geschichtete Impacts, FM-Glocken) ----------
const Snd = (() => {
  let ctx = null, master = null, verbGain = null, noiseBuf = null, muted = false, buffers = {};
  const NAMES = ["click", "tick", "place", "reveal", "clash", "score", "win", "lose"];
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
      master.connect(comp); comp.connect(ctx.destination);
      const verb = ctx.createConvolver(); verb.buffer = impulse(2.0, 3.2);
      verbGain = ctx.createGain(); verbGain.gain.value = 0.32; verb.connect(verbGain); verbGain.connect(master);
      Snd._verb = verb;
      const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseBuf = n;
      loadSamples();
    } catch (e) { ctx = null; }
  }
  function loadSamples() {
    for (const nm of NAMES) {
      fetch(`assets/sfx/${nm}.wav`).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(b => ctx.decodeAudioData(b)).then(buf => { buffers[nm] = buf; }).catch(() => {});
    }
  }
  function play(nm, g = 0.9) {
    if (muted || !ctx || !buffers[nm]) return false;
    const s = ctx.createBufferSource(); s.buffer = buffers[nm];
    const a = ctx.createGain(); a.gain.value = g; s.connect(a); a.connect(master);
    s.start(); return true;
  }
  function impulse(dur, decay) {
    const rate = ctx.sampleRate, len = rate * dur, b = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  const t = () => ctx.currentTime;
  function voice(type, f0, dur, g, { to = null, wet = 0.5, dest = null } = {}) {
    const o = ctx.createOscillator(), a = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t());
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t() + dur);
    a.gain.setValueAtTime(0.0001, t()); a.gain.exponentialRampToValueAtTime(g, t() + 0.008);
    a.gain.exponentialRampToValueAtTime(0.0001, t() + dur);
    o.connect(a); a.connect(dest || master); if (Snd._verb) { const s = ctx.createGain(); s.gain.value = wet; a.connect(s); s.connect(Snd._verb); }
    o.start(); o.stop(t() + dur + 0.05);
  }
  function noise(dur, g, { lp = null, hp = null, wet = 0.4 } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; let node = s;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; node.connect(f); node = f; }
    if (hp) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp; node.connect(f); node = f; }
    const a = ctx.createGain(); a.gain.setValueAtTime(g, t()); a.gain.exponentialRampToValueAtTime(0.0001, t() + dur);
    node.connect(a); a.connect(master); if (Snd._verb) { const w = ctx.createGain(); w.gain.value = wet; a.connect(w); w.connect(Snd._verb); }
    s.start(); s.stop(t() + dur + 0.05);
  }
  function bell(freq, dur, g, delay = 0) {
    const st = t() + delay, car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), a = ctx.createGain();
    car.frequency.value = freq; mod.frequency.value = freq * 2.007; mg.gain.value = freq * 1.6; mod.connect(mg); mg.connect(car.frequency);
    a.gain.setValueAtTime(0.0001, st); a.gain.exponentialRampToValueAtTime(g, st + 0.006); a.gain.exponentialRampToValueAtTime(0.0001, st + dur);
    car.connect(a); a.connect(master); if (Snd._verb) { const w = ctx.createGain(); w.gain.value = 0.6; a.connect(w); w.connect(Snd._verb); }
    car.start(st); car.stop(st + dur + 0.05); mod.start(st); mod.stop(st + dur + 0.05);
  }
  const ok = () => ctx && !muted;
  return {
    resume() { init(); try { ctx.resume(); } catch (e) {} },
    toggle() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02); return muted; },
    get muted() { return muted; },
    click() { if (!ok()) return; if (play("click", 0.6)) return; voice("triangle", 540, 0.09, 0.10, { to: 400, wet: 0.25 }); },
    hover() { if (!ok()) return; voice("sine", 760, 0.05, 0.04, { to: 940, wet: 0.2 }); },
    place() { if (!ok()) return; if (play("place", 0.95)) return; voice("sine", 190, 0.2, 0.28, { to: 62 }); noise(0.11, 0.2, { lp: 1700 }); voice("triangle", 520, 0.09, 0.08, { to: 300, wet: 0.3 }); },
    tick() { if (!ok()) return; if (play("tick", 0.6)) return; voice("square", 900, 0.05, 0.07, { to: 850, wet: 0.2 }); },
    reveal() { if (!ok()) return; if (play("reveal", 0.85)) return; noise(0.34, 0.14, { hp: 500, lp: 5200 }); voice("sawtooth", 200, 0.4, 0.10, { to: 1000, wet: 0.5 }); },
    clash() { if (!ok()) return; if (play("clash", 1.0)) return; voice("sine", 150, 0.55, 0.55, { to: 34, wet: 0.7 }); noise(0.2, 0.4, { lp: 2600 }); voice("square", 320, 0.22, 0.16, { to: 110 }); voice("sawtooth", 1000, 0.28, 0.09, { to: 420, wet: 0.6 }); },
    score() { if (!ok()) return; if (play("score", 0.9)) return;[784, 988, 1319, 1568].forEach((f, i) => bell(f, 0.6, 0.14, i * 0.085)); },
    win() { if (!ok()) return; if (play("win", 0.95)) return; const ch = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175]]; ch.forEach((c, i) => setTimeout(() => { if (ok()) c.forEach(f => voice("sawtooth", f, 0.55, 0.075, { wet: 0.6 })); }, i * 160)); [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, 0.7, 0.12, 0.72 + i * 0.12)); },
    lose() { if (!ok()) return; if (play("lose", 0.9)) return;[392, 311, 262, 196].forEach((f, i) => voice("sawtooth", f, 0.4, 0.13, { to: f * 0.6, wet: 0.5 })); },
  };
})();

function confetti() {
  const cv = document.createElement("canvas"); cv.className = "confetti";
  const ctx = cv.getContext && cv.getContext("2d");
  if (!ctx || typeof requestAnimationFrame !== "function") return;   // headless: still no crash
  cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
  const cols = ["#ffcf3f", "#57d0e8", "#37c86a", "#ff5a5a", "#6b83d6", "#fff"];
  const P = [...Array(160)].map(() => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .5, r: 4 + Math.random() * 7, vy: 2 + Math.random() * 4.5, vx: -2.5 + Math.random() * 5, c: cols[~~(Math.random() * cols.length)], a: Math.random() * 6 }));
  const t0 = performance.now();
  (function loop(t) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of P) { p.x += p.vx; p.y += p.vy; p.a += .12; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); ctx.restore(); }
    if (t - t0 < 4200) requestAnimationFrame(loop); else cv.remove();
  })(t0);
}

// ---------- FX: animierter Weltraum-Hintergrund + Partikel + Screen-Shake ----------
const FX = (() => {
  let bg, bgc, fx, fxc, W = 0, H = 0, on = false, stars = [], neb = [], parts = [];
  function ensure() {
    if (on) return true;
    if (typeof document === "undefined" || typeof requestAnimationFrame !== "function") return false;
    bg = document.createElement("canvas"); bg.id = "bg";
    fx = document.createElement("canvas"); fx.id = "fx";
    bgc = bg.getContext && bg.getContext("2d"); fxc = fx.getContext && fx.getContext("2d");
    if (!bgc || !fxc) return false;
    document.body.insertBefore(bg, document.body.firstChild); document.body.appendChild(fx);
    resize(); window.addEventListener("resize", resize);
    for (let i = 0; i < 220; i++) stars.push({ x: Math.random(), y: Math.random(), z: Math.random(), tw: Math.random() * 6, s: Math.random() * 0.02 });
    for (let i = 0; i < 6; i++) neb.push({ x: Math.random(), y: Math.random(), r: 0.28 + Math.random() * 0.45, h: [214, 265, 192, 150][~~(Math.random() * 4)], p: Math.random() * 6 });
    on = true; requestAnimationFrame(loop); return true;
  }
  function resize() { W = innerWidth; H = innerHeight; [bg, fx].forEach(c => { c.width = W; c.height = H; }); }
  function loop(t) {
    bgc.clearRect(0, 0, W, H);
    for (const n of neb) { const g = bgc.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, n.r * Math.max(W, H)); const a = 0.05 + 0.03 * Math.sin(t / 2600 + n.p); g.addColorStop(0, `hsla(${n.h},70%,55%,${a})`); g.addColorStop(1, "transparent"); bgc.fillStyle = g; bgc.fillRect(0, 0, W, H); }
    for (const s of stars) { s.y += s.s / 60; if (s.y > 1) s.y = 0; const x = s.x * W, y = s.y * H, a = 0.35 + 0.65 * Math.abs(Math.sin(t / 700 + s.tw)), r = s.z * 1.6 + 0.3; bgc.fillStyle = `rgba(200,220,255,${a * s.z})`; bgc.beginPath(); bgc.arc(x, y, r, 0, 7); bgc.fill(); }
    fxc.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.life--; const al = Math.max(0, p.life / p.max);
      if (p.ring) { fxc.strokeStyle = `rgba(${p.c},${al})`; fxc.lineWidth = p.lw * al + 0.6; fxc.beginPath(); fxc.arc(p.x, p.y, p.r0 + p.r * (1 - al), 0, 7); fxc.stroke(); }
      else { fxc.fillStyle = `rgba(${p.c},${al})`; fxc.save(); fxc.translate(p.x, p.y); p.a += p.va; fxc.rotate(p.a); fxc.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * (p.long ? 2.6 : 0.75)); fxc.restore(); }
      if (p.life <= 0) parts.splice(i, 1);
    }
    requestAnimationFrame(loop);
  }
  const push = o => { if (ensure()) parts.push(o); };
  return {
    start() { ensure(); },
    burst(x, y, c, n = 26, { spread = 8, g = 0.28, long = false } = {}) { if (!ensure()) return; for (let i = 0; i < n; i++) { const a = Math.random() * 7, sp = 1 + Math.random() * spread; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, g, life: 34 + Math.random() * 34, max: 68, s: 3 + Math.random() * 5, a: Math.random() * 7, va: -0.25 + Math.random() * 0.5, c, long }); } },
    ring(x, y, c, r0 = 12) { push({ ring: true, x, y, vx: 0, vy: 0, g: 0, life: 32, max: 32, r: 150, r0, lw: 7, c, a: 0, va: 0 }); },
    sparkle(x, y, c, n = 20) { if (!ensure()) return; for (let i = 0; i < n; i++) { const a = Math.random() * 7, sp = 1 + Math.random() * 4.5; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.03, life: 34 + Math.random() * 28, max: 62, s: 2 + Math.random() * 3, a: 0, va: 0.3, c, long: true }); } },
    rain(c) { if (!ensure()) return; for (let i = 0; i < 160; i++) parts.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: -1 + Math.random() * 2, vy: 2 + Math.random() * 4.5, g: 0.03, life: 150 + Math.random() * 120, max: 220, s: 4 + Math.random() * 6, a: Math.random() * 7, va: 0.15, c: c || ["255,207,63", "87,208,232", "55,200,106", "255,90,90"][~~(Math.random() * 4)], long: false }); },
  };
})();

function shake(power = 1) {
  const el = $("#table"); if (!el) return;
  el.style.animation = "none"; void el.offsetWidth;
  el.style.animation = `shake ${0.16 + 0.06 * power}s cubic-bezier(.36,.07,.19,.97)`;
  el.style.setProperty("--sh", (5 + 7 * power) + "px");
}
function flashScreen() {
  let f = $("#flash"); if (!f) { f = document.createElement("div"); f.id = "flash"; document.body.appendChild(f); }
  f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
}
function centerOf(sel) { const r = ($(sel) || {}).getBoundingClientRect ? $(sel).getBoundingClientRect() : null; return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }; }

// Animationen nur im echten Browser (headless: kein requestAnimationFrame -> No-op)
function fxOn() { return typeof document !== "undefined" && typeof requestAnimationFrame === "function"; }
function floatText(x, y, text, color, big) {
  if (!fxOn() || x == null) return;
  const d = document.createElement("div"); d.className = "floattext" + (big ? " xl" : "");   // NICHT "big" — das ist die Button-Klasse!
  d.textContent = text; d.style.left = x + "px"; d.style.top = y + "px"; if (color) d.style.color = color;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2300);
}
// Laesst die zuletzt gefuellte Zelle einer Anzeige kraeftig aufpoppen + Funken.
function flashNewCell(sel, rgb) {
  const t = $(sel); if (!t || !t.classList) return;
  t.classList.remove("pulse"); void t.offsetWidth; t.classList.add("pulse");
  const on = t.querySelectorAll(".cell.on"); const last = on[on.length - 1];
  if (last) { last.classList.remove("justfilled"); void last.offsetWidth; last.classList.add("justfilled"); }
  const c = centerOf(sel); FX.ring(c.x, c.y, rgb || "255,224,130", 9); FX.sparkle(c.x, c.y, rgb || "255,232,150", 16);
}
function flyToken(img, toSel, from) {
  if (!fxOn()) return;
  const to = centerOf(toSel), s = from || { x: innerWidth / 2, y: innerHeight / 2 };
  const im = document.createElement("img"); im.className = "flytoken"; im.src = img;
  im.style.left = s.x + "px"; im.style.top = s.y + "px"; document.body.appendChild(im);
  requestAnimationFrame(() => { im.style.left = to.x + "px"; im.style.top = to.y + "px"; im.style.transform = "translate(-50%,-50%) scale(.55)"; im.style.opacity = "0"; });
  setTimeout(() => { im.remove(); flashNewCell(toSel); }, 560);   // beim Ankommen: neue Zelle poppt deutlich auf
}

// Grosser Kristall zum Durchkommen: poppt gross auf, haelt kurz, fliegt dann in den Zaehler.
function bigCrystalPop(x, y, toSel) {
  if (!fxOn()) return;
  FX.ring(x, y, "120,225,255", 13); FX.sparkle(x, y, "150,235,255", 28);
  const im = document.createElement("img"); im.className = "bigcrystal"; im.src = "assets/kristall.png";
  im.style.left = x + "px"; im.style.top = y + "px"; document.body.appendChild(im);
  setTimeout(() => {                       // vom grossen Standbild zum Zaehler fliegen
    im.style.animation = "none"; im.style.transform = "translate(-50%,-50%) scale(1.25)"; im.style.opacity = "1"; void im.offsetWidth;
    const to = centerOf(toSel);
    im.style.transition = "left .6s cubic-bezier(.4,.1,.2,1),top .6s cubic-bezier(.4,.1,.2,1),transform .6s,opacity .6s";
    im.style.left = to.x + "px"; im.style.top = to.y + "px"; im.style.transform = "translate(-50%,-50%) scale(.34)"; im.style.opacity = ".15";
  }, 620);
  setTimeout(() => { im.remove(); flashNewCell(toSel, "120,225,255"); }, 1280);
}

// Karte legen: hebt von der Hand ab, schwebt hoch ueber die Flaeche zum Bauplatz
// und setzt dort verdeckt auf (kein flaches Rutschen).
function flyCardToSlot(card) {
  return new Promise(res => {
    if (!fxOn() || !card) return res();
    const src = document.querySelector(`#meArea .mehand .card[data-uid="${card.uid}"]`);
    const slot = $("#meSlot");
    if (!src || !slot || !src.getBoundingClientRect || !slot.getBoundingClientRect) return res();
    const r = src.getBoundingClientRect(), t = slot.getBoundingClientRect();
    if (!r.width || !t.width) return res();
    const g = document.createElement("div");
    g.className = "flycard hover";
    g.style.backgroundImage = `url("${card.img}")`;
    g.style.left = r.left + "px"; g.style.top = r.top + "px";
    g.style.width = r.width + "px"; g.style.height = r.height + "px";
    document.body.appendChild(g);
    src.style.visibility = "hidden";
    requestAnimationFrame(() => {            // Ziel-Position/-Groesse; das Abheben macht die CSS-Animation
      g.style.left = t.left + "px"; g.style.top = t.top + "px";
      g.style.width = t.width + "px"; g.style.height = t.height + "px";
    });
    setTimeout(() => { g.style.backgroundImage = `url("${CARD_BACK}")`; }, 640);  // dreht sich beim Aufsetzen verdeckt
    setTimeout(() => { g.classList.add("land"); }, 800);                          // kurzes Aufsetzen
    setTimeout(() => { g.remove(); res(); }, 1000);
  });
}

// ---------- Welten-Effekte im Kampf ----------
function hexRgb(h) { const n = parseInt(String(h).slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
function wRgb(card) { const c = card && WORLD_COLORS[card.world]; return c ? hexRgb(c) : "255,207,63"; }

// Jede Welt kaempft anders: Kosmos funkelt, Bau schuettet Schutt,
// Trucks qualmen und spruehen Funken, Technik entlaedt Energie.
function worldFx(card, p, strong = false) {
  if (!card || !p) return;
  const c = wRgb(card), n = strong ? 26 : 16;
  switch (card.world) {
    case "KOSMOS":
      FX.sparkle(p.x, p.y, c, n + 10);
      FX.sparkle(p.x, p.y, "200,225,255", n - 4);
      if (strong) FX.ring(p.x, p.y, c, 10);
      break;
    case "BAU":
      FX.burst(p.x, p.y, c, n, { spread: 7, g: 0.62 });            // Schutt faellt
      FX.burst(p.x, p.y, "158,146,124", n - 6, { spread: 3.5, g: 0.04 });  // Staubwolke
      break;
    case "TRUCKS":
      FX.burst(p.x, p.y, "122,124,138", n, { spread: 3.2, g: -0.05 });     // Qualm steigt
      FX.burst(p.x, p.y, "255,150,60", n - 4, { spread: 10, g: 0.5, long: true }); // Funken
      if (strong) FX.burst(p.x, p.y, c, 10, { spread: 8, g: 0.35 });
      break;
    case "TECHNIK":
      FX.sparkle(p.x, p.y, c, n + 6);
      FX.burst(p.x, p.y, "150,255,210", n - 4, { spread: 12, g: 0.02, long: true }); // Energie-Arcs
      if (strong) FX.ring(p.x, p.y, c, 8);
      break;
    default:
      FX.burst(p.x, p.y, c, n, { spread: 8 });
  }
}

const cfg = { mode: "ai", modules: 2, target: 5, ai: 0.85 };
let game = null;
let persp = 0;          // aus wessen Sicht der Tisch gerade gezeigt wird

// ---------- Menue ----------
$$("#menu .seg").forEach(seg => {
  seg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    seg.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    const opt = seg.dataset.opt, val = b.dataset.val;
    cfg[opt] = (opt === "target" || opt === "modules") ? +val : (opt === "ai" ? +val : val);
    if (opt === "mode") $("#opt-ai").style.display = val === "ai" ? "" : "none";
    Snd.click();
  });
});
$("#startBtn").addEventListener("click", () => { Snd.resume(); Snd.click(); startGame(); });

// Stummschalter (dynamisch, unten rechts)
const muteBtn = document.createElement("button");
muteBtn.id = "muteBtn"; muteBtn.textContent = "🔊"; muteBtn.title = "Ton an/aus";
muteBtn.addEventListener("click", () => { const m = Snd.toggle(); muteBtn.textContent = m ? "🔇" : "🔊"; });
$("#table").appendChild(muteBtn);
FX.start();   // Sternenfeld auch hinter dem Menue

// Menue-Logo (Emblem aus den App-Icons)
(() => {
  const box = document.querySelector(".menu-box"), h1 = box && box.querySelector("h1");
  if (box && h1 && !$("#menuLogo")) { const im = document.createElement("img"); im.id = "menuLogo"; im.src = "icons/icon-192.png"; im.alt = ""; box.insertBefore(im, h1); }
})();

// Optionale custom Grafiken: erscheinen automatisch, sobald die Dateien im assets/ liegen.
function tryImg(url, apply) {
  if (typeof Image === "undefined") return;
  const im = new Image(); im.onload = () => apply(url); im.onerror = () => {}; im.src = url;
}
tryImg("assets/arena.png", u => {
  let a = $("#arena"); if (!a) { a = document.createElement("div"); a.id = "arena"; document.body.insertBefore(a, $("#app")); }
  a.style.backgroundImage = `url('${u}')`;
});
tryImg("assets/hero.png", u => {
  const box = document.querySelector(".menu-box");
  if (box && !$("#menuHero")) { const hero = document.createElement("div"); hero.id = "menuHero"; hero.style.backgroundImage = `url('${u}')`; box.insertBefore(hero, box.firstChild); }
});
// Menue-Hintergrund: Intro-Video (stumm, Endlosschleife). Fehlt assets/intro.mp4,
// bleibt einfach das Standbild arena.png stehen.
let introVid = null;
(() => {
  try {
    if (typeof document === "undefined" || typeof document.createElement !== "function") return;
    const wrap = document.createElement("div"); wrap.id = "introwrap";
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = "auto";
    if (v.setAttribute) { v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); }
    if (v.addEventListener) {
      v.addEventListener("error", () => { if (wrap.remove) wrap.remove(); });
      // Autoplay ist nicht garantiert: bei canplay erneut versuchen, notfalls beim ersten Tap.
      v.addEventListener("canplay", () => playIntro());
      v.addEventListener("loadeddata", () => playIntro());
    }
    if (document.addEventListener) document.addEventListener("pointerdown", () => playIntro(), { once: true });
    v.src = "assets/intro.mp4";
    wrap.appendChild(v);
    const app = $("#app");
    if (app && app.parentNode && app.parentNode.insertBefore) app.parentNode.insertBefore(wrap, app);
    else document.body.appendChild(wrap);
    introVid = v;   // Loop wird erst NACH dem Intro-Splash gestartet (sonst kaempfen 2 Videos)
  } catch (e) { /* headless o.ae.: egal */ }
})();

// Erster Start pro Sitzung: Intro EINMAL als Vollbild-Splash zeigen (Menue erst danach,
// nichts liegt darueber). Danach uebernimmt der Menue-Hintergrund-Loop.
(() => {
  try {
    if (typeof requestAnimationFrame !== "function") return;                 // headless: kein Splash
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("kosmoIntroSeen")) { playIntro(); return; }
    const sp = document.createElement("div"); sp.id = "introsplash";
    const v = document.createElement("video");
    v.src = "assets/intro.mp4"; v.autoplay = true; v.muted = true; v.playsInline = true; v.preload = "auto";
    if (v.setAttribute) { v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); }
    const skip = document.createElement("button"); skip.id = "introskip"; skip.textContent = "Überspringen ▸";
    const snd = document.createElement("div"); snd.id = "introsound"; snd.textContent = "🔊 Antippen für Ton";
    sp.appendChild(v); sp.appendChild(skip); sp.appendChild(snd);
    (document.body || document.documentElement).appendChild(sp);
    let done = false;
    const end = (grund) => {
      window.__splashLog = (window.__splashLog || []).concat(grund || "?");
      if (done) return; done = true;
      try { sessionStorage.setItem("kosmoIntroSeen", "1"); } catch (e) {}
      sp.classList.add("gone"); setTimeout(() => sp.remove && sp.remove(), 520);
      playIntro();                                                           // Menue-Loop sicher starten
    };
    v.addEventListener("ended", () => end("ended"));
    v.addEventListener("error", () => end("error:" + (v.error && v.error.code)));
    v.addEventListener("loadedmetadata", () => {                             // praezise am Videoende beenden
      if (v.duration && isFinite(v.duration)) setTimeout(() => end("dur"), v.duration * 1000 + 250);
    });
    skip.addEventListener("click", e => { e.stopPropagation(); end("skip"); });
    // Tippen aufs Video: Ton dazuschalten (Browser erlaubt das nur per Geste). Nicht abbrechen.
    sp.addEventListener("click", () => {
      if (v.muted) { v.muted = false; const q = v.play && v.play(); if (q && q.catch) q.catch(() => {}); snd.classList.add("gone"); }
    });
    const p = v.play(); if (p && p.catch) p.catch(() => {});                 // Abbruch NICHT als Ende werten
    setTimeout(() => end("timeout"), 15000);                                 // ultimatives Sicherheitsnetz
  } catch (e) {}
})();

function playIntro() { if (!introVid || !introVid.play) return; const p = introVid.play(); if (p && p.catch) p.catch(() => {}); }
function backToMenu() {
  $("#table").classList.add("hidden"); $("#menu").classList.remove("hidden");
  if (document.body && document.body.classList) document.body.classList.remove("playing");
  playIntro();
}
$("#menuBtn").addEventListener("click", () => { backToMenu(); hideOverlay(); });

function startGame() {
  const hot = cfg.mode === "hot";
  game = new Game({
    modules: cfg.modules, target: cfg.target,
    deckDoubled: true, boosters: cfg.modules >= 2 ? 4 : 2, tows: 2,
    names: hot ? ["Spieler 1", "Spieler 2"] : ["Du", "Computer"],
    ai: hot ? [false, false] : [false, true],
    aiLevel: cfg.ai,
  });
  $("#menu").classList.add("hidden");
  $("#table").classList.remove("hidden");
  if (document.body && document.body.classList) document.body.classList.add("playing");
  if (introVid && introVid.pause) introVid.pause();     // im Spiel kein bewegter Hintergrund
  FX.start();
  ["oppDeck", "meDeck"].forEach(id => { if (!$("#" + id)) { const d = document.createElement("div"); d.id = id; d.className = "deckpile"; $("#battle").appendChild(d); } });
  persp = 0;
  advance();
}

function deckStack(n) {
  return `<div class="dcard" style="background-image:url('${CARD_BACK}')"></div><b>${n}</b>`;
}

// ---------- Overlay-Helfer ----------
const ov = $("#overlay"), ovi = $("#overlay-inner");
function showOverlay(html) { ovi.innerHTML = html; ov.classList.remove("hidden"); }
function hideOverlay() { ov.classList.add("hidden"); }

// ---------- Rendering ----------
function cardEl(card, { back = false, small = false } = {}) {
  const d = document.createElement("div");
  d.className = "card" + (back ? " back" : "");
  d.style.backgroundImage = `url("${back ? CARD_BACK : card.img}")`;
  if (!back && card && card.kraft) {
    const c = document.createElement("div"); c.className = "cost";
    for (let i = 0; i < card.cost; i++) c.appendChild(document.createElement("i"));
    d.appendChild(c);
  }
  return d;
}

// Anzeige beruecksichtigt die bereits getroffene (aber erst beim Aufdecken verrechnete) Wahl:
// bezahlter Treibstoff/Batterie verschwindet sofort aus dem Zaehler, die gespielte Karte
// verlaesst die Hand. Nur fuer die eigene Seite — beim Gegner wuerde das die Wahl verraten.
function pendPlayUid(p) { const t = p.pending && p.pending.type; return (t === "build" || t === "booster" || t === "tow") ? p.pending.uid : null; }
function dispFuel(p) { if (p.pending && p.pending.type === "build") { const c = game.handCard(p, p.pending.uid); if (c) return Math.max(0, p.fuel - c.cost); } return p.fuel; }
function dispBat(p) { return (p.pending && p.pending.type === "build" && p.pending.turbo && p.bat > 0) ? Math.max(0, p.bat - 1) : p.bat; }

function renderBoard() {
  const me = game.players[persp], op = game.players[1 - persp];
  // Info
  const meA = $("#meArea"), opA = $("#oppArea");
  meA.querySelector(".pname").textContent = me.name;
  opA.querySelector(".pname").textContent = op.name;
  for (const [area, p, isMe] of [[meA, me, true], [opA, op, false]]) {
    const f = isMe ? dispFuel(p) : p.fuel, b = isMe ? dispBat(p) : p.bat;
    area.querySelector(".tank").innerHTML = gauge("assets/kanister.png", f, TANK_MAX);
    area.querySelector(".batt").innerHTML = gauge("assets/batterie.png", b, BAT_MAX);
    area.querySelector(".crystals").innerHTML = gauge("assets/kristall.png", p.crystals, game.opts.target, true) + `<b>${p.crystals}/${game.opts.target}</b>`;
    area.querySelector(".batt").style.display = game.opts.modules >= 2 ? "" : "none";
  }

  // Gegnerhand (Rueckseiten)
  const oh = opA.querySelector(".opphand"); oh.innerHTML = "";
  for (let i = 0; i < op.hand.length; i++) oh.appendChild(cardEl(null, { back: true }));

  // Slots (stehende Maschinen)
  slotRenderPre($("#oppSlot"), op);
  slotRenderPre($("#meSlot"), me);
  if ($("#meDeck")) $("#meDeck").innerHTML = deckStack(me.deck.length);
  if ($("#oppDeck")) $("#oppDeck").innerHTML = deckStack(op.deck.length);

  // Meine Hand
  renderHand();
}

function gauge(icon, filled, total, gem) {
  let s = "";
  for (let i = 0; i < total; i++) s += `<i class="cell${i < filled ? " on" : ""}${gem ? " gem" : ""}"><img src="${icon}" alt=""></i>`;
  return s;
}

function pips(box, val, max, cls) {
  box.innerHTML = "";
  for (let i = 0; i < max; i++) {
    const s = document.createElement("span");
    if (i < val) s.className = cls;
    box.appendChild(s);
  }
}

// Vor dem Aufdecken: stehende Maschine offen, neu gespielte Karte verdeckt (Rueckseite).
function slotRenderPre(el, p) {
  if (p.slot && (!p.pending || p.pending.type === "none")) { slotShow(el, p.slot, p.slotTurbo); return; }
  const t = p.pending && p.pending.type;
  if (t === "build" || t === "booster" || t === "tow") {
    el.innerHTML = ""; el.classList.remove("empty");
    const c = cardEl(null, { back: true }); c.classList.add("pending");
    el.appendChild(c); return;
  }
  slotShow(el, p.slot, p.slotTurbo);
}

function slotShow(el, card, turbo) {
  el.innerHTML = ""; el.classList.toggle("empty", !card);
  if (card) {
    const c = cardEl(card); c.classList.add("idle");
    if (turbo) { const t = document.createElement("div"); t.className = "turbobadge"; t.textContent = "+2"; c.appendChild(t); }
    el.appendChild(c);
  }
}

let selUid = null;
let lastHandSet = new Set();
let lastHandOwner = -1;

// Tippen -> Aktionsmenue; Ziehen auf den eigenen Bauplatz -> direkt bauen/ausspielen.
function attachPlay(el, card) {
  let sx = 0, sy = 0, moved = false, dragging = false, ghost = null;
  const slot = () => $("#meSlot");
  const overSlot = ev => { const r = slot().getBoundingClientRect(); return ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom; };
  const onMove = ev => {
    if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
      dragging = true; moved = true;
      ghost = el.cloneNode(true); ghost.classList.add("dragghost"); ghost.classList.remove("sel");
      document.body.appendChild(ghost); el.style.opacity = ".25";
    }
    if (dragging) { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; slot().classList.toggle("drop", overSlot(ev)); }
  };
  const onUp = ev => {
    document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp);
    if (ghost) ghost.remove(); el.style.opacity = ""; slot().classList.remove("drop");
    if (dragging && overSlot(ev)) {
      if (card.kraft) doCommit({ type: "build", uid: card.uid, turbo: false });
      else if (card.kind === "booster") doCommit({ type: "booster", uid: card.uid });
      else { selUid = card.uid; renderHand(); showActions(card); }     // Abschlepper: Menue (modal)
    } else if (!moved) { Snd.click(); selUid = card.uid; renderHand(); showActions(card); }
  };
  el.addEventListener("pointerdown", ev => {
    ev.preventDefault(); sx = ev.clientX; sy = ev.clientY; moved = false; dragging = false;
    document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp);
  });
}

function renderHand() {
  const me = game.players[persp];
  const row = $("#meArea .mehand"); row.innerHTML = ""; row.classList.add("hand");
  const canAct = acting && game.needsCommit(persp) && !game.needsIncome(persp);
  const affordableBuild = canAct && !me.slot;
  const hideUid = pendPlayUid(me);                 // schon gespielte Karte nicht mehr in der Hand zeigen
  const cards = me.hand.filter(c => c.uid !== hideUid);
  const n = cards.length, mid = (n - 1) / 2;
  const curSet = new Set(cards.map(c => c.uid));   // Deal-Animation nur fuer wirklich neue Karten (nicht beim Ablegen)
  const sameOwner = lastHandOwner === persp;
  cards.forEach((card, idx) => {
    const wrap = document.createElement("div"); wrap.className = "handcard";
    const rot = (idx - mid) * 3.4, lift = Math.abs(idx - mid) * 7;
    wrap.style.setProperty("--rot", rot + "deg");
    wrap.style.transform = `rotate(${rot}deg) translateY(${lift}px)`;
    const el = cardEl(card);
    el.dataset.uid = card.uid;                 // damit die Karte beim Legen wiedergefunden wird
    if (!sameOwner || !lastHandSet.has(card.uid)) { el.classList.add("deal"); el.style.setProperty("--i", idx); }
    const playableMachine = card.kraft && card.cost <= me.fuel && affordableBuild;
    const playableSpecial = (card.kind === "booster" || card.kind === "tow") && affordableBuild;
    if (canAct && (playableMachine || playableSpecial)) {
      el.classList.toggle("sel", selUid === card.uid);
      wrap.classList.add("play");
      attachPlay(el, card);
    } else if (canAct) {
      el.classList.add("dis");
    }
    wrap.appendChild(el); row.appendChild(wrap);
  });
  lastHandSet = curSet; lastHandOwner = persp;
}

// ---------- Aktionsleiste ----------
function clearActions() { $("#actionbar").innerHTML = ""; }
function addBtn(label, fn, ghost) {
  const b = document.createElement("button"); b.textContent = label; if (ghost) b.className = "ghost";
  b.addEventListener("click", fn); $("#actionbar").appendChild(b); return b;
}

// Piktogramme im Artwork-Stil (kraeftig, dicke runde Formen) — die Zielgruppe kann noch nicht lesen.
const ICON = {
  build: `<svg class="psvg" viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="33" width="29" height="9" rx="4.5" fill="#fff"/><rect x="9" y="35.5" width="21" height="2.3" rx="1.15" fill="#2a7d49"/><rect x="12" y="20" width="15" height="13" rx="3" fill="#fff"/><path d="M25 23l9-6 4.5 6.5" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M38.5 23.5c-1.2 5 1.8 7.6 6 6.3l-1.2-4.3" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  wrench: `<svg class="psvg" viewBox="0 0 48 48" aria-hidden="true"><path d="M34 6.5a10 10 0 00-11.6 12.9L7.7 34a4.3 4.3 0 106.1 6.1l14.6-14.6A10 10 0 0041.5 14l-6.4 6.4-4.9-1-1-4.9L35.6 8z" fill="#fff"/></svg>`,
  hook: `<svg class="psvg" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="9" r="4.6" fill="none" stroke="#fff" stroke-width="4"/><path d="M24 14v12a8.5 8.5 0 11-8.5 8.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`,
  back: `<svg class="psvg" viewBox="0 0 48 48" aria-hidden="true"><path d="M29 9L15 24l14 15" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  again: `<svg class="psvg" viewBox="0 0 48 48" aria-hidden="true"><path d="M39 24a15 15 0 10-4.6 10.8" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><path d="M39 9v11H28" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  home: `<svg class="psvg" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 25L24 9l18 16" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="23" width="24" height="17" rx="2.5" fill="#fff"/><rect x="20" y="30" width="8" height="10" rx="1.5" fill="#1a2447"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#39c26a" stroke="#0f2e1c" stroke-width="1.6"/><path d="M12 6v12M6 12h12" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  keep: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#5aa0e6" stroke="#12294a" stroke-width="1.6"/><path d="M7 14l5-5 5 5" fill="none" stroke="#fff" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1a2138" stroke="#0b1024" stroke-width="1.4"/><path d="M13.5 4L7 13.5h4L9.5 20l7.5-9.5h-5L13.5 4z" fill="#ffd23f"/></svg>`
};
function costPips(icon, n) { let s = ""; for (let i = 0; i < Math.min(n, 6); i++) s += `<img class="cpip" src="${icon}" alt="">`; return s; }
function resImg(icon) { return `<img class="pbig" src="${icon}" alt="">`; }
// Grosser, selbsterklaerender Piktogramm-Button (kein sichtbarer Text; Titel/aria fuer Vorleser & Screenreader).
function iconBtn(opts) {
  const b = document.createElement("button");
  b.className = "pbtn" + (opts.cls ? " " + opts.cls : "") + (opts.ghost ? " pghost" : "") + (opts.disabled ? " pdisabled" : "");
  b.title = opts.title; b.setAttribute("aria-label", opts.title);
  b.innerHTML = `<span class="picon">${opts.icon}${opts.badge ? `<span class="pbadge">${opts.badge}</span>` : ""}</span>`
    + (opts.cost ? `<span class="pcost">${opts.cost}</span>` : "");
  if (opts.disabled) { b.disabled = true; }
  else b.addEventListener("click", opts.fn);
  $("#actionbar").appendChild(b); return b;
}

function showActions(card) {
  const me = game.players[persp];
  clearActions();
  if (card.kraft) {
    // Kosten stehen bereits auf der Karte (Kanister-Pips) -> Button zeigt nur die Maschine.
    iconBtn({ cls: "pbuild", title: `Bauen (kostet ${card.cost} Kanister)`, icon: ICON.build,
      fn: () => doCommit({ type: "build", uid: card.uid, turbo: false }) });
    if (game.opts.modules >= 2 && me.bat > 0)
      iconBtn({ cls: "pturbo", title: "Bauen mit Turbo — Batterie einsetzen, +2 stärker", icon: ICON.build, badge: ICON.bolt,
        fn: () => doCommit({ type: "build", uid: card.uid, turbo: true }) });
  } else if (card.kind === "booster") {
    const img = card.gives === "bat" ? "assets/batterie.png" : "assets/kanister.png";
    iconBtn({ cls: card.gives === "bat" ? "pgainb" : "pgain", title: `Ausspielen: +1 ${card.gives === "bat" ? "Batterie" : "Kanister"}`,
      icon: resImg(img), badge: ICON.plus, fn: () => doCommit({ type: "booster", uid: card.uid }) });
  } else if (card.kind === "tow") {
    // Abschleppen ist die Hauptfunktion -> immer zeigen; ohne Gegner-Maschine ausgegraut.
    const hasTarget = !!game.players[1 - persp].slot;
    iconBtn({ cls: "ptow", disabled: !hasTarget, icon: ICON.hook,
      title: hasTarget ? "Gegner-Maschine abschleppen" : "Abschleppen — gerade keine Gegner-Maschine da",
      fn: () => doCommit({ type: "tow", uid: card.uid, mode: "tow" }) });
    iconBtn({ cls: "pgain", title: "Nachschub: +1 Kanister", icon: resImg("assets/kanister.png"), badge: ICON.plus,
      fn: () => doCommit({ type: "tow", uid: card.uid, mode: "plus", plusType: "fuel" }) });
    if (game.opts.modules >= 2)
      iconBtn({ cls: "pgainb", title: "Nachschub: +1 Batterie", icon: resImg("assets/batterie.png"), badge: ICON.plus,
        fn: () => doCommit({ type: "tow", uid: card.uid, mode: "plus", plusType: "bat" }) });
  }
  iconBtn({ cls: "pback", ghost: true, title: "Zurück", icon: ICON.back,
    fn: () => { selUid = null; renderHand(); baseActions(); } });
}

function baseActions() {
  const me = game.players[persp];
  clearActions();
  if (game.opts.modules >= 2 && me.bat >= 2 && me.garage.some(c => c.kraft))
    iconBtn({ cls: "prepair", title: "Reparieren — Maschine zurückholen (kostet 2 Batterien)", icon: ICON.wrench,
      cost: costPips("assets/batterie.png", 2), fn: () => { Snd.click(); showRepairPick(); } });
  iconBtn({ cls: "psave", ghost: true, title: "Sparen — nichts bauen, Treibstoff behalten und weiter sammeln",
    icon: resImg("assets/kanister.png"), badge: ICON.keep, fn: () => doCommit({ type: "pass" }) });
}

// Reparieren: Regel sagt "eine beliebige Maschine aus der Garage" -> Spieler waehlt.
function showRepairPick() {
  const me = game.players[persp];
  const machines = me.garage.filter(c => c.kraft);
  if (!machines.length) return;
  const cards = machines
    .map(c => `<div class="repcard" data-uid="${c.uid}" title="${c.name}" style="background-image:url('${c.img}')"></div>`)
    .join("");
  showOverlay(`<h2>Reparieren</h2><p>Welche Maschine holst du zurück?</p>
    <div class="repgrid">${cards}</div>
    <div class="incpick" style="margin-top:14px"><button class="pbtn pback pghost pbig-btn" id="repCancel" title="Zurück" aria-label="Zurück"><span class="picon">${ICON.back}</span></button></div>`);
  $$("#overlay .repcard").forEach(el => el.addEventListener("click", () => {
    hideOverlay(); doCommit({ type: "repair", uid: +el.dataset.uid });
  }));
  $("#repCancel").onclick = () => { Snd.click(); hideOverlay(); baseActions(); };
}

// ---------- Ablauf ----------
let acting = false;

async function advance() {
  hideOverlay(); clearActions(); selUid = null;
  if (game.phase === "gameover") return winScreen();

  // Naechster Mensch, der noch handeln muss?
  const human = game.players.find(p => !p.isAI && (game.needsIncome(p.idx) || game.needsCommit(p.idx)));
  if (!human) return revealAndResolve();       // alle bereit (KI hat schon committed)

  persp = human.idx;
  const hot = cfg.mode === "hot";
  const otherHumanActed = game.players.some(p => !p.isAI && p.idx !== human.idx && p.pending);
  if (hot && otherHumanActed) {
    // Geraet weitergeben
    acting = false; renderBoardHidden();
    showOverlay(`<div class="pass-emoji">🔄</div><h2>${human.name} ist dran</h2>
      <p>Bildschirm an ${human.name} weitergeben, dann tippen.</p>
      <button class="big" id="goBtn">Bereit</button>`);
    $("#goBtn").onclick = () => startHumanTurn(human);
  } else {
    startHumanTurn(human);
  }
}

function renderBoardHidden() {
  // Tisch neutral (fuer Weitergabe): nichts Verraeterisches
  $("#meArea .mehand").innerHTML = "";
  $("#oppArea .opphand").innerHTML = "";
}

function startHumanTurn(human) {
  hideOverlay(); acting = true; persp = human.idx;
  renderBoard();
  if (game.needsIncome(human.idx)) return promptIncome(human);
  promptCommit(human);
}

function promptIncome(human) {
  clearActions();
  const m2 = game.opts.modules >= 2;
  // Symbole zum Abzaehlen statt Zahlen (Zielgruppe kann noch nicht lesen)
  const stat = `<div class="incstat">
      <span title="Treibstoff">${gauge("assets/kanister.png", human.fuel, TANK_MAX)}</span>
      ${m2 ? `<span title="Batterie">${gauge("assets/batterie.png", human.bat, BAT_MAX)}</span>` : ""}
      <span title="Kristalle">${gauge("assets/kristall.png", human.crystals, game.opts.target, true)}</span>
    </div>`;
  showOverlay(`<h2>Einkommen</h2><p>Nimm eines pro Runde — dein Vorrat:</p>${stat}
    <div class="incpick">
      <button class="pbtn pincome pfuel" id="inFuel" title="Kanister nehmen" aria-label="Kanister nehmen"><img class="pbig xl" src="assets/kanister.png" alt=""></button>
      ${m2 ? `<button class="pbtn pincome pbat" id="inBat" title="Batterie nehmen" aria-label="Batterie nehmen"><img class="pbig xl" src="assets/batterie.png" alt=""></button>` : ""}
    </div>`);
  const pick = async k => {
    game.setIncome(human.idx, k); hideOverlay();
    renderBoard();            // die Ressource ist schon da -> Anzeige zeigt sie
    const sel = k === "bat" ? "#meArea .batt" : "#meArea .tank";
    // das ankommende Symbol laesst die neu gefuellte Zelle deutlich aufpoppen
    flyToken(k === "bat" ? "assets/batterie.png" : "assets/kanister.png", sel, centerOf("#centerMsg"));
    await sleep(760);
    promptCommit(human);
  };
  $("#inFuel").onclick = () => pick("fuel");
  if ($("#inBat")) $("#inBat").onclick = () => pick("bat");
}

function promptCommit(human) {
  renderBoard();
  const acts = game.legalActions(human.idx);
  if (acts.length === 1 && acts[0].type === "none") {   // Maschine kaempft weiter -> keine Wahl
    flash(`${human.name}: deine Maschine kämpft weiter`);
    game.commit(human.idx, acts[0]); setTimeout(advance, 1300); return;
  }
  baseActions();
  const kannBauen = acts.some(a => ["build", "booster", "tow", "repair"].includes(a.type));
  const hint = document.createElement("div"); hint.className = "acthint";
  hint.textContent = kannBauen
    ? "Karte auf deinen Bauplatz ziehen oder antippen — oder „Sparen“."
    : "Noch nicht genug Treibstoff ⛽ — diese Runde sparen und weiter sammeln.";
  $("#actionbar").appendChild(hint);
  flash(`Runde ${game.round} · ${human.name}${human.name === "Du" ? " bist" : " ist"} dran`);
}

async function doCommit(action) {
  if (!acting) return;
  acting = false;
  clearActions(); selUid = null;
  const card = action.uid != null ? game.handCard(game.players[persp], action.uid) : null;
  if (card) {
    await flyCardToSlot(card);          // ~1 s: Karte schwebt auf den Bauplatz
    Snd.place();                        // Ton beim Aufsetzen, nicht beim Klick
  } else if (action.type === "repair") Snd.place();
  else Snd.click();
  game.commit(persp, action);
  renderBoard();                        // Bezahlung sofort sichtbar: Kanister/Batterie runter, Karte aus der Hand
  advance();
}

function flash(msg) { const el = $("#centerMsg"); if (!el) return; el.textContent = msg; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }

function pulseCrystals(i) {
  const area = (i === persp) ? $("#meArea") : $("#oppArea");
  const c = area && area.querySelector(".crystals"); if (!c) return;
  c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse");
}

// ---------- Aufdecken & Kampf ----------
async function revealAndResolve() {
  acting = false; persp = 0; renderBoard();
  await sleep(500);   // kurzer Atemzug, bevor der Countdown startet (Zielgruppe: langsamer)
  const A = game.players[0], B = game.players[1];
  const pre = [A.slot, B.slot];
  const disp = i => {
    const p = game.players[i], a = p.pending || { type: "pass" };
    if (a.type === "build") return { card: game.handCard(p, a.uid), turbo: a.turbo && p.bat > 0 };
    if (p.slot) return { card: p.slot, turbo: p.slotTurbo };
    if (a.type === "tow") return { card: game.handCard(p, a.uid), special: "🚛", label: "🚛 Abschlepper" };
    if (a.type === "booster") return { card: game.handCard(p, a.uid), special: "🛢", label: "🛢 Booster" };
    if (a.type === "repair") return { label: "🔧 Reparieren" };
    return { label: "💤 Sparen" };
  };
  // 3 – 2 – 1 – Aufdecken (Gefuehl von "gleichzeitig")
  for (const n of ["3", "2", "1"]) { flash(n); Snd.tick(); await sleep(680); }
  Snd.reveal();
  showSlotReveal($("#meSlot"), disp(0));
  showSlotReveal($("#oppSlot"), disp(1));
  flash("Aufdecken!");
  await sleep(1100);

  // --- Kampfsequenz (~2 s): nur wenn wirklich zwei Maschinen aufeinandertreffen ---
  const d0 = disp(0), d1 = disp(1);
  const fight = !!(d0.card && d0.card.kraft && d1.card && d1.card.kraft);
  if (fight) {
    flash("Kampf!");
    const meP = centerOf("#meSlot"), opP = centerOf("#oppSlot");
    const mc = $("#meSlot .card"), oc = $("#oppSlot .card");
    if (mc) mc.classList.add("fight");
    if (oc) oc.classList.add("fight");
    worldFx(d0.card, meP); worldFx(d1.card, opP);
    shake(0.45);
    await sleep(700);
    worldFx(d0.card, meP, true); worldFx(d1.card, opP, true);   // zweite, staerkere Welle
    shake(0.7);
    await sleep(700);
    if (mc) mc.classList.remove("fight");     // vor win/lose entfernen, sonst ueberschreibt es die Animation
    if (oc) oc.classList.remove("fight");
  }

  const ev = game.resolve();     // mutiert Zustand; danach lesen wir die Events
  // Kampf-Animation
  const clash = ev.find(e => e.t === "clash");
  const score = ev.find(e => e.t === "score");
  const towed = ev.find(e => e.t === "towed");
  const mid = centerOf("#centerMsg");
  if (towed) { flash("🚛 abgeschleppt!"); Snd.place(); FX.burst(centerOf("#oppSlot").x, centerOf("#oppSlot").y, "176,182,190", 20); }
  if (clash) {
    Snd.clash(); shake(clash.winner === -1 ? 1.3 : 1); flashScreen();
    FX.ring(mid.x, mid.y, "255,207,63"); FX.burst(mid.x, mid.y, "255,180,60", 30, { spread: 11 });
    if (fight) {   // beide Welten schlagen im Aufprall zusammen
      FX.burst(mid.x, mid.y, wRgb(d0.card), 16, { spread: 10, g: 0.3 });
      FX.burst(mid.x, mid.y, wRgb(d1.card), 16, { spread: 10, g: 0.3 });
    }
    const meP = centerOf("#meSlot"), opP = centerOf("#oppSlot");
    if (clash.winner === -1) {
      markSlot("#meSlot", "lose"); markSlot("#oppSlot", "lose"); FX.burst(mid.x, mid.y, "255,90,90", 30);
      floatText(meP.x + 88, meP.y, clash.ea, "#ffd479", true); floatText(opP.x + 88, opP.y, clash.eb, "#ffd479", true);
      flash(`Gleichstand ${clash.ea} : ${clash.eb} — beide in die Garage`);
    }
    else {
      const meWon = clash.winner === 0;
      markSlot(meWon ? "#meSlot" : "#oppSlot", "win");
      markSlot(meWon ? "#oppSlot" : "#meSlot", "lose");
      const lc = centerOf(meWon ? "#oppSlot" : "#meSlot"); FX.burst(lc.x, lc.y, "160,170,190", 30, { spread: 7 });
      floatText(meP.x + 88, meP.y, clash.ea, meWon ? "#7cfc9a" : "#ff8a8a", true);
      floatText(opP.x + 88, opP.y, clash.eb, meWon ? "#ff8a8a" : "#7cfc9a", true);
      const wn = meWon ? game.players[0].name : game.players[1].name;
      flash(`${clash.ea} : ${clash.eb} — ${wn} ${wn === "Du" ? "gewinnst" : "gewinnt"}`);
    }
  } else if (score) {
    // --- Durchkommen: die Maschine bricht durch die Luecke und holt den Kristall ---
    const meScored = score.i === 0;
    const sel = meScored ? "#meSlot" : "#oppSlot";
    const sc = centerOf(sel);
    const thruCard = meScored ? d0.card : d1.card;
    const el = $(sel + " .card");
    flash(`${game.players[score.i].name} kommt durch!`);
    if (el) el.classList.add("through");
    Snd.place();
    worldFx(thruCard, sc);                                  // Anfahren
    shake(0.5);
    await sleep(430);
    const gap = { x: sc.x, y: sc.y + (meScored ? -175 : 175) };   // dort, wo der Gegner fehlt
    worldFx(thruCard, gap, true);                           // Durchbruch
    FX.ring(gap.x, gap.y, "87,208,232", 10);
    await sleep(380);
    Snd.score();
    // Grosser Kristall poppt an der Luecke auf und wandert dann in den Zaehler
    bigCrystalPop(gap.x, gap.y, meScored ? "#meArea .crystals" : "#oppArea .crystals");
    floatText(sc.x + 96, sc.y, "+1", "#8cebff", true);
    flash(`${game.players[score.i].name} kommt durch — ein Kristall!`);
    pulseCrystals(score.i);
    await sleep(760);
    if (el) el.classList.remove("through");
  } else if (!towed) {
    flash("Nichts passiert");
  }
  const win = ev.find(e => e.t === "win");
  await sleep(win ? 1900 : 2600);   // Zahlen/Kristall stehen ~2,2 s -> Ergebnis nicht vorher wegnehmen
  advance();
}

function showSlotReveal(el, d) {
  const back = el.querySelector(".card.back");   // liegt eine verdeckte Karte hier?
  const build = flip => {
    el.innerHTML = ""; el.classList.remove("empty");
    if (d.card) {
      const c = cardEl(d.card); c.classList.add("reveal"); if (flip) c.classList.add("flipin");
      if (d.turbo) { const t = document.createElement("div"); t.className = "turbobadge"; t.textContent = "+2"; c.appendChild(t); }
      if (d.special) { const s = document.createElement("div"); s.className = "specialbadge"; s.textContent = d.special; c.appendChild(s); }
      el.appendChild(c);
      const r = el.getBoundingClientRect(); FX.ring(r.left + r.width / 2, r.top + r.height / 2, "150,190,255", 16);
    } else {
      el.classList.add("empty");
      const s = document.createElement("div"); s.style.cssText = "font-size:13px;color:#8aa;text-align:center;padding:6px";
      s.textContent = d.label || ""; el.appendChild(s);
    }
  };
  if (back && fxOn()) { back.classList.add("flipout"); setTimeout(() => build(true), 190); }
  else { build(!!back); }
}
function markSlot(sel, cls) { const c = $(sel).querySelector(".card"); if (c) c.classList.add(cls); }

// Vollbild-Videosequenz (Intro/Sieg/Niederlage). Stumm-Autoplay + Tippen fuer Ton + Weiter.
// Fehlt die Datei, geht es sofort weiter (onDone) -> App laeuft auch ohne Videos.
function playFullscreenVideo(src, onDone) {
  let called = false; const go = () => { if (called) return; called = true; try { onDone(); } catch (e) {} };
  if (!fxOn()) return go();
  const sp = document.createElement("div"); sp.className = "fsvideo";
  const v = document.createElement("video");
  v.src = src; v.autoplay = true; v.muted = true; v.playsInline = true; v.preload = "auto";
  if (v.setAttribute) { v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); }
  const skip = document.createElement("button"); skip.className = "fsskip"; skip.textContent = "Weiter ▸";
  const snd = document.createElement("div"); snd.className = "fssound"; snd.textContent = "🔊 Antippen für Ton";
  sp.appendChild(v); sp.appendChild(skip); sp.appendChild(snd);
  document.body.appendChild(sp);
  let done = false;
  const end = () => { if (done) return; done = true; sp.classList.add("gone"); setTimeout(() => sp.remove && sp.remove(), 450); go(); };
  v.addEventListener("ended", end);
  v.addEventListener("error", end);
  v.addEventListener("loadedmetadata", () => { if (v.duration && isFinite(v.duration)) setTimeout(end, v.duration * 1000 + 250); });
  skip.addEventListener("click", e => { e.stopPropagation(); end(); });
  sp.addEventListener("click", () => { if (v.muted) { v.muted = false; const q = v.play && v.play(); if (q && q.catch) q.catch(() => {}); snd.classList.add("gone"); } });
  const p = v.play(); if (p && p.catch) p.catch(() => {});
  setTimeout(end, 15000);
}

function winScreen() {
  const w = game.players[game.winner];
  const humanWon = !w.isAI;
  const show = () => {
    FX.rain(); FX.burst(innerWidth / 2, innerHeight / 2, "255,207,63", 60, { spread: 14, g: 0.12 }); shake(1.4);
    humanWon ? Snd.win() : Snd.lose();
    showOverlay(`<div class="winbanner">🏆 ${w.name} ${w.name === "Du" ? "gewinnst" : "gewinnt"}!</div>
      <div class="wingems">${"◆".repeat(w.crystals)}</div>
      <p>${w.crystals} Kristalle gesammelt in ${game.round} Runden.</p>
      <div class="incpick" style="margin-top:16px">
        <button class="pbtn pagain pbig-btn" id="againBtn" title="Nochmal spielen" aria-label="Nochmal spielen"><span class="picon">${ICON.again}</span></button>
        <button class="pbtn phome pghost pbig-btn" id="menu2" title="Zurück zum Menü" aria-label="Zurück zum Menü"><span class="picon">${ICON.home}</span></button>
      </div>`);
    $("#againBtn").onclick = () => { Snd.click(); startGame(); };
    $("#menu2").onclick = () => { Snd.click(); hideOverlay(); backToMenu(); };
  };
  // Sieg- bzw. Niederlage-Sequenz als Vollbild, danach der Ergebnis-Bildschirm.
  playFullscreenVideo(humanWon ? "assets/win.mp4" : "assets/lose.mp4", show);
}
