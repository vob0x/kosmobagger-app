// Misst die Spielstaerke-Ordnung der KI-Stufen head-to-head (P0 vs P1) via Per-Spieler-_level.
import { Game } from "./engine.js";
const L = 0.6, M = 0.85, S = 0.97;

function playOut(A, B, opts, cap = 250) {
  const g = new Game(opts);
  g.players[0]._level = A; g.players[1]._level = B;
  let r = 0; while (g.phase !== "gameover" && r < cap) { g.resolve(); r++; }
  return { winner: g.winner, done: g.phase === "gameover", rounds: g.round };
}
// Seitenneutral: jede Paarung zur Haelfte mit vertauschten Seiten -> reine Skill-Differenz.
function match(label, A, B, opts, n = 4000) {
  let wA = 0, done = 0, sumR = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const r = playOut(swap ? B : A, swap ? A : B, opts);
    if (r.done) done++;
    const aWon = swap ? (r.winner === 1) : (r.winner === 0);
    if (aWon) wA++;
    sumR += r.rounds;
  }
  console.log(`${label}: ${(100 * wA / n).toFixed(1)}%  fertig ${(100 * done / n).toFixed(1)}%  Ø-Runden ${(sumR / n).toFixed(1)}`);
}

const AI2 = { ai: [true, true] };
const M2 = { modules: 2, target: 5, ...AI2 };
const M1 = { modules: 1, target: 5, boosters: 0, tows: 0, ...AI2 };

console.log("== Modul 2, Ziel 5 (erste Zahl = Sieg% des ERSTgenannten) ==");
match("Stark  vs Mittel", S, M, M2);
match("Stark  vs Leicht", S, L, M2);
match("Mittel vs Leicht", M, L, M2);
match("Spiegel Stark ", S, S, M2);
match("Spiegel Mittel", M, M, M2);
match("Spiegel Leicht", L, L, M2);

console.log("== Modul 1, Ziel 5 (nur Treibstoff) ==");
match("Stark  vs Mittel", S, M, M1);
match("Mittel vs Leicht", M, L, M1);

console.log("== Ziel 3 (kurz), Modul 2 ==");
match("Stark  vs Mittel", S, M, { modules: 2, target: 3, ...AI2 });
match("Mittel vs Leicht", M, L, { modules: 2, target: 3, ...AI2 });
