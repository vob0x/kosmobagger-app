import { Game } from "./engine.js";
function playOut(opts, cap=200) {
  const g = new Game(opts);
  let r = 0;
  while (g.phase !== "gameover" && r < cap) { g.resolve(); r++; }
  return { winner: g.winner, rounds: g.round, done: g.phase === "gameover",
           cr: g.players.map(p=>p.crystals) };
}
function run(label, opts, n=3000) {
  let w0=0, done=0, sumR=0, stuck=0;
  for (let i=0;i<n;i++){ const r=playOut(opts); if(r.done)done++; else stuck++; if(r.winner===0)w0++; sumR+=r.rounds; }
  console.log(`${label}: P0-Sieg ${(100*w0/n).toFixed(1)}%  fertig ${(100*done/n).toFixed(1)}%  Ø-Runden ${(sumR/n).toFixed(1)}  haenger ${stuck}`);
}
// Spiegeltest: beide KI gleich stark -> ~50%
run("Spiegel Ziel3 M1", {modules:1, target:3, ai:[true,true], aiLevel:0.9, boosters:0, tows:0});
run("Spiegel Ziel5 M2", {modules:2, target:5, ai:[true,true], aiLevel:0.9});
// Skill: starke KI (P0) vs zufaellige (P1)
run("Skill Ziel5 M2", {modules:2, target:5, ai:[true,true], aiLevel:0.9, names:["A","B"]}, 3000);
// dieselbe, aber P1 schwach (level 0)
(function(){
  let w0=0,n=3000,sumR=0;
  for(let i=0;i<n;i++){ const g=new Game({modules:2,target:5,ai:[true,true],boosters:4,tows:2});
    g.players[0]._lvl=0.9; g.players[1]._lvl=0.0;
    // override level per player: monkeypatch aiLevel via choosing—simple: set opts then bias
    let r=0; while(g.phase!=="gameover"&&r<200){ // recompute pending with per-player level
      g.players.forEach(p=>{ if(p.isAI){ g.opts.aiLevel = p.idx===0?0.9:0.0; p.pending=g.aiChoose(p);} });
      g.resolve(); r++; }
    if(g.winner===0)w0++; sumR+=g.round; }
  console.log(`Skill stark(P0) vs zufall(P1): P0 ${(100*w0/n).toFixed(1)}%  Ø-Runden ${(sumR/n).toFixed(1)}`);
})();
