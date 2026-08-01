// Exakter Weltkraft-Trigger-Test: feuert jede Kraft GENAU dann, wenn sie soll? (deterministisch, über Events)
import { Game, WORLD_POWERS } from "./engine.js";

// Spiel mit Welt wA (Spieler 0, Testwelt) vs Carrier (Spieler 1, Kraft DEAKTIVIERT), beide menschlich (voll skriptbar).
function mk(wA) {
  const carrier = wA === "KOSMOS" ? "BAU" : "KOSMOS";
  const powers = { ...WORLD_POWERS, [carrier]: {} };        // Gegnerkraft aus -> nur wA feuert
  const g = new Game({ modules: 2, target: 20, worldPowers: true, worlds: [[wA], [carrier]], ai: [false, false], powerStartRound: 2, powers });
  return g;
}
function ensure(p, kraft) {                                  // erzwingt Karte der gewünschten KRAFT auf der Hand
  let c = p.hand.find(x => x.kraft === kraft);
  if (c) return c;
  let idx = p.deck.findIndex(x => x.kraft === kraft);
  let src = idx >= 0 ? p.deck : p.garage;
  if (idx < 0) idx = p.garage.findIndex(x => x.kraft === kraft);
  if (idx < 0) return p.hand.find(x => x.kraft) || p.hand[0];
  c = src.splice(idx, 1)[0];
  const drop = p.hand.pop(); if (drop) p.deck.push(drop);
  p.hand.push(c); return c;
}
const build = c => ({ type: "build", uid: c.uid, turbo: false });
const PASS = { type: "pass" };
function step(g, a0, a1, fuel0 = 3, fuel1 = 3) {
  g.players[0].fuel = fuel0; g.players[1].fuel = fuel1;     // genug Treibstoff zum Bauen
  g.setIncome(0, "fuel"); g.setIncome(1, "fuel");
  g.commit(0, a0); g.commit(1, a1);
  return g.resolve();
}
const fired = (ev) => ev.some(e => e.t === "power" && e.i === 0);
const clash = (ev) => ev.find(e => e.t === "clash");

let fails = 0;
const check = (cond, msg) => { console.log((cond ? "  ok  " : "  FAIL") + "  " + msg); if (!cond) fails++; };

for (const W of ["BAU", "KOSMOS", "TRUCKS", "TECHNIK"]) {
  const on = (WORLD_POWERS[W].on) || "selfKraft";
  console.log(`\n=== ${W} (${WORLD_POWERS[W].label}, Auslöser: ${on}) ===`);

  // Szenario A: RUNDE 1 – W baut Kraft6, Gegner Kraft1 -> W gewinnt. Kraft darf NICHT feuern (Gate).
  let g = mk(W);
  let c0 = ensure(g.players[0], 6), c1 = ensure(g.players[1], 1);
  let ev = step(g, build(c0), build(c1));
  check(!fired(ev), `Runde 1: keine Kraft (Gate). Gefeuert=${fired(ev)}`);
  if (W === "TRUCKS") { const cl = clash(ev); check(cl && cl.ea === 6, `Runde 1: Vollgas AUS -> ea=${cl && cl.ea} (soll 6)`); }

  // -> Runde 2 (Zustand aus A weiterlaufen lassen; W-Maschine steht, Gegner in Garage)
  // Szenario B: RUNDE 2 – W baut frisch Kraft6 gegen neuen Gegner Kraft1 -> contested WIN.
  // (W steht noch aus Runde 1; um "frisch bauen" zu testen, schleppen wir nicht — wir prüfen den Sieg-Trigger am stehenden.)
  // Gegner baut Kraft1 -> W (steht, Kraft6) gewinnt den Kampf in Runde 2.
  c1 = ensure(g.players[1], 1);
  ev = step(g, PASS, build(c1));            // W steht schon, Gegner baut -> Kampf, W gewinnt
  const winTrig = (on === "win");
  check(fired(ev) === (on === "win" || on === "stand"), `Runde 2 contested WIN: gefeuert=${fired(ev)} (erwartet ${on === "win" || on === "stand"})`);
  if (W === "TRUCKS") { const cl = clash(ev); check(cl && cl.ea === 7, `Runde 2: Vollgas AN -> ea=${cl && cl.ea} (soll 7 = 6+1)`); }

  // Szenario C: RUNDE 2+ – W kommt UNKONTESTIERT durch (Gegner passt) -> SCORE.
  let g2 = mk(W);
  step(g2, PASS, PASS);                     // Runde 1 leer -> Runde 2
  let d0 = ensure(g2.players[0], 3);
  ev = step(g2, build(d0), PASS);           // W baut, Gegner leer -> W kommt durch (score)
  const scored = ev.some(e => e.t === "score" && e.i === 0);
  const scoreOrBuild = (on === "score" || on === "build");
  check(scored, `Runde 2 unkontestiert: score-Event vorhanden=${scored}`);
  check(fired(ev) === scoreOrBuild, `Runde 2 SCORE: Kraft gefeuert=${fired(ev)} (erwartet ${scoreOrBuild} für Auslöser '${on}')`);
}

console.log(fails ? `\n>>> ${fails} FEHLER/AUFFÄLLIGKEITEN` : "\n>>> alle Trigger wie erwartet");
