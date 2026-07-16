import { Game, TANK_MAX, BAT_MAX } from "./engine.js";
import { CARD_BACK } from "./cards.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Sound v2 (Web Audio: Hall, geschichtete Impacts, FM-Glocken) ----------
const Snd = (() => {
  let ctx = null, master = null, verbGain = null, noiseBuf = null, muted = false;
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      const verb = ctx.createConvolver(); verb.buffer = impulse(2.0, 3.2);
      verbGain = ctx.createGain(); verbGain.gain.value = 0.32; verb.connect(verbGain); verbGain.connect(master);
      Snd._verb = verb;
      const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseBuf = n;
    } catch (e) { ctx = null; }
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
    click() { if (!ok()) return; voice("triangle", 540, 0.09, 0.10, { to: 400, wet: 0.25 }); },
    hover() { if (!ok()) return; voice("sine", 760, 0.05, 0.04, { to: 940, wet: 0.2 }); },
    place() { if (!ok()) return; voice("sine", 190, 0.2, 0.28, { to: 62 }); noise(0.11, 0.2, { lp: 1700 }); voice("triangle", 520, 0.09, 0.08, { to: 300, wet: 0.3 }); },
    tick() { if (!ok()) return; voice("square", 900, 0.05, 0.07, { to: 850, wet: 0.2 }); },
    reveal() { if (!ok()) return; noise(0.34, 0.14, { hp: 500, lp: 5200 }); voice("sawtooth", 200, 0.4, 0.10, { to: 1000, wet: 0.5 }); },
    clash() { if (!ok()) return; voice("sine", 150, 0.55, 0.55, { to: 34, wet: 0.7 }); noise(0.2, 0.4, { lp: 2600 }); voice("square", 320, 0.22, 0.16, { to: 110 }); voice("sawtooth", 1000, 0.28, 0.09, { to: 420, wet: 0.6 }); },
    score() { if (!ok()) return;[784, 988, 1319, 1568].forEach((f, i) => bell(f, 0.6, 0.14, i * 0.085)); },
    win() { if (!ok()) return; const ch = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175]]; ch.forEach((c, i) => setTimeout(() => { if (ok()) c.forEach(f => voice("sawtooth", f, 0.55, 0.075, { wet: 0.6 })); }, i * 160)); [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, 0.7, 0.12, 0.72 + i * 0.12)); },
    lose() { if (!ok()) return;[392, 311, 262, 196].forEach((f, i) => voice("sawtooth", f, 0.4, 0.13, { to: f * 0.6, wet: 0.5 })); },
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
function centerOf(sel) { const r = ($(sel) || {}).getBoundingClientRect ? $(sel).getBoundingClientRect() : null; return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }; }

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
$("#menuBtn").addEventListener("click", () => { $("#table").classList.add("hidden"); $("#menu").classList.remove("hidden"); hideOverlay(); });

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

function renderBoard() {
  const me = game.players[persp], op = game.players[1 - persp];
  // Info
  const meA = $("#meArea"), opA = $("#oppArea");
  meA.querySelector(".pname").textContent = me.name;
  opA.querySelector(".pname").textContent = op.name;
  for (const [area, p] of [[meA, me], [opA, op]]) {
    area.querySelector(".tank").innerHTML = gauge("assets/kanister.png", p.fuel, TANK_MAX);
    area.querySelector(".batt").innerHTML = gauge("assets/batterie.png", p.bat, BAT_MAX);
    area.querySelector(".crystals").innerHTML = gauge("assets/kristall.png", p.crystals, game.opts.target, true) + `<b>${p.crystals}/${game.opts.target}</b>`;
    area.querySelector(".batt").style.display = game.opts.modules >= 2 ? "" : "none";
  }

  // Gegnerhand (Rueckseiten)
  const oh = opA.querySelector(".opphand"); oh.innerHTML = "";
  for (let i = 0; i < op.hand.length; i++) oh.appendChild(cardEl(null, { back: true }));

  // Slots (stehende Maschinen)
  slotShow($("#oppSlot"), op.slot, op.slotTurbo);
  slotShow($("#meSlot"), me.slot, me.slotTurbo);
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

function slotShow(el, card, turbo) {
  el.innerHTML = ""; el.classList.toggle("empty", !card);
  if (card) {
    const c = cardEl(card);
    if (turbo) { const t = document.createElement("div"); t.className = "turbobadge"; t.textContent = "+2"; c.appendChild(t); }
    el.appendChild(c);
  }
}

let selUid = null;

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
  const n = me.hand.length, mid = (n - 1) / 2;
  me.hand.forEach((card, idx) => {
    const wrap = document.createElement("div"); wrap.className = "handcard";
    const rot = (idx - mid) * 3.4, lift = Math.abs(idx - mid) * 7;
    wrap.style.setProperty("--rot", rot + "deg");
    wrap.style.transform = `rotate(${rot}deg) translateY(${lift}px)`;
    const el = cardEl(card);
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
}

// ---------- Aktionsleiste ----------
function clearActions() { $("#actionbar").innerHTML = ""; }
function addBtn(label, fn, ghost) {
  const b = document.createElement("button"); b.textContent = label; if (ghost) b.className = "ghost";
  b.addEventListener("click", fn); $("#actionbar").appendChild(b); return b;
}

function showActions(card) {
  const me = game.players[persp];
  clearActions();
  if (card.kraft) {
    addBtn(`Bauen  (${card.cost} ⛽)`, () => doCommit({ type: "build", uid: card.uid, turbo: false }));
    if (game.opts.modules >= 2 && me.bat > 0)
      addBtn(`Bauen + Turbo 🔋 (+2)`, () => doCommit({ type: "build", uid: card.uid, turbo: true }));
  } else if (card.kind === "booster") {
    addBtn(`Ausspielen: +1 ${card.gives === "bat" ? "🔋" : "⛽"}`, () => doCommit({ type: "booster", uid: card.uid }));
  } else if (card.kind === "tow") {
    if (game.players[1 - persp].slot) addBtn(`Abschleppen 🚛`, () => doCommit({ type: "tow", uid: card.uid, mode: "tow" }));
    addBtn(`Nachschub: +1 ⛽`, () => doCommit({ type: "tow", uid: card.uid, mode: "plus", plusType: "fuel" }));
    if (game.opts.modules >= 2) addBtn(`Nachschub: +1 🔋`, () => doCommit({ type: "tow", uid: card.uid, mode: "plus", plusType: "bat" }));
  }
  addBtn("Zurück", () => { selUid = null; renderHand(); baseActions(); }, true);
}

function baseActions() {
  const me = game.players[persp];
  clearActions();
  if (game.opts.modules >= 2 && me.bat >= 2 && me.garage.some(c => c.kraft))
    addBtn("Reparieren (2 🔋)", () => doCommit({ type: "repair" }));
  addBtn("Sparen (nichts bauen)", () => doCommit({ type: "pass" }), true);
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
  showOverlay(`<h2>Einkommen</h2><p>Nimm eines pro Runde:</p>
    <div style="display:flex;gap:12px;justify-content:center">
      <button class="big" style="max-width:170px" id="inFuel">⛽ Kanister</button>
      <button class="big" style="max-width:170px;background:linear-gradient(180deg,#5be08a,#28a35a)" id="inBat">🔋 Batterie</button>
    </div>`);
  const pick = k => { game.setIncome(human.idx, k); hideOverlay(); renderBoard(); promptCommit(human); };
  $("#inFuel").onclick = () => pick("fuel");
  $("#inBat").onclick = () => pick("bat");
}

function promptCommit(human) {
  renderBoard();
  const acts = game.legalActions(human.idx);
  if (acts.length === 1 && acts[0].type === "none") {   // Maschine kaempft weiter -> keine Wahl
    flash(`${human.name}: deine Maschine kämpft weiter`);
    game.commit(human.idx, acts[0]); setTimeout(advance, 650); return;
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

function doCommit(action) {
  if (!acting) return;
  acting = false;
  if (["build", "booster", "tow", "repair"].includes(action.type)) Snd.place(); else Snd.click();
  game.commit(persp, action);
  clearActions(); selUid = null;
  advance();
}

function flash(msg) { $("#centerMsg").textContent = msg; }

function pulseCrystals(i) {
  const area = (i === persp) ? $("#meArea") : $("#oppArea");
  const c = area && area.querySelector(".crystals"); if (!c) return;
  c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse");
}

// ---------- Aufdecken & Kampf ----------
async function revealAndResolve() {
  acting = false; persp = 0; renderBoard();
  const A = game.players[0], B = game.players[1];
  const pre = [A.slot, B.slot];
  const disp = i => {
    const p = game.players[i], a = p.pending || { type: "pass" };
    if (a.type === "build") return { card: game.handCard(p, a.uid), turbo: a.turbo && p.bat > 0 };
    if (p.slot) return { card: p.slot, turbo: p.slotTurbo };
    if (a.type === "tow") return { label: "🚛 Abschlepper" };
    if (a.type === "booster") return { label: "🛢 Booster" };
    if (a.type === "repair") return { label: "🔧 Reparieren" };
    return { label: "💤 Sparen" };
  };
  // 3 – 2 – 1 – Aufdecken (Gefuehl von "gleichzeitig")
  for (const n of ["3", "2", "1"]) { flash(n); Snd.tick(); await sleep(360); }
  Snd.reveal();
  showSlotReveal($("#meSlot"), disp(0));
  showSlotReveal($("#oppSlot"), disp(1));
  flash("Aufdecken!");
  await sleep(720);

  const ev = game.resolve();     // mutiert Zustand; danach lesen wir die Events
  // Kampf-Animation
  const clash = ev.find(e => e.t === "clash");
  const score = ev.find(e => e.t === "score");
  const towed = ev.find(e => e.t === "towed");
  const mid = centerOf("#centerMsg");
  if (towed) { flash("🚛 abgeschleppt!"); Snd.place(); FX.burst(centerOf("#oppSlot").x, centerOf("#oppSlot").y, "176,182,190", 20); }
  if (clash) {
    Snd.clash(); shake(clash.winner === -1 ? 1.3 : 1);
    FX.ring(mid.x, mid.y, "255,207,63"); FX.burst(mid.x, mid.y, "255,180,60", 34, { spread: 11 });
    if (clash.winner === -1) { markSlot("#meSlot", "lose"); markSlot("#oppSlot", "lose"); FX.burst(mid.x, mid.y, "255,90,90", 30); flash(`Gleichstand ${clash.ea} : ${clash.eb} — beide in die Garage`); }
    else {
      const meWon = clash.winner === 0;
      markSlot(meWon ? "#meSlot" : "#oppSlot", "win");
      markSlot(meWon ? "#oppSlot" : "#meSlot", "lose");
      const lc = centerOf(meWon ? "#oppSlot" : "#meSlot"); FX.burst(lc.x, lc.y, "160,170,190", 30, { spread: 7 });
      flash(`${clash.ea} : ${clash.eb} — ${meWon ? game.players[0].name : game.players[1].name} gewinnt`);
    }
  } else if (score) {
    Snd.score();
    const sc = centerOf(score.i === persp ? "#meSlot" : "#oppSlot");
    FX.sparkle(sc.x, sc.y, "120,225,255", 26); FX.ring(sc.x, sc.y, "87,208,232", 8);
    flash(`${game.players[score.i].name} kommt durch — ◆ +1 Kristall`);
    markSlot(score.i === 0 ? "#meSlot" : "#oppSlot", "win");
    pulseCrystals(score.i);
  } else if (!towed) {
    flash("Nichts passiert");
  }
  const win = ev.find(e => e.t === "win");
  await sleep(win ? 700 : 1150);
  advance();
}

function showSlotReveal(el, d) {
  el.innerHTML = ""; el.classList.remove("empty");
  if (d.card) {
    const c = cardEl(d.card); c.classList.add("reveal");
    if (d.turbo) { const t = document.createElement("div"); t.className = "turbobadge"; t.textContent = "+2"; c.appendChild(t); }
    el.appendChild(c);
  } else {
    el.classList.add("empty");
    const s = document.createElement("div"); s.style.cssText = "font-size:13px;color:#8aa;text-align:center;padding:6px";
    s.textContent = d.label || ""; el.appendChild(s);
  }
}
function markSlot(sel, cls) { const c = $(sel).querySelector(".card"); if (c) c.classList.add(cls); }

function winScreen() {
  const w = game.players[game.winner];
  const humanWon = !w.isAI;
  FX.rain(); FX.burst(innerWidth / 2, innerHeight / 2, "255,207,63", 60, { spread: 14, g: 0.12 }); shake(1.4);
  humanWon ? Snd.win() : Snd.lose();
  showOverlay(`<div class="winbanner">🏆 ${w.name} gewinnt!</div>
    <div class="wingems">${"◆".repeat(w.crystals)}</div>
    <p>${w.crystals} Kristalle gesammelt in ${game.round} Runden.</p>
    <button class="big" id="againBtn">Nochmal</button>
    <button class="big" id="menu2" style="background:#131a30;color:#cfe;margin-top:10px">Menü</button>`);
  $("#againBtn").onclick = () => { Snd.click(); startGame(); };
  $("#menu2").onclick = () => { Snd.click(); hideOverlay(); $("#table").classList.add("hidden"); $("#menu").classList.remove("hidden"); };
}
