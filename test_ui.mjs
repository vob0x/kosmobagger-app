import fs from "fs";
// ---- Fake DOM ----
const realST = setTimeout;
function node(){
  const n={ style:{setProperty(){},removeProperty(){}}, dataset:{}, className:"", _h:{}, children:[],
    getBoundingClientRect(){return {left:0,top:0,width:0,height:0,right:0,bottom:0};}, offsetWidth:0,
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(t,f){this._h[t]=f;},
    appendChild(c){this.children.push(c);return c;},
    closest(){return node();}, querySelector(){return node();}, querySelectorAll(){return [];},
    setAttribute(){},getAttribute(){return null;}, focus(){},remove(){},
    set innerHTML(v){this._html=v;}, get innerHTML(){return this._html||"";},
    set textContent(v){this._txt=v;}, get textContent(){return this._txt||"";},
    set onclick(f){this._h.click=f;}, get onclick(){return this._h.click;} };
  return n;
}
const reg={};
global.document={ querySelector:s=>reg[s]||(reg[s]=node()), querySelectorAll:()=>[], createElement:()=>node(), addEventListener(){}, body:node() };
global.window={addEventListener(){}}; global.innerWidth=1280; global.innerHeight=800;
global.setTimeout=(fn)=>{ Promise.resolve().then(fn); return 0; };

let errors=[];
process.on("unhandledRejection", e=>errors.push("REJECT: "+(e&&e.stack||e)));

// ---- Bundle laden + Testhaken ----
let html=fs.readFileSync("KOSMOBAGGER.html","utf8");
let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js += `
globalThis.__startAI=function(){ cfg.mode='ai'; game=new Game({modules:2,target:5,deckDoubled:true,boosters:4,tows:2,names:['A','B'],ai:[true,true],aiLevel:0.9}); persp=0; advance(); };
globalThis.__startHuman=function(){ cfg.mode='ai'; game=new Game({modules:2,target:5,deckDoubled:true,boosters:4,tows:2,names:['Du','C'],ai:[false,true],aiLevel:0.9}); persp=0; advance(); };
globalThis.__game=()=>game;
`;
try { new Function(js)(); } catch(e){ console.log("LOAD-FEHLER:", e.stack); process.exit(1); }

const wait = n => new Promise(r=>realST(r,n));
(async()=>{
  // 1) Voller KI-vs-KI-Durchlauf durch die UI-Pipeline
  try { globalThis.__startAI(); } catch(e){ errors.push("startAI: "+e.stack); }
  for(let i=0;i<20000 && globalThis.__game().phase!=="gameover";i++) await Promise.resolve();
  const g=globalThis.__game();
  console.log("KI-vs-KI UI-Durchlauf:", g.phase, "Runden", g.round, "Kristalle", g.players.map(p=>p.crystals).join(":"));

  // 2) Menschlicher Pfad: Einkommen waehlen + eine Aktion committen
  try {
    globalThis.__startHuman();
    await Promise.resolve();
    if(reg["#inFuel"] && reg["#inFuel"].onclick){ reg["#inFuel"].onclick(); }   // Einkommen ⛽
    await Promise.resolve();
    const bar=reg["#actionbar"];
    const sparen=(bar.children||[]).find(b=>/Sparen/.test((b._txt||"")));
    if(sparen && sparen._h.click){ sparen._h.click(); }                         // committen
    for(let i=0;i<2000 && globalThis.__game().phase!=="gameover";i++) await Promise.resolve();
    console.log("Mensch-Pfad: Runde", globalThis.__game().round, "phase", globalThis.__game().phase, "ok");
  } catch(e){ errors.push("Mensch-Pfad: "+e.stack); }

  await wait(50);
  if(errors.length){ console.log("FEHLER:\n"+errors.slice(0,5).join("\n\n")); process.exit(2); }
  console.log("Keine Laufzeitfehler in der UI-Pipeline.");
})();
