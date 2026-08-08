import { Game, TANK_MAX, BAT_MAX, WORLD_POWERS } from "./engine.js";
import { CARD_BACK, WORLD_COLORS, MACHINES } from "./cards.js";

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

const cfg = { mode: "ai", modules: 1, target: 5, ai: 0.85 };
let game = null;
let persp = 0;          // aus wessen Sicht der Tisch gerade gezeigt wird
let glossyIds = new Set();   // freigeschaltete Glanzkarten (Karten-IDs), aus den Erfolgen berechnet

// ---------- Freischaltung (im Geraet gespeichert) ----------
// Modul 1 und 2 sind von Anfang an frei. Modul 3 nach 5 Siegen in Modul 2 (nur Siege gegen den Computer zaehlen).
const Prog = (() => {
  const KEY = m => "kb_wins_m" + m;
  const TH = { 3: 5 };
  const get = m => { try { return Math.max(0, +(localStorage.getItem(KEY(m)) || 0) || 0); } catch (e) { return 0; } };
  const set = (m, v) => { try { localStorage.setItem(KEY(m), v); } catch (e) {} };
  return {
    wins: get,
    unlocked: m => m <= 2 ? true : get(m - 1) >= TH[m],
    need: m => TH[m] || 0,
    have: m => get(m - 1),
    addWin(m) {                       // gibt neu freigeschaltetes Modul zurueck (oder 0)
      if (m !== 1 && m !== 2) return 0;
      const b3 = this.unlocked(3);
      set(m, get(m) + 1);
      if (!b3 && this.unlocked(3)) return 3;
      return 0;
    },
  };
})();
const MOD_LABEL = { 1: "Modul 1 (Treibstoff)", 2: "Modul 2 (+ Batterien)", 3: "Modul 3 (+ Weltkräfte)" };

// ---------- Erfolge / Sticker (im Geraet gespeichert) ----------
// Kindgerechte Belohnungen. Nur Spiele gegen den Computer zaehlen. Speicherung: localStorage (mit Fallback).
const ACHS = [
  { id: "first",    emoji: "🏆", name: "Erster Sieg",      desc: "Gewinne dein erstes Spiel." },
  { id: "streak3",  emoji: "🔥", name: "Drei in Folge",    desc: "Gewinne 3 Spiele hintereinander." },
  { id: "streak5",  emoji: "⚡", name: "Fünf in Folge",    desc: "Gewinne 5 Spiele hintereinander." },
  { id: "comeback", emoji: "💪", name: "Comeback",         desc: "Gewinne, obwohl der Gegner fast am Ziel war." },
  { id: "shutout",  emoji: "🛡️", name: "Blütenweiß",       desc: "Gewinne, ohne dass der Gegner einen Kristall holt." },
  { id: "fast",     emoji: "🚀", name: "Blitzsieg",        desc: "Gewinne besonders schnell." },
  { id: "boss",     emoji: "👾", name: "Boss besiegt",     desc: "Gewinne gegen den starken Computer." },
  { id: "worlds",   emoji: "🌍", name: "Weltenherrscher",  desc: "Gewinne ein Spiel mit Weltkräften (Modul 3)." },
  { id: "veteran",  emoji: "🎖️", name: "Stammspieler",     desc: "Spiele 10 Partien." },
  { id: "streak10", emoji: "🌟", name: "Zehn in Folge",    desc: "Gewinne 10 Spiele hintereinander." },
  { id: "master",   emoji: "👑", name: "Grossmeister",     desc: "Gewinne insgesamt 25 Spiele." },
  { id: "marathon", emoji: "⏱️", name: "Ausdauer",         desc: "Gewinne ein besonders langes Spiel." },
  { id: "bossflaw", emoji: "🥇", name: "Makellos gg. Boss", desc: "Schlage den starken Computer ohne Gegenkristall." },
  { id: "worlds5",  emoji: "🪐", name: "Welten-Kenner",    desc: "Gewinne 5 Spiele mit Weltkräften (Modul 3)." },
  { id: "worldsflaw", emoji: "🌟", name: "Weltmeister",     desc: "Gewinne mit Weltkräften, ohne dass der Gegner einen Kristall holt." },
  { id: "underdog", emoji: "🐺", name: "Underdog",          desc: "Schlage den starken Computer nach einem Rückstand." },
  // --- Exklusiv (besonders selten, edlerer Rahmen) ---
  { id: "speedrun", emoji: "🏁", name: "Perfekter Lauf",    desc: "Gewinne fast ohne Zeitverlust — kaum mehr Runden als Kristalle.", elite: true },
  { id: "legend",   emoji: "💎", name: "Legende",           desc: "Gewinne insgesamt 50 Spiele.", elite: true },
  { id: "streak20", emoji: "🌠", name: "Zwanzig in Folge",  desc: "Gewinne 20 Spiele hintereinander.", elite: true },
  { id: "centurion", emoji: "🏛️", name: "Hundert Duelle",   desc: "Spiele 100 Partien.", elite: true },
  { id: "perfect",  emoji: "✨", name: "Makelloser Blitz",  desc: "Gewinne blitzschnell UND ohne einen Gegenkristall.", elite: true },
];
const Ach = (() => {
  const KEY = "kb_ach";
  const blank = () => ({ unlocked: {}, streak: 0, games: 0, wins: 0 });
  const load = () => { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return blank(); } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  return {
    all: () => ACHS,
    state: load,
    count: () => Object.keys(load().unlocked || {}).length,
    // Ergebnis einer Partie verbuchen. Gibt Liste NEU freigeschalteter Erfolge zurueck (Objekte aus ACHS).
    record({ won, round, target, oppC, level, modules }) {
      const s = load();
      s.unlocked = s.unlocked || {};
      s.games = (s.games || 0) + 1;
      if (won) { s.wins = (s.wins || 0) + 1; s.streak = (s.streak || 0) + 1; }
      else s.streak = 0;
      const fresh = [];
      const earn = id => { if (!s.unlocked[id]) { s.unlocked[id] = Date.now(); fresh.push(id); } };
      if (won) {
        earn("first");
        if (s.streak >= 3) earn("streak3");
        if (s.streak >= 5) earn("streak5");
        if (oppC >= target - 1) earn("comeback");
        if (oppC === 0) earn("shutout");
        if (round <= target + 3) earn("fast");
        if (level >= 0.9) earn("boss");
        if (modules >= 3) earn("worlds");
        if (s.streak >= 10) earn("streak10");
        if (s.wins >= 25) earn("master");
        if (round >= 18) earn("marathon");
        if (level >= 0.9 && oppC === 0) earn("bossflaw");
        if (modules >= 3) { s.worldWins = (s.worldWins || 0) + 1; if (s.worldWins >= 5) earn("worlds5"); }
        if (modules >= 3 && oppC === 0) earn("worldsflaw");
        if (level >= 0.9 && oppC >= target - 1) earn("underdog");
        if (round <= target + 1) earn("speedrun");
        if (oppC === 0 && round <= target + 1) earn("perfect");
        if (s.wins >= 50) earn("legend");
        if (s.streak >= 20) earn("streak20");
      }
      if (s.games >= 10) earn("veteran");
      if (s.games >= 100) earn("centurion");
      save(s);
      return fresh.map(id => ACHS.find(a => a.id === id)).filter(Boolean);
    },
  };
})();
// Erfolgs-Medaillen als echte Vektor-Grafik (SVG) — pro Erfolg eigene Farbe + Symbol, gesperrt = graue Medaille mit Schloss.
const ACH_ART = {
  first:    { core: ["#ffe680", "#f5a81c"], glyph: '<path d="M35 30h30v7c0 12-7 18-15 18s-15-6-15-18z" fill="#fff"/><path d="M35 33c-8 0-11 4-11 9s4 8 10 8" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M65 33c8 0 11 4 11 9s-4 8-10 8" fill="none" stroke="#fff" stroke-width="3.5"/><rect x="46" y="54" width="8" height="9" fill="#fff"/><rect x="37" y="62" width="26" height="6" rx="3" fill="#fff"/>' },
  streak3:  { core: ["#ffd27a", "#ef6c1a"], glyph: '<path d="M50 26c9 10 7 17 4 22 5-1 6-7 5-11 5 6 6 14 1 21-4 6-10 8-10 8s-16-3-16-19c0-8 6-13 6-13 0 5 3 7 5 6 3-2 3-9-1-15 2 0 5 3 6 8 2-4 0-9-1-13z" fill="#fff"/>' },
  streak5:  { core: ["#ff9d5c", "#d63a1e"], glyph: '<g fill="#fff"><path d="M50 24c7 9 5 15 3 19 5-2 6-7 5-11 5 6 5 14 0 20 6-2 8-9 8-9 3 5 3 12-2 17-4 5-17 8-17 8s-15-4-15-18c0-7 5-11 5-11 0 4 3 5 4 4 2-2 2-8-1-13 2 0 4 2 5 6 2-3 1-8-2-12 3 0 6 3 7 6 1-3 0-8-3-10z"/></g>' },
  comeback: { core: ["#a6e88a", "#2f9e46"], glyph: '<path d="M50 26l19 21H57v17H43V47H31z" fill="#fff"/>' },
  shutout:  { core: ["#8fe3e0", "#1f8f9c"], glyph: '<path d="M50 26l18 7v15c0 15-18 24-18 24s-18-9-18-24V33z" fill="#fff"/><path d="M42 47l6 6 12-13" fill="none" stroke="#1f8f9c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' },
  fast:     { core: ["#9cc3ff", "#3667d6"], glyph: '<path d="M50 24c9 7 12 18 12 27l-4 8H42l-4-8c0-9 3-20 12-27z" fill="#fff"/><circle cx="50" cy="42" r="5" fill="#3667d6"/><path d="M40 60l-6 12 10-5zM60 60l6 12-10-5z" fill="#fff"/>' },
  boss:     { core: ["#d8a6ff", "#7b3fd6"], glyph: '<path d="M30 42l7 8 6-16 7 14 7-14 6 16 7-8-4 22H34z" fill="#fff"/><rect x="34" y="62" width="32" height="7" rx="2" fill="#fff"/>' },
  worlds:   { core: ["#a9b6ff", "#4b52c8"], glyph: '<circle cx="50" cy="47" r="15" fill="#fff"/><ellipse cx="50" cy="47" rx="24" ry="8" fill="none" stroke="#fff" stroke-width="3.5" transform="rotate(-20 50 47)"/><path d="M40 44c4 3 16 3 20 0M42 52c4-2 12-2 16 0" stroke="#4b52c8" stroke-width="2.5" fill="none"/>' },
  veteran:  { core: ["#ffd9a0", "#c8822e"], glyph: '<path d="M50 26l6 15 16 1-12 10 4 16-14-9-14 9 4-16-12-10 16-1z" fill="#fff"/>' },
  streak10: { core: ["#ffcf6a", "#e8471a"], glyph: '<path d="M50 22l7 18 18 7-18 7-7 18-7-18-18-7 18-7z" fill="#fff"/><circle cx="50" cy="47" r="5" fill="#e8471a"/>' },
  master:   { core: ["#ffe680", "#dca000"], glyph: '<path d="M26 60l-4-24 15 11 13-17 13 17 15-11-4 24z" fill="#fff"/><rect x="26" y="62" width="48" height="7" rx="2" fill="#fff"/>' },
  marathon: { core: ["#a6e88a", "#2f9e46"], glyph: '<circle cx="50" cy="52" r="19" fill="none" stroke="#fff" stroke-width="5"/><path d="M50 52V38" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M50 52l10 6" stroke="#fff" stroke-width="4" stroke-linecap="round"/><rect x="43" y="22" width="14" height="7" rx="3" fill="#fff"/>' },
  bossflaw: { core: ["#d8a6ff", "#6a2fc0"], glyph: '<path d="M50 26l18 7v14c0 15-18 24-18 24s-18-9-18-24V33z" fill="#fff"/><path d="M50 40l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#6a2fc0"/>' },
  worlds5:  { core: ["#a9b6ff", "#3f46c0"], glyph: '<circle cx="50" cy="49" r="14" fill="#fff"/><ellipse cx="50" cy="49" rx="26" ry="9" fill="none" stroke="#fff" stroke-width="3.5" transform="rotate(-18 50 49)"/><circle cx="73" cy="35" r="3.5" fill="#fff"/>' },
  worldsflaw: { core: ["#9fd8ff", "#2f6ad6"], glyph: '<path d="M50 24l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z" fill="#fff"/><circle cx="50" cy="46" r="6" fill="#2f6ad6"/>' },
  underdog: { core: ["#c9d2e6", "#5a6478"], glyph: '<circle cx="50" cy="57" r="11" fill="#fff"/><circle cx="37" cy="45" r="5" fill="#fff"/><circle cx="50" cy="40" r="5" fill="#fff"/><circle cx="63" cy="45" r="5" fill="#fff"/>' },
  speedrun: { core: ["#bfe0ff", "#2f6ad6"], glyph: '<path d="M34 26v46" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M39 30h30v22H39z" fill="#fff"/><g fill="#2f6ad6"><rect x="39" y="30" width="7.5" height="5.5"/><rect x="54" y="30" width="7.5" height="5.5"/><rect x="46.5" y="35.5" width="7.5" height="5.5"/><rect x="61.5" y="35.5" width="7.5" height="5.5"/><rect x="39" y="41" width="7.5" height="5.5"/><rect x="54" y="41" width="7.5" height="5.5"/><rect x="46.5" y="46.5" width="7.5" height="5.5"/><rect x="61.5" y="46.5" width="7.5" height="5.5"/></g>' },
  legend:   { core: ["#eafcff", "#8a5cff"], glyph: '<path d="M32 41h36l-18 30z" fill="#fff"/><path d="M32 41l8-13h20l8 13" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M40 28L50 71 60 28M32 41h36" stroke="#c9b8ff" stroke-width="1.8" fill="none"/>' },
  streak20: { core: ["#eafcff", "#7a5cff"], glyph: '<path d="M50 22l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill="#fff"/><path d="M74 25l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/><path d="M24 60l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#fff"/>' },
  centurion: { core: ["#eafcff", "#6a7cff"], glyph: '<path d="M24 40l26-15 26 15z" fill="#fff"/><rect x="30" y="42" width="6" height="24" fill="#fff"/><rect x="47" y="42" width="6" height="24" fill="#fff"/><rect x="64" y="42" width="6" height="24" fill="#fff"/><rect x="25" y="68" width="50" height="6" rx="1.5" fill="#fff"/>' },
  perfect:  { core: ["#eafcff", "#3aa0ff"], glyph: '<path d="M50 20l4 22 22 4-22 4-4 22-4-22-22-4 22-4z" fill="#fff"/><path d="M50 35l2.5 12.5L65 50l-12.5 2.5L50 65l-2.5-12.5L35 50l12.5-2.5z" fill="#3aa0ff"/>' },
};
function achSVG(id, on) {
  const a = ACH_ART[id] || { core: ["#ccc", "#999"], glyph: "" };
  const meta = ACHS.find(x => x.id === id);
  const elite = on && !!(meta && meta.elite);   // exklusive Erfolge -> Diamant-Rahmen + extra Funkeln
  const uid = id + (on ? "1" : "0");
  const ring = on ? (elite ? ["#eafcff", "#8a5cff"] : ["#fff4c4", "#e7a11a"]) : ["#9aa3b8", "#5c6478"];
  const core = on ? a.core : ["#7c8398", "#565d70"];
  const inner = on ? a.glyph
    : '<rect x="37" y="47" width="26" height="19" rx="4" fill="#cdd5e8"/><path d="M42 47v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#cdd5e8" stroke-width="4.5"/><circle cx="50" cy="55" r="3" fill="#4a5570"/><rect x="48.5" y="55" width="3" height="6" rx="1.5" fill="#4a5570"/>';
  const sparks = on ? (elite
    ? '<g fill="#fff"><path d="M80 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M22 64l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><path d="M78 66l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><path d="M21 30l1.3 3.4 3.4 1.3-3.4 1.3-1.3 3.4-1.3-3.4-3.4-1.3 3.4-1.3z"/></g>'
    : '<g fill="#fff"><path d="M80 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M22 64l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/></g>') : '';
  return `<svg viewBox="0 0 100 100" class="achmedal${on ? " on" : ""}" aria-hidden="true">`
    + `<defs><radialGradient id="c${uid}" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${core[0]}"/><stop offset="1" stop-color="${core[1]}"/></radialGradient>`
    + `<linearGradient id="r${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ring[0]}"/><stop offset="1" stop-color="${ring[1]}"/></linearGradient></defs>`
    + `<circle cx="50" cy="50" r="47" fill="url(#r${uid})"/><circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>`
    + (elite ? `<circle cx="50" cy="50" r="45" fill="none" stroke="#eafcff" stroke-width="2" opacity=".85"/>` : "")
    + `<circle cx="50" cy="50" r="34" fill="url(#c${uid})"/><circle cx="50" cy="50" r="34" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1.5"/>`
    + inner
    + `<ellipse cx="42" cy="33" rx="19" ry="11" fill="rgba(255,255,255,.25)"/>`
    + sparks + `</svg>`;
}
// Erfolge-Uebersicht (Sticker-Sammlung): alle Erfolge, freigeschaltet farbig, sonst als Schloss.
function showAchievements() {
  const s = Ach.state(), u = s.unlocked || {};
  const cells = Ach.all().map(a => {
    const on = !!u[a.id];
    return `<div class="achcell${on ? " on" : ""}"><div class="achbig">${achSVG(a.id, on)}</div>`
      + `<b>${a.name}</b><span>${a.desc}</span></div>`;
  }).join("");
  showOverlay(`<div class="achscreen"><h2>🏅 Erfolge <small>${Ach.count()}/${Ach.all().length}</small></h2>`
    + `<div class="achgrid">${cells}</div>`
    + `<button class="big" id="achClose">Zurück</button></div>`);
  const c = $("#achClose"); if (c) c.onclick = () => { Snd.click(); hideOverlay(); };
}

// ---------- Glanzkarten (Holo-Foil, an Erfolge gekoppelt) ----------
// Jeder Erfolg schaltet die Glanzversion GENAU EINER Maschine frei (thematische Zuordnung).
const GLOSSY_BY_ACH = {
  first: "BAU-1", veteran: "BAU-2", comeback: "BAU-4", marathon: "BAU-5", legend: "BAU-6",
  speedrun: "KOS-1", fast: "KOS-2", worldsflaw: "KOS-4", worlds5: "KOS-5", worlds: "KOS-6",
  shutout: "TEC-1", master: "TEC-2", perfect: "TEC-4", bossflaw: "TEC-5", boss: "TEC-6",
  underdog: "TRK-1", streak3: "TRK-2", streak5: "TRK-3", streak10: "TRK-4", centurion: "TRK-5", streak20: "TRK-6",
};
// Die 3 verbleibenden Karten kommen über Sammel-Meilensteine (Anzahl freigeschalteter Erfolge).
const GLOSSY_MILESTONES = [{ n: 5, card: "BAU-3" }, { n: 10, card: "KOS-3" }, { n: 15, card: "TEC-3" }];
function computeGlossy() {
  const u = (Ach.state().unlocked) || {}, cnt = Object.keys(u).length, set = new Set();
  for (const [ach, card] of Object.entries(GLOSSY_BY_ACH)) if (u[ach]) set.add(card);
  for (const m of GLOSSY_MILESTONES) if (cnt >= m.n) set.add(m.card);
  return set;
}
function refreshGlossy() { glossyIds = computeGlossy(); }
function glossyUnlockLabel(cardId) {
  for (const [ach, c] of Object.entries(GLOSSY_BY_ACH)) if (c === cardId) { const a = ACHS.find(x => x.id === ach); return a ? a.name : ""; }
  const m = GLOSSY_MILESTONES.find(x => x.card === cardId); return m ? `${m.n} Erfolge` : "";
}
function showGlossy() {
  refreshGlossy();
  const have = MACHINES.filter(m => glossyIds.has(m.id)).length;
  const cells = MACHINES.map(m => {
    const on = glossyIds.has(m.id);
    return `<div class="glcell${on ? " on" : ""}">`
      + `<div class="glcard${on ? " glossy" : ""}" style="background-image:url('${m.img}')">${on ? '<div class="foil"></div><div class="foilsheen"></div>' : ""}</div>`
      + (on ? `<b>${m.name}</b>` : `<span class="gllock">🔒 ${glossyUnlockLabel(m.id)}</span>`)
      + `</div>`;
  }).join("");
  showOverlay(`<div class="glscreen"><h2>✨ Glanzkarten <small>${have}/${MACHINES.length}</small></h2>`
    + `<p class="glhint">Sammle Erfolge — jeder lässt eine Karte glänzen.</p>`
    + `<div class="glgrid">${cells}</div><button class="big" id="glClose">Zurück</button></div>`);
  const c = $("#glClose"); if (c) c.onclick = () => { Snd.click(); hideOverlay(); };
}

function applyProgression() {
  const seg = document.querySelector('[data-opt="modules"]');
  if (!seg || !seg.querySelectorAll) return;
  let top = 1;
  seg.querySelectorAll("button").forEach(b => {
    const m = +b.dataset.val, ok = Prog.unlocked(m);
    if (b.classList) b.classList.toggle("locked", !ok);
    b.innerHTML = ok ? MOD_LABEL[m] : `🔒 Modul ${m} <small>${Prog.have(m)}/${Prog.need(m)} Siege</small>`;
    if (ok) top = Math.max(top, m);
  });
  const cur = seg.querySelector("button.on");
  const keep = cur && cur.classList && !cur.classList.contains("locked") ? +cur.dataset.val : top;
  seg.querySelectorAll("button").forEach(x => x.classList && x.classList.toggle("on", +x.dataset.val === keep));
  cfg.modules = keep;   // Auswahl und cfg immer synchron halten
}

// ---------- Menue ----------
$$("#menu .seg").forEach(seg => {
  seg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.classList.contains("locked")) {   // gesperrtes Modul: nicht waehlbar, kurz wackeln
      Snd.click(); b.classList.remove("lockshake"); void b.offsetWidth; b.classList.add("lockshake"); return;
    }
    seg.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    const opt = seg.dataset.opt, val = b.dataset.val;
    cfg[opt] = (opt === "target" || opt === "modules") ? +val : (opt === "ai" ? +val : val);
    if (opt === "mode") $("#opt-ai").style.display = val === "ai" ? "" : "none";
    Snd.click();
  });
});
applyProgression();   // beim Start: Schloesser + Fortschritt anzeigen, Auswahl auf hoechstes freies Modul
$("#startBtn").addEventListener("click", () => { Snd.resume(); Snd.click(); startGame(); });

// Stummschalter (dynamisch, unten rechts)
const muteBtn = document.createElement("button");
muteBtn.id = "muteBtn"; muteBtn.title = "Ton an/aus"; muteBtn.setAttribute("aria-label", "Ton an/aus");
muteBtn.innerHTML = `<img class="chromeicon" src="assets/icons/sound.png" alt="">`;
muteBtn.addEventListener("click", () => { const m = Snd.toggle(); muteBtn.classList.toggle("muted", m); });
$("#table").appendChild(muteBtn);
FX.start();   // Sternenfeld auch hinter dem Menue

// Menue-Logo (Emblem aus den App-Icons)
(() => {
  const box = document.querySelector(".menu-box"), h1 = box && box.querySelector("h1");
  if (box && h1 && !$("#menuLogo")) { const im = document.createElement("img"); im.id = "menuLogo"; im.src = "icons/icon-192.png"; im.alt = ""; h1.parentNode.insertBefore(im, h1); }
})();

// Optionale custom Grafiken: erscheinen automatisch, sobald die Dateien im assets/ liegen.
function tryImg(url, apply) {
  if (typeof Image === "undefined") return;
  const im = new Image(); im.onload = () => apply(url); im.onerror = () => {}; im.src = url;
}
// Spielbrett-Buehne: neuer malerischer Arena-Hintergrund im Kartenstil (dunkle ruhige Mitte).
tryImg("assets/board.png", u => {
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
    v.src = "assets/intro.mp4"; v.autoplay = true; v.muted = false; v.playsInline = true; v.preload = "auto";
    if (v.setAttribute) v.setAttribute("playsinline", "");
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
    // Erst MIT Ton versuchen; blockt der Browser (kein Nutzer-Gest beim ersten Start), stumm + Pille.
    const p = v.play();
    if (p && p.then) p.then(() => { snd.classList.add("gone"); })
      .catch(() => { v.muted = true; const q = v.play && v.play(); if (q && q.catch) q.catch(() => {}); });
    setTimeout(() => end("timeout"), 15000);                                 // ultimatives Sicherheitsnetz
  } catch (e) {}
})();

function playIntro() { if (!introVid || !introVid.play) return; const p = introVid.play(); if (p && p.catch) p.catch(() => {}); }
function backToMenu() {
  $("#table").classList.add("hidden"); $("#menu").classList.remove("hidden");
  if (document.body && document.body.classList) document.body.classList.remove("playing");
  // Defensive Aufraeumung: keine FX-/Coach-Reste ueber dem Menue stehen lassen.
  document.querySelectorAll(".confetti,.coach,.coachring,.coachhand").forEach(n => n.remove());
  if (typeof Coach !== "undefined" && Coach.clear) Coach.clear();
  applyProgression();   // Freischaltungen im Menue aktualisieren
  playIntro();
}
// Mitten im Spiel nicht versehentlich alles verlieren -> kurze Rueckfrage.
$("#menuBtn").addEventListener("click", () => {
  const inGame = typeof game !== "undefined" && game && game.phase !== "gameover"
    && document.body.classList.contains("playing");
  if (!inGame) { backToMenu(); hideOverlay(); return; }
  Snd.click();
  showOverlay(`<h2>Spiel verlassen?</h2><p>Die laufende Partie geht verloren.</p>
    <div class="incpick" style="gap:14px;margin-top:6px">
      <button class="big ghostbtn" id="mbStay">Weiterspielen</button>
      <button class="big" id="mbLeave">Zum Menü</button>
    </div>`);
  $("#mbStay").onclick = () => {
    Snd.click(); hideOverlay();
    if (typeof TUT !== "undefined" && TUT.active) return;   // Coach-Overlay liegt schon darunter
    const h = game.players.find(p => !p.isAI && (game.needsIncome(p.idx) || game.needsCommit(p.idx)));
    if (h) startHumanTurn(h);
  };
  $("#mbLeave").onclick = () => { Snd.click(); backToMenu(); hideOverlay(); };
});

// Repraesentative Maschine + Anzeigename je Welt (fuer die Welten-Wahl).
const WORLD_META = {
  KOSMOS:  { name: "Kosmos",  img: "cards/KOS-6_Galaxie-Riese.png" },
  BAU:     { name: "Bau",     img: "cards/BAU-6_Riesen-Kran.png" },
  TECHNIK: { name: "Technik", img: "cards/TEC-6_Boss-Roboter.png" },
  TRUCKS:  { name: "Trucks",  img: "cards/TRK-5_Monster-Truck.png" },
};
const WORLD_ORDER = ["BAU", "KOSMOS", "TECHNIK", "TRUCKS"];

function startGame() {
  const hot = cfg.mode === "hot";
  if (cfg.modules === 3) { pickWorlds(hot); return; }   // Modul 3: erst 2 Welten waehlen
  launchGame(hot, cfg.modules, false, null);
}

function launchGame(hot, modules, worldPowers, worlds) {
  game = new Game({
    modules, target: cfg.target,
    deckDoubled: true, boosters: modules >= 2 ? 4 : 2, tows: 2,
    worldPowers, worlds,
    names: hot ? ["Spieler 1", "Spieler 2"] : ["Du", "Computer"],
    ai: hot ? [false, false] : [false, true],
    aiLevel: cfg.ai,
  });
  $("#menu").classList.add("hidden"); hideOverlay();
  $("#table").classList.remove("hidden");
  if (document.body && document.body.classList) document.body.classList.add("playing");
  if (introVid && introVid.pause) introVid.pause();     // im Spiel kein bewegter Hintergrund
  FX.start();
  ["oppDeck", "meDeck"].forEach(id => { if (!$("#" + id)) { const d = document.createElement("div"); d.id = id; d.className = "deckpile"; $("#battle").appendChild(d); } });
  persp = 0;
  refreshGlossy();   // freigeschaltete Glanzkarten sollen im Spiel schimmern
  advance();
}

const randomTwoWorlds = () => { const a = WORLD_ORDER.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 2); };

// Modul 3: Welten-Wahl (2 von 4) als grosser Bild-Screen. Hotseat: beide waehlen; gegen Computer waehlt dieser zufaellig.
function pickWorlds(hot) {
  const pickFor = (who, cb) => {
    const chosen = [];
    const render = () => {
      const cards = WORLD_ORDER.map(w => {
        const m = WORLD_META[w], on = chosen.includes(w), pw = WORLD_POWERS[w];
        return `<button class="worldpick${on ? " on" : ""}" data-w="${w}" style="--wc:${WORLD_COLORS[w]}">
          <span class="wimg" style="background-image:url('${m.img}')"></span>
          <b class="wname">${m.name}</b>
          <span class="wpow"><i>${pw.label}</i>${pw.text}</span>
        </button>`;
      }).join("");
      showOverlay(`<div class="worldpicker">
        <h2>${who}: Wähle 2 Welten</h2>
        <div class="worldgrid">${cards}</div>
        <button id="wpGo" class="big"${chosen.length === 2 ? "" : " disabled"}>Weiter</button>
        <p class="hint">Jede Welt hat ihre eigene Spezialkraft. Such dir deine zwei Lieblingswelten aus.</p>
      </div>`);
      ovi.querySelectorAll(".worldpick").forEach(b => b.addEventListener("click", () => {
        const w = b.dataset.w, i = chosen.indexOf(w);
        if (i >= 0) chosen.splice(i, 1); else if (chosen.length < 2) chosen.push(w);
        Snd.click(); render();
      }));
      const go = $("#wpGo"); if (go && !go.disabled) go.addEventListener("click", () => { Snd.click(); cb(chosen.slice()); });
    };
    render();
  };
  pickFor(hot ? "Spieler 1" : "Du", w0 => {
    if (hot) pickFor("Spieler 2", w1 => launchGame(hot, 2, true, [w0, w1]));
    else launchGame(hot, 2, true, [w0, randomTwoWorlds()]);
  });
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
  // Freigeschaltete Glanzkarte -> Holo-Foil-Schicht drüberlegen (auch im Spiel).
  if (!back && card && card.id && glossyIds.has(card.id)) {
    d.classList.add("glossy");
    const f = document.createElement("div"); f.className = "foil";
    const s = document.createElement("div"); s.className = "foilsheen";
    d.appendChild(f); d.appendChild(s);
  }
  // Kosten-Quadrate entfernt: das Karten-Artwork zeigt die Kanister-Kosten bereits.
  return d;
}

// Anzeige beruecksichtigt die bereits getroffene (aber erst beim Aufdecken verrechnete) Wahl:
// bezahlter Treibstoff/Batterie verschwindet sofort aus dem Zaehler, die gespielte Karte
// verlaesst die Hand. Nur fuer die eigene Seite — beim Gegner wuerde das die Wahl verraten.
function pendPlayUid(p) { const t = p.pending && p.pending.type; return (t === "build" || t === "booster" || t === "tow") ? p.pending.uid : null; }
// Kleine Welt-Punkte neben dem Namen (nur Modul 3): zeigt, welche 2 Weltkraefte dieser Spieler hat.
function worldBadges(p) {
  if (!game.opts.worldPowers) return "";
  const ws = (game.opts.worlds || [])[p.idx] || [];
  return ' ' + ws.map(w => `<i class="wdot" title="${(WORLD_POWERS[w] || {}).label || w}" style="background:${WORLD_COLORS[w] || "#888"}"></i>`).join("");
}
function dispFuel(p) { if (p.pending && p.pending.type === "build") { const c = game.handCard(p, p.pending.uid); if (c) return Math.max(0, p.fuel - c.cost); } return p.fuel; }
function dispBat(p) { return (p.pending && p.pending.type === "build" && p.pending.turbo && p.bat > 0) ? Math.max(0, p.bat - 1) : p.bat; }

// Modul 3: "power"-Events -> Gegner-Zaehler rot aufblitzen + Minus-Zahl schweben lassen.
function drainFx(ev) {
  if (!game || !game.opts.worldPowers) return;
  const powers = (ev || []).filter(e => e.t === "power");
  if (!powers.length) return;
  const sum = {};   // Opfer-Index -> {fuel, bat}
  for (const e of powers) {
    const pw = WORLD_POWERS[e.world] || {}, v = 1 - e.i;
    const s = sum[v] || (sum[v] = { fuel: 0, bat: 0 });
    s.fuel += pw.foeFuel || 0; s.bat += pw.foeBat || 0;
  }
  let any = false;
  for (const v in sum) {
    const s = sum[v], side = (+v === persp) ? "#meArea" : "#oppArea";
    const hit = (selc, amt) => {
      const el = $(side + " " + selc); if (!el || !amt) return;
      el.classList.add("drainhit"); setTimeout(() => { if (el.classList) el.classList.remove("drainhit"); }, 720);
      const r = el.getBoundingClientRect && el.getBoundingClientRect();
      if (r && typeof floatText === "function") floatText(r.left + r.width / 2, r.top + 4, "−" + amt, "#ff7a7a", true);
      any = true;
    };
    hit(".tank", s.fuel); hit(".batt", s.bat);
  }
  if (any && Snd.tick) Snd.tick();
}

function renderBoard() {
  const me = game.players[persp], op = game.players[1 - persp];
  // Info
  const meA = $("#meArea"), opA = $("#oppArea");
  meA.querySelector(".pname").innerHTML = me.name + worldBadges(me);
  // Die Welten des Gegners bleiben GEHEIM — sonst weiss man seine Kräfte im Voraus.
  opA.querySelector(".pname").innerHTML = op.name;
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
  slotRenderPre($("#oppSlot"), op, true);   // Gegnerwahl verdeckt halten (kein Leak vor dem Aufdecken)
  slotRenderPre($("#meSlot"), me, false);
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
// hideChoice=true (Gegnerseite): JEDE getroffene Wahl sieht gleich aus (verdeckte Karte) — auch "sparen".
// Sonst wuerde man vor dem eigenen Zug sehen, ob der Gegner baut oder spart (Info-Leak).
function slotRenderPre(el, p, hideChoice) {
  // Stehende Maschine, die weiterkaempft: immer offen sichtbar (oeffentlicher Spielstand).
  if (p.slot && (!p.pending || p.pending.type === "none")) { slotShow(el, p.slot, p.slotTurbo); return; }
  const t = p.pending && p.pending.type;
  if (hideChoice) {
    // Gegner hat (verdeckt) gewaehlt: bauen ODER sparen -> identische Rueckseite, kein Leak.
    if (p.pending) { el.innerHTML = ""; el.classList.remove("empty"); const c = cardEl(null, { back: true }); c.classList.add("pending"); el.appendChild(c); return; }
    slotShow(el, p.slot, p.slotTurbo); return;   // noch nicht gewaehlt (z. B. Hotseat)
  }
  if (t === "build" || t === "booster" || t === "tow") {
    el.innerHTML = ""; el.classList.remove("empty");
    const c = cardEl(null, { back: true }); c.classList.add("pending");
    el.appendChild(c); return;
  }
  slotShow(el, p.slot, p.slotTurbo);
}

// Kampf-Badges, beide OBEN LINKS neben der Kraftzahl: rotes Vollgas-+1 (Truck, ab Runde 1)
// und gruener Batterie-+2. Auf JEDER gezeigten Kampfkarte gebraucht: Aufdecken, Kampf, stehend.
function battleBadges(c, card, turbo) {
  let buff = false;
  if (card && card.kraft && game && game.opts.worldPowers) {
    const pw = WORLD_POWERS[card.world];
    if (pw && pw.selfKraft) {
      const b = document.createElement("div"); b.className = "buffbadge";
      b.textContent = "+" + pw.selfKraft; b.title = pw.label; c.appendChild(b); buff = true;
    }
  }
  if (turbo) {  // Batterie-+2: gleicher Ort wie das rote +1; sind beide da, darunter gestapelt.
    const t = document.createElement("div"); t.className = "turbobadge" + (buff ? " stacked" : "");
    t.textContent = "+2"; t.title = "Batterie: +2 in diesem Kampf"; c.appendChild(t);
  }
}

function slotShow(el, card, turbo) {
  el.innerHTML = ""; el.classList.toggle("empty", !card);
  if (card) {
    const c = cardEl(card); c.classList.add("idle");
    battleBadges(c, card, turbo);
    el.appendChild(c);
  }
}

let selUid = null;
let lastHandSet = new Set();
let lastHandOwner = -1;
// Ergebnis der zuletzt aufgelösten Runde -> wird oben im nächsten Einkommens-Overlay
// nochmal gezeigt, damit es nie sofort vom Modal überdeckt wird.
let lastResult = "";
function summarizeResult(ev) {
  const score = ev.find(e => e.t === "score");
  const clash = ev.find(e => e.t === "clash");
  const towed = ev.find(e => e.t === "towed");
  if (score) { const nm = game.players[score.i].name; return `${nm} ${nm === "Du" ? "kommst" : "kommt"} durch — +1 ⬦`; }
  if (clash) {
    if (clash.winner === -1) return `Gleichstand ${clash.ea} : ${clash.eb} — beide in die Garage`;
    const nm = game.players[clash.winner].name;
    return `${nm} ${nm === "Du" ? "gewinnst" : "gewinnt"} den Kampf ${clash.ea} : ${clash.eb}`;
  }
  if (towed) return "🚛 Maschine abgeschleppt";
  return "";
}

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
  // Damit die Hand (auch mit 4 Karten) immer in die Bildschirmbreite passt: bei Bedarf ueberlappen.
  const cardW = 128, gap = 8;
  const vw = (typeof document !== "undefined" && document.documentElement && document.documentElement.clientWidth)
    || (typeof window !== "undefined" && window.innerWidth) || 390;
  const total = n * cardW + (n - 1) * gap, avail = Math.max(240, vw - 18);
  const overlap = (n > 1 && total > avail) ? Math.ceil((total - avail) / (n - 1)) : 0;
  cards.forEach((card, idx) => {
    const wrap = document.createElement("div"); wrap.className = "handcard";
    const rot = (idx - mid) * 3.4, lift = Math.abs(idx - mid) * 7;
    wrap.style.setProperty("--rot", rot + "deg");
    wrap.style.transform = `rotate(${rot}deg) translateY(${lift}px)`;
    if (idx > 0 && overlap > 0) wrap.style.marginLeft = -overlap + "px";
    if (selUid === card.uid) wrap.style.zIndex = "12";
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
      // Nicht spielbar? Beim Tippen den Grund zeigen, statt tot zu wirken (vergebend + lehrt die Ökonomie).
      el.addEventListener("click", () => {
        Snd.click();
        let why;
        if (me.slot) why = "Dein Bauplatz ist besetzt — die Maschine kämpft weiter.";
        else if (card.kraft && card.cost > me.fuel) why = `Noch ${card.cost - me.fuel} ⛽ sammeln — dann kannst du sie bauen.`;
        else why = "Diese Karte geht gerade nicht.";
        flash(why);
      });
    }
    wrap.appendChild(el); row.appendChild(wrap);
  });
  // Leerer Bauplatz markieren, solange der Spieler bauen darf.
  const ms = $("#meSlot"); if (ms) ms.classList.toggle("buildable", affordableBuild);
  lastHandSet = curSet; lastHandOwner = persp;
}

// ---------- Aktionsleiste ----------
function clearActions() { $("#actionbar").innerHTML = ""; }
function addBtn(label, fn, ghost) {
  const b = document.createElement("button"); b.textContent = label; if (ghost) b.className = "ghost";
  b.addEventListener("click", fn); $("#actionbar").appendChild(b); return b;
}

// Piktogramme im Artwork-Stil (kraeftig, dicke runde Formen) — die Zielgruppe kann noch nicht lesen.
// LLM-generierte Artwork-Icons (flach, dicke Konturen, wie die Karten) — freigestellt.
const ICON = {
  build:  `<img class="psvg" src="assets/icons/build.png" alt="">`,
  turbo:  `<img class="psvg" src="assets/icons/turbo.png" alt="">`,
  save:   `<img class="psvg" src="assets/icons/save.png" alt="">`,
  repair: `<img class="psvg" src="assets/icons/repair.png" alt="">`,
  tow:    `<img class="psvg" src="assets/icons/tow.png" alt="">`,
  back:   `<img class="psvg" src="assets/icons/back.png" alt="">`,
  again:  `<img class="psvg" src="assets/icons/replay.png" alt="">`,
  home:   `<img class="psvg" src="assets/icons/home.png" alt="">`,
  sound:  `<img class="psvg" src="assets/icons/sound.png" alt="">`,
  // kleines "+"-Abzeichen fuer Booster/Nachschub (bleibt Vektor)
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#39c26a" stroke="#0f2e1c" stroke-width="1.6"/><path d="M12 6v12M6 12h12" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>`
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
    if (game.opts.modules >= 2 && me.bat > 0) {
      const tb = iconBtn({ cls: "pturbo", title: `Bauen mit Turbo — Batterie einsetzen, Kraft ${card.kraft} → ${card.kraft + 2}`, icon: ICON.turbo,
        cost: costPips("assets/batterie.png", 1),
        fn: () => doCommit({ type: "build", uid: card.uid, turbo: true }) });
      // Resultwert sichtbar: eine Zahl sagt dem Kind sofort, was Turbo bringt.
      const chip = document.createElement("span"); chip.className = "presult";
      chip.innerHTML = `${card.kraft}<span class="arr">→</span>${card.kraft + 2}`;
      tb.appendChild(chip);
    }
  } else if (card.kind === "booster") {
    const img = card.gives === "bat" ? "assets/batterie.png" : "assets/kanister.png";
    iconBtn({ cls: card.gives === "bat" ? "pgainb" : "pgain", title: `Ausspielen: +1 ${card.gives === "bat" ? "Batterie" : "Kanister"}`,
      icon: resImg(img), badge: ICON.plus, fn: () => doCommit({ type: "booster", uid: card.uid }) });
  } else if (card.kind === "tow") {
    // Abschleppen ist die Hauptfunktion -> immer zeigen; ohne Gegner-Maschine ausgegraut.
    const hasTarget = !!game.players[1 - persp].slot;
    iconBtn({ cls: "ptow", disabled: !hasTarget, icon: ICON.tow,
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
    iconBtn({ cls: "prepair", title: "Reparieren — Maschine zurückholen (kostet 2 Batterien)", icon: ICON.repair,
      cost: costPips("assets/batterie.png", 2), fn: () => { Snd.click(); showRepairPick(); } });
  iconBtn({ cls: "psave", ghost: true, title: "Sparen — nichts bauen, Treibstoff behalten und weiter sammeln",
    icon: ICON.save, fn: () => doCommit({ type: "pass" }) });
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
  const resBanner = (lastResult && game.round > 1) ? `<div class="incresult">${lastResult}</div>` : "";
  lastResult = "";
  showOverlay(`${resBanner}<h2>Einkommen</h2><p>Nimm eines pro Runde — dein Vorrat:</p>${stat}
    <div class="incpick incpick-lbl">
      <div class="incopt"><button class="pbtn pincome pfuel" id="inFuel" title="Treibstoff nehmen" aria-label="Treibstoff nehmen"><img class="pbig xl" src="assets/kanister.png" alt=""></button><div class="pcap"><b>Treibstoff</b><span>Maschinen bauen</span></div></div>
      ${m2 ? `<div class="incopt"><button class="pbtn pincome pbat" id="inBat" title="Batterie nehmen" aria-label="Batterie nehmen"><img class="pbig xl" src="assets/batterie.png" alt=""></button><div class="pcap"><b>Batterie</b><span>+2 Kraft beim Bauen</span></div></div>` : ""}
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
  // Strategie-Nudge in den ersten Runden (Playtester wünschte sich Beispiele/Strategien)
  if (game.round <= 2) {
    const tip = document.createElement("div"); tip.className = "acthint acttip";
    tip.textContent = "💡 Grössere Zahl gewinnt den Kampf. Spare Treibstoff für starke Maschinen (5–6); eine Batterie gibt +2, wenn du mit Turbo baust.";
    $("#actionbar").appendChild(tip);
  }
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
// Kristall-Zaehler SOFORT auf den neuen Stand bringen (Symbol auffuellen, nicht nur animieren) — Playtester-Wunsch
function fillCrystalNow(i) {
  const area = (i === persp) ? $("#meArea") : $("#oppArea");
  const c = area && area.querySelector(".crystals"); if (!c) return;
  const p = game.players[i];
  c.innerHTML = gauge("assets/kristall.png", p.crystals, game.opts.target, true) + `<b>${p.crystals}/${game.opts.target}</b>`;
}

// ---------- Aufdecken & Kampf ----------
async function revealAndResolve() {
  acting = false; persp = 0;
  const _ms = $("#meSlot"); if (_ms) _ms.classList.remove("buildable");
  renderBoard();
  await sleep(500);   // kurzer Atemzug, bevor der Countdown startet (Zielgruppe: langsamer)
  const A = game.players[0], B = game.players[1];
  const pre = [A.slot, B.slot];
  const disp = i => {
    const p = game.players[i], a = p.pending || { type: "pass" };
    if (a.type === "build") return { card: game.handCard(p, a.uid), turbo: a.turbo && p.bat > 0 };
    if (p.slot) return { card: p.slot, turbo: p.slotTurbo };
    if (a.type === "tow") {
      // +1-Modus: das GEWÄHLTE Item (Kanister/Batterie) leuchtend zeigen — kein Emoji. Abschlepp-Modus: kein Badge (Effekt ist animiert).
      if (a.mode === "plus") return { card: game.handCard(p, a.uid), itemImg: a.plusType === "bat" ? "assets/batterie.png" : "assets/kanister.png", label: "Nachschub" };
      return { card: game.handCard(p, a.uid), label: "Abschlepper" };
    }
    if (a.type === "booster") return { card: game.handCard(p, a.uid), label: "Booster" };   // kein Emoji nötig
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
    FX.ring(mid.x, mid.y, "255,207,63");   // kurzer Aufprall-Blitz (Ring), KEIN Gold-Konfetti mehr
    if (fight) {
      // Beide Welten prallen zusammen — jede mit IHREM eigenen Effekt (Schutt/Sterne/Qualm/Blitze),
      // damit man die Welten sieht statt generischer Funken.
      worldFx(d0.card, mid, true); worldFx(d1.card, mid, true);
    } else {
      FX.burst(mid.x, mid.y, "255,180,60", 20, { spread: 11 });   // Fallback ohne Weltkampf
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
    const scName = game.players[score.i].name, scKommt = scName === "Du" ? "kommst" : "kommt";
    flash(`${scName} ${scKommt} durch!`);
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
    flash(`${scName} ${scKommt} durch — ein Kristall!`);
    fillCrystalNow(score.i);   // Zaehler SOFORT auffuellen (nicht nur animieren) — Playtester-Wunsch
    pulseCrystals(score.i);
    await sleep(760);
    if (el) el.classList.remove("through");
  } else if (!towed) {
    flash("Nichts passiert");
  }
  drainFx(ev);   // Modul 3: Brems-Effekte sichtbar machen (Gegner verliert Kanister/Batterie)
  lastResult = summarizeResult(ev);   // fürs nächste Einkommens-Overlay merken
  const win = ev.find(e => e.t === "win");
  await sleep(win ? 1900 : 2600);   // Zahlen/Kristall stehen ~2,2 s -> Ergebnis nicht vorher wegnehmen
  if (TUT.active) { TUT.afterResolve(ev); return; }   // Tutorial fuehrt selbst weiter
  advance();
}

function showSlotReveal(el, d) {
  const back = el.querySelector(".card.back");   // liegt eine verdeckte Karte hier?
  const build = flip => {
    el.innerHTML = ""; el.classList.remove("empty");
    if (d.card) {
      const c = cardEl(d.card); c.classList.add("reveal"); if (flip) c.classList.add("flipin");
      battleBadges(c, d.card, d.turbo);   // rotes +1 (ab Runde 1) + Batterie-+2 auch beim Aufdecken/Kampf
      if (d.itemImg) { const s = document.createElement("div"); s.className = "itembadge"; s.style.backgroundImage = `url("${d.itemImg}")`; c.appendChild(s); }
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
function playFullscreenVideo(src, onDone, poster) {
  let called = false; const go = () => { if (called) return; called = true; try { onDone(); } catch (e) {} };
  if (!fxOn()) return go();
  const sp = document.createElement("div"); sp.className = "fsvideo";
  const v = document.createElement("video");
  // Sieg/Niederlage laufen NACH Nutzer-Interaktion -> Ton-Autoplay ist erlaubt. Erst MIT Ton
  // versuchen; falls der Browser blockt, stumm weiterlaufen und "Antippen fuer Ton" zeigen.
  v.src = src; v.autoplay = true; v.muted = false; v.playsInline = true; v.preload = "auto";
  if (poster) v.poster = poster;                 // Startbild statt Schwarzbild vor dem Abspielen
  if (v.setAttribute) { v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", ""); }
  const skip = document.createElement("button"); skip.className = "fsskip"; skip.textContent = "Überspringen ▸";
  const snd = document.createElement("div"); snd.className = "fssound"; snd.textContent = "🔊 Antippen für Ton";
  sp.appendChild(v); sp.appendChild(skip); sp.appendChild(snd);
  document.body.appendChild(sp);
  let done = false, watchdog = 0, startGuard = 0, lastProgress = Date.now();
  const cleanup = () => { if (watchdog) { clearInterval(watchdog); watchdog = 0; } if (startGuard) { clearTimeout(startGuard); startGuard = 0; } };
  const end = () => { if (done) return; done = true; cleanup(); sp.classList.add("gone"); setTimeout(() => sp.remove && sp.remove(), 450); go(); };
  v.addEventListener("ended", end);
  v.addEventListener("error", end);
  // WICHTIG: KEINE feste Wanduhr-Abschaltung. Frueher beendete ein Timer auf Videolaenge (bzw. 15s)
  // das Video hart -> auf Mobile schnitt jedes Puffern den Film mittendrin ab. Jetzt endet er nur
  // bei "ended"/"error", plus zwei robuste Waechter:
  //  - startGuard: laedt in 20s KEINE Metadaten (Datei fehlt/kaputt) -> weiter.
  //  - Stall-Waechter: nur beenden, wenn die Wiedergabe wirklich haengt (kein Fortschritt >25s).
  //    Normales Puffern verschiebt lastProgress und unterbricht daher NICHT.
  startGuard = setTimeout(() => { if (v.readyState < 1) end(); }, 20000);
  const bump = () => { lastProgress = Date.now(); };
  v.addEventListener("timeupdate", bump);
  v.addEventListener("playing", () => { bump(); if (startGuard) { clearTimeout(startGuard); startGuard = 0; } });
  watchdog = setInterval(() => { if (v.ended) return end(); if (Date.now() - lastProgress > 25000) end(); }, 3000);
  skip.addEventListener("click", e => { e.stopPropagation(); end(); });
  sp.addEventListener("click", () => { if (v.muted) { v.muted = false; const q = v.play && v.play(); if (q && q.catch) q.catch(() => {}); snd.classList.add("gone"); } });
  const p = v.play();
  if (p && p.then) p.then(() => { snd.classList.add("gone"); })   // Ton laeuft -> Pille weg
    .catch(() => { v.muted = true; const q = v.play && v.play(); if (q && q.catch) q.catch(() => {}); }); // blockiert -> stumm, Pille bleibt
}

function winScreen() {
  // Aufraeumen: keine haengengebliebenen Karten/Effekte aus der letzten Runde (Playtester-Bug: Karte blieb haengen)
  ["#meSlot", "#oppSlot"].forEach(s => { const el = $(s); if (el) { el.innerHTML = ""; el.classList.add("empty"); } });
  ["#meArea .handrow", "#oppArea .handrow", ".opphand"].forEach(s => { const el = document.querySelector(s); if (el) el.innerHTML = ""; });
  document.querySelectorAll(".bigcrystal, .floattext, .worldfx").forEach(e => e.remove());
  const w = game.players[game.winner];
  const humanWon = !w.isAI;
  // Nur Siege gegen den Computer zaehlen fuer die Freischaltung.
  const unlocked = (humanWon && cfg.mode === "ai") ? Prog.addWin(cfg.modules) : 0;
  if (humanWon && cfg.mode === "ai") applyProgression();
  // Erfolge verbuchen (nur gegen den Computer; Sieg UND Niederlage, damit die Serie stimmt).
  let freshAch = [];
  if (cfg.mode === "ai") {
    const foe = game.players.find(p => p.isAI) || game.players[1 - game.winner];
    freshAch = Ach.record({ won: humanWon, round: game.round, target: game.opts.target,
      oppC: foe ? foe.crystals : 0, level: cfg.ai, modules: cfg.modules });
    refreshGlossy();   // neue Erfolge -> evtl. neue Glanzkarte freigeschaltet
  }
  const show = () => {
    FX.rain(); FX.burst(innerWidth / 2, innerHeight / 2, "255,207,63", 60, { spread: 14, g: 0.12 }); shake(1.4);
    humanWon ? Snd.win() : Snd.lose();
    const unlockMsg = unlocked ? `<div class="unlockbanner">🎉 ${MOD_LABEL[unlocked]} freigeschaltet!</div>` : "";
    const achMsg = freshAch.length ? `<div class="achunlocks"><div class="achunlead">Neuer Erfolg!</div>`
      + freshAch.map(a => `<div class="achpop"><span class="achpe">${achSVG(a.id, true)}</span><span class="acht"><b>${a.name}</b>${a.desc}</span></div>`).join("")
      + `</div>` : "";
    showOverlay(`<div class="winbanner">🏆 ${w.name} ${w.name === "Du" ? "gewinnst" : "gewinnt"}!</div>
      <div class="wingems">${"◆".repeat(w.crystals)}</div>
      <p>${w.crystals} Kristalle gesammelt in ${game.round} Runden.</p>
      ${unlockMsg}
      ${achMsg}
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

// ================= TUTORIAL (gefuehrt, garantierter Sieg) =================
const Coach = {
  el: null,
  clear() { if (this.el && this.el.remove) this.el.remove(); this.el = null; },
  point(sel, text, onTap) {
    this.clear();
    if (typeof document === "undefined" || !document.createElement) { onTap && onTap(); return; }
    const c = document.createElement("div"); c.className = "coach";
    let ring = "";
    const t = sel && document.querySelector(sel);
    if (t && t.getBoundingClientRect) {
      const r = t.getBoundingClientRect();
      if (r.width) ring = `<div class="coachring" style="left:${r.left - 10}px;top:${r.top - 10}px;width:${r.width + 20}px;height:${r.height + 20}px"></div>`
        + `<div class="coachhand" style="left:${r.left + r.width / 2 - 20}px;top:${r.top + r.height + 4}px">👆</div>`;
    }
    c.innerHTML = ring + `<div class="coachbubble"><div class="coachtext">${text}</div><div class="coachtap">✔ tippen</div></div>`;
    if (document.body) document.body.appendChild(c);
    const go = () => { if (this.el !== c) return; if (Snd.click) Snd.click(); this.clear(); onTap && onTap(); };
    c.addEventListener("click", go);
    this.el = c;
  },
  say(text, onTap) { this.point(null, text, onTap); },
};

const TUT = {
  active: false,
  seen() { try { return !!localStorage.getItem("kb_tut_seen"); } catch (e) { return false; } },
  done() { try { localStorage.setItem("kb_tut_seen", "1"); } catch (e) {} },
  start() { this.showPanels(() => this.play()); },
  offer() {
    showOverlay(`<div class="tutoffer"><h2>🎓 Neu hier?</h2><p>Sollen wir zusammen eine kurze Übungsrunde spielen?</p>
      <div class="tutofferbtns">
        <button class="big" id="tofferYes">Ja, zeig mir! ▶</button>
        <button class="big ghostbtn" id="tofferNo">Später</button>
      </div></div>`);
    $("#tofferYes").onclick = () => { Snd.click(); hideOverlay(); TUT.start(); };
    $("#tofferNo").onclick = () => { Snd.click(); hideOverlay(); TUT.done(); };
  },
  // ---- illustrierte Kurzregeln ----
  showPanels(onDone) {
    const P = [
      { img: "assets/hero.png", t: "Zwei Maschinen treten gegeneinander an. 🤖🚚" },
      { img: "assets/kanister.png", t: "Jede Runde nimmst du <b>eines</b>: einen Kanister ⛽ zum Bauen — oder eine Batterie 🔋 für Extra-Kraft." },
      { img: "assets/kristall.png", t: "Beim Aufdecken gewinnt die <b>größere Zahl</b>." },
      { img: "assets/kristall.png", t: "Die Siegermaschine <b>bleibt stehen</b> und kämpft weiter." },
      { img: "assets/kristall.png", t: "Steht sie allein da (der Gegner hat keine), kommt sie <b>durch</b> und holt einen Kristall ⬦." },
      { img: "cards/TRK-5_Monster-Truck.png", t: "Extra – <b>Weltkräfte</b>: Du wählst 2 von 4 Welten, jede mit eigener Kraft." },
      { img: "cards/BAU-5_Turbo-Bagger.png", t: "<b>Bau</b> & <b>Kosmos</b>: der Gegner verliert einen Kanister ⛽ — ab Runde 2." },
      { img: "cards/TRK-5_Monster-Truck.png", t: "<b>Truck</b>: +1 Kraft, schon ab Runde 1. <b>Technik</b>: bei einem Kampf-Sieg Kanister & Batterie weg." },
      { img: "assets/kristall.png", t: "Wer zuerst genug Kristalle hat, <b>gewinnt</b>! 🏆" },
    ];
    let i = 0;
    const render = () => {
      const p = P[i], last = i === P.length - 1;
      showOverlay(`<div class="tutpanel">
        <div class="tutimg" style="background-image:url('${p.img}')"></div>
        <div class="tuttext">${p.t}</div>
        <div class="tutnav">
          ${i > 0 ? `<button class="tutround" id="tp">‹</button>` : `<span class="tutround ghost"></span>`}
          <div class="tutdots">${P.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
          <button class="big tutnext" id="tn">${last ? "Los geht's! ▶" : "Weiter ›"}</button>
        </div>
        <div class="tutfoot"><button class="tutlink" id="tposter">📖 Alle Regeln</button><button class="tutlink" id="tskip">Überspringen</button></div>
      </div>`);
      $("#tn").onclick = () => { Snd.click(); if (last) { hideOverlay(); onDone(); } else { i++; render(); } };
      if ($("#tp")) $("#tp").onclick = () => { Snd.click(); i--; render(); };
      $("#tposter").onclick = () => { Snd.click(); TUT.showPoster(); };
      $("#tskip").onclick = () => { Snd.click(); hideOverlay(); TUT.done(); backToMenu(); };
    };
    render();
  },
  showPoster() {
    const o = document.createElement("div"); o.className = "posterview";
    o.innerHTML = `<img src="assets/kurzregeln.png" alt="Regeln"><button class="posterclose" aria-label="Schließen">✕</button>`;
    o.addEventListener("click", () => o.remove());
    document.body.appendChild(o);
  },
  // ---- gefuehrtes Spiel (Modul 1, Ziel 2, gerigt) ----
  play() {
    $("#menu").classList.add("hidden"); hideOverlay();
    $("#table").classList.remove("hidden");
    if (document.body && document.body.classList) document.body.classList.add("playing");
    if (introVid && introVid.pause) introVid.pause();
    FX.start();
    ["oppDeck", "meDeck"].forEach(id => { if (!$("#" + id)) { const d = document.createElement("div"); d.id = id; d.className = "deckpile"; $("#battle").appendChild(d); } });
    // Modul 2, damit die Batterie im Tutorial wirklich existiert (geführte Einkommens-Wahl).
    game = new Game({ modules: 2, target: 2, deckDoubled: true, boosters: 0, tows: 0, names: ["Du", "Computer"], ai: [false, true], aiLevel: 0 });
    const me = game.players[0], op = game.players[1];
    const pull = (p, k) => { const idx = p.deck.findIndex(c => c.kraft === k); return idx >= 0 ? p.deck.splice(idx, 1)[0] : p.deck.pop(); };
    const strong = pull(me, 3), weak = pull(op, 1);   // Spieler stark (Kraft 3), Gegner schwach (Kraft 1)
    game.round = 1; game.phase = "act";
    // fuel 4 reicht für die starke Maschine (Kosten 3) in BEIDEN Zweigen — auch wenn das Kind die Batterie nimmt.
    Object.assign(me, { income: "fuel", fuel: 4, bat: 0, crystals: 0, slot: null, slotTurbo: false, pending: null, hand: [strong], deck: [], garage: [] });
    Object.assign(op, { income: "fuel", fuel: 1, bat: 0, crystals: 0, slot: null, slotTurbo: false, hand: [weak], deck: [], garage: [] });
    op.pending = { type: "build", uid: weak.uid, turbo: false };   // Gegner baut Runde 1 eine kleine Maschine
    game.aiChoose = (p) => { const c = p.hand.find(x => x.kraft && x.cost <= p.fuel); return (game.round <= 1 && c) ? { type: "build", uid: c.uid, turbo: false } : { type: "pass" }; };
    this.active = true; this.turboBranch = false; persp = 0; renderBoard();
    Coach.say("Willkommen! 👋 Wir spielen zusammen — und du gewinnst. Zuerst: Was nimmst du?", () => this.income());
  },
  // Geführte Einkommens-Wahl: das Kind wählt Treibstoff ODER Batterie; beide Zweige führen zum Sieg.
  income() {
    persp = 0; renderBoard();
    const me = game.players[0];
    showOverlay(`<div class="tutincome"><h2>Nimm eine Sache</h2>
      <p>Jede Runde nimmst du <b>eines</b>: Treibstoff zum Bauen — oder eine Batterie für Extra-Kraft. Wähl selbst!</p>
      <div class="incpick incpick-lbl">
        <div class="incopt"><button class="pbtn pincome pfuel" id="tinFuel" title="Treibstoff nehmen" aria-label="Treibstoff nehmen"><img class="pbig xl" src="assets/kanister.png" alt=""></button><div class="pcap"><b>Treibstoff</b><span>Maschinen bauen</span></div></div>
        <div class="incopt"><button class="pbtn pincome pbat" id="tinBat" title="Batterie nehmen" aria-label="Batterie nehmen"><img class="pbig xl" src="assets/batterie.png" alt=""></button><div class="pcap"><b>Batterie</b><span>+2 Kraft beim Bauen</span></div></div>
      </div></div>`);
    const pick = (k) => {
      Snd.click(); hideOverlay();
      if (k === "bat") { me.income = "bat"; me.bat = 1; this.turboBranch = true; }
      else { me.income = "fuel"; me.fuel += 1; this.turboBranch = false; }
      renderBoard();
      const msg = k === "bat"
        ? "Eine Batterie! 🔋 Damit baust du gleich mit <b>Turbo</b> — deine Maschine wird noch stärker."
        : "Treibstoff ⛽ — damit baust du gleich deine Maschine.";
      Coach.say(msg, () => this.round());
    };
    $("#tinFuel").onclick = () => pick("fuel");
    $("#tinBat").onclick = () => pick("bat");
  },
  round() {
    persp = 0; renderBoard();
    const me = game.players[0];
    if (me.slot) {
      Coach.point("#meSlot", "Deine Maschine kämpft weiter und holt einen Kristall. Tipp zum Aufdecken!", () => { me.pending = { type: "none" }; TUT.go(); });
    } else {
      const card = me.hand.find(c => c.kraft && c.cost <= me.fuel) || me.hand[0];
      const turbo = !!this.turboBranch && me.bat > 0;   // nur wenn das Kind die Batterie genommen hat
      const txt = turbo
        ? "Tipp deine Maschine — mit der Batterie baust du sie mit Turbo!"
        : "Tipp deine Maschine — sie ist stärker als die des Gegners!";
      Coach.point("#meArea .mehand .card", txt, () => { me.pending = { type: "build", uid: card.uid, turbo }; this.turboBranch = false; TUT.go(); });
    }
  },
  go() { Coach.clear(); revealAndResolve(); },   // Ende wird in revealAndResolve via afterResolve abgefangen
  afterResolve(ev) {
    if (ev.find(e => e.t === "win")) return this.finish();
    const score = ev.find(e => e.t === "score" && e.i === 0);
    const clash = ev.find(e => e.t === "clash" && e.winner === 0);
    let msg = "Weiter geht's!";
    if (score) { const left = game.opts.target - game.players[0].crystals; msg = left > 0 ? `Ein Kristall! ⬦ Noch ${left} bis zum Sieg.` : "Ein Kristall! ⬦"; }
    else if (clash) msg = "Die größere Zahl gewinnt! 💪 Deine Maschine bleibt stehen.";
    setTimeout(() => Coach.say(msg, () => this.round()), 250);
  },
  finish() {
    this.active = false; Coach.clear(); this.done();
    FX.rain(); if (Snd.win) Snd.win(); shake(1.2);
    showOverlay(`<div class="winbanner">🏆 Geschafft — du hast gewonnen!</div>
      <p>Jetzt kennst du das Spiel. Viel Spaß! 🚀</p>
      <div class="incpick" style="margin-top:16px">
        <button class="pbtn pagain pbig-btn" id="tagain" title="Nochmal lernen" aria-label="Nochmal lernen"><span class="picon">${ICON.again}</span></button>
        <button class="pbtn phome pghost pbig-btn" id="tmenu" title="Zum Menü" aria-label="Zum Menü"><span class="picon">${ICON.home}</span></button>
      </div>`);
    $("#tagain").onclick = () => { Snd.click(); TUT.play(); };
    $("#tmenu").onclick = () => { Snd.click(); hideOverlay(); backToMenu(); };
  },
};
if ($("#learnBtn")) $("#learnBtn").addEventListener("click", () => { Snd.resume(); Snd.click(); TUT.start(); });
// Erklaervideo als Vollbild abspielen (danach zurueck ins Menue).
if ($("#videoBtn")) $("#videoBtn").addEventListener("click", () => { Snd.resume(); Snd.click(); playFullscreenVideo("assets/erklaervideo.mp4", () => {}, "assets/erklaervideo_poster.jpg"); });
// Erfolge-Sammlung anzeigen.
if ($("#achBtn")) $("#achBtn").addEventListener("click", () => { Snd.resume(); Snd.click(); showAchievements(); });
if ($("#glossyBtn")) $("#glossyBtn").addEventListener("click", () => { Snd.resume(); Snd.click(); showGlossy(); });
refreshGlossy();   // beim Start einmal aus den gespeicherten Erfolgen berechnen
// Beim allerersten Start das Tutorial anbieten (sobald das Menue sichtbar ist).
if (!TUT.seen()) setTimeout(() => { if ($("#menu") && !$("#menu").classList.contains("hidden") && (!ov || ov.classList.contains("hidden"))) TUT.offer(); }, 2200);
