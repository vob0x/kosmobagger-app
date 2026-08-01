// PENIBLER AUDIT: Asset-Integrität (SW + Karten + Manifest) und Engine-Invarianten über viele Zufallsspiele.
import fs from "fs";
import { Game, TANK_MAX, BAT_MAX, WORLD_POWERS } from "./engine.js";

let fails = 0, warns = 0;
const ok = m => console.log("  ok   " + m);
const bad = m => { console.log("  FAIL " + m); fails++; };
const warn = m => { console.log("  warn " + m); warns++; };
const exists = p => fs.existsSync(p);

console.log("=== 1) SERVICE-WORKER ASSET-LISTE ===");
const sw = fs.readFileSync("sw.js", "utf8");
const assetBlock = sw.match(/ASSETS\s*=\s*\[([\s\S]*?)\]/)[1];
const assets = [...assetBlock.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(s => s !== "./");
let miss = assets.filter(a => !exists(a));
miss.length ? bad(`fehlende SW-Assets: ${miss.join(", ")}`) : ok(`alle ${assets.length} SW-Assets existieren`);
const cacheV = (sw.match(/kosmobagger-v(\d+)/) || [])[1];
ok(`Cache-Version v${cacheV}`);

console.log("=== 2) KARTEN-BILDPFADE (cards.js) ===");
const cardsjs = fs.readFileSync("cards.js", "utf8");
const imgs = [...cardsjs.matchAll(/"img":\s*"([^"]+)"/g)].map(m => m[1]);
let missImg = imgs.filter(a => !exists(a));
missImg.length ? bad(`fehlende Kartenbilder: ${missImg.join(", ")}`) : ok(`alle ${imgs.length} Kartenbilder existieren`);
const notInSW = imgs.filter(a => !assets.includes(a));
notInSW.length ? warn(`Karten nicht im SW-Cache (offline evtl. fehlend): ${notInSW.length}`) : ok("alle Karten im SW-Cache gelistet");

console.log("=== 3) MANIFEST + ICONS ===");
if (exists("manifest.webmanifest")) {
  const man = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
  const iconMiss = (man.icons || []).map(i => i.src).filter(s => !exists(s));
  iconMiss.length ? bad(`Manifest-Icons fehlen: ${iconMiss.join(", ")}`) : ok(`Manifest ok, ${(man.icons || []).length} Icons vorhanden`);
} else bad("manifest.webmanifest fehlt");

console.log("=== 4) DEBUG-LEAKS in app.js ===");
const appjs = fs.readFileSync("app.js", "utf8");
const logs = (appjs.match(/console\.log\(/g) || []).length;
logs ? warn(`${logs}x console.log in app.js`) : ok("keine console.log in app.js");

console.log("=== 5) ENGINE-INVARIANTEN (2000 Zufallsspiele) ===");
const worlds4 = Object.keys(WORLD_POWERS);
const pair = () => { const a = worlds4[Math.floor(Math.random() * 4)]; let b; do { b = worlds4[Math.floor(Math.random() * 4)]; } while (b === a); return [a, b]; };
const num = x => typeof x === "number" && isFinite(x);
let stuck = 0, boundViol = 0, overshoot = 0, done = 0, N = 2000;
for (let i = 0; i < N; i++) {
  const modules = 1 + Math.floor(Math.random() * 2);
  const target = Math.random() < 0.5 ? 3 : 5;
  const wp = modules >= 2 && Math.random() < 0.6;
  const opts = { modules, target, ai: [true, true], aiLevel: [0.6, 0.85, 0.97][Math.floor(Math.random() * 3)] };
  if (wp) { opts.worldPowers = true; opts.worlds = [pair(), pair()]; opts.powerStartRound = 2; }
  const g = new Game(opts);
  g.players[0]._level = [0.6, 0.85, 0.97][Math.floor(Math.random() * 3)];
  g.players[1]._level = [0.6, 0.85, 0.97][Math.floor(Math.random() * 3)];
  let r = 0;
  while (g.phase !== "gameover" && r < 400) {
    g.resolve(); r++;
    for (const p of g.players) {
      if (!num(p.fuel) || p.fuel < 0 || p.fuel > TANK_MAX) boundViol++;
      if (!num(p.bat) || p.bat < 0 || p.bat > BAT_MAX) boundViol++;
      if (!num(p.crystals) || p.crystals < 0) boundViol++;
      if (p.slot && !num(p.slot.kraft)) boundViol++;
    }
  }
  if (g.phase !== "gameover") stuck++;
  else { done++; const w = g.players[g.winner]; if (w.crystals < target && g.round < 80) overshoot++; }  // <target nur bei Rundencap-Patt erlaubt
}
stuck ? bad(`${stuck}/${N} Spiele terminieren NICHT (Hänger)`) : ok(`alle ${N} Spiele terminieren`);
boundViol ? bad(`${boundViol} Ressourcen-Grenzverletzungen (fuel/bat/kristall/NaN)`) : ok("Ressourcen immer in [0..MAX], keine NaN");
overshoot ? bad(`${overshoot} Sieger unter Zielkristallen`) : ok("Sieger erreicht immer Zielkristalle");

console.log("=== 6) DEAD-CODE / UNGENUTZTE POWER-FLAGS ===");
const engjs = fs.readFileSync("engine.js", "utf8");
// survive/robust sind alte Design-Hooks (Gleichstand-überleben / knappe Niederlage überleben) — im Code, aber von keiner Live-Welt genutzt.
for (const flag of ["survive", "robust"]) {
  const inCode = engjs.includes("." + flag);
  const used = Object.values(WORLD_POWERS).some(pw => flag in pw);
  if (inCode && !used) warn(`Design-Hook '${flag}' im Engine-Code vorhanden, aber von keiner Live-Weltkraft genutzt (bewusst, reserviert)`);
}

console.log(`\n>>> AUDIT: ${fails} FEHLER, ${warns} Warnungen`);
process.exit(fails ? 2 : 0);
