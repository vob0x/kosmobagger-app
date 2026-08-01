// Headless-Test der Erfolgs-Logik (Ach.record): Freischalt-Bedingungen, keine Doppelvergabe, Serie, Persistenz.
import fs from "fs";
function node(){
  const n={ style:{setProperty(){},removeProperty(){}}, dataset:{}, className:"", _h:{}, children:[],
    getBoundingClientRect(){return {left:0,top:0,width:0,height:0,right:0,bottom:0};}, offsetWidth:0,
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(t,f){this._h[t]=f;},
    appendChild(c){this.children.push(c);return c;}, insertBefore(c){this.children.unshift(c);return c;}, insertAdjacentHTML(){},
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
const store=new Map();
global.localStorage={ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) };

let html=fs.readFileSync("KOSMOBAGGER.html","utf8");
let js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
js += `\nglobalThis.__ach=Ach;\nglobalThis.__achSVG=achSVG;\n`;
try { new Function(js)(); } catch(e){ console.log("LOAD-FEHLER:", e.stack); process.exit(1); }
const Ach=globalThis.__ach, achSVG=globalThis.__achSVG;

let fails=0;
const assert=(c,m)=>{ if(!c){ console.log("  FAIL:",m); fails++; } else console.log("  ok:",m); };

let f=Ach.record({won:true, round:6, target:5, oppC:0, level:0.97, modules:3}).map(a=>a.id);
assert(f.includes("first"),"first");
assert(f.includes("shutout"),"shutout (Gegner 0 Kristalle)");
assert(f.includes("fast"),"fast (Runde 6 <= 5+3)");
assert(f.includes("boss"),"boss (Stark 0.97)");
assert(f.includes("worlds"),"worlds (Modul 3)");
f=Ach.record({won:true, round:12, target:5, oppC:2, level:0.6, modules:2}).map(a=>a.id);
assert(!f.includes("first"),"first nicht doppelt");
f=Ach.record({won:true, round:12, target:5, oppC:2, level:0.6, modules:2}).map(a=>a.id);
assert(f.includes("streak3"),"streak3 nach 3 Siegen in Folge");
Ach.record({won:false, round:10, target:5, oppC:5, level:0.6, modules:2});
assert(Ach.state().streak===0,"Serie zurückgesetzt nach Niederlage");
f=Ach.record({won:true, round:14, target:5, oppC:4, level:0.6, modules:2}).map(a=>a.id);
assert(f.includes("comeback"),"comeback (Gegner 4/5)");
f=Ach.record({won:true, round:20, target:5, oppC:1, level:0.6, modules:2}).map(a=>a.id);
assert(!f.includes("fast")&&!f.includes("boss")&&!f.includes("worlds"),"keine Fehlvergabe (langsam/leicht/Modul2)");
while(Ach.state().games<10) Ach.record({won:false, round:8, target:5, oppC:5, level:0.6, modules:2});
assert(!!Ach.state().unlocked.veteran,"veteran nach 10 Partien");
assert(!!store.get("kb_ach") && JSON.parse(store.get("kb_ach")).unlocked.first,"in localStorage persistiert");
// Sticker-Grafik: SVG statt Emoji, freigeschaltet vs gesperrt unterscheidbar
const svgOn=achSVG("first",true), svgOff=achSVG("first",false);
assert(/<svg/.test(svgOn) && /achmedal/.test(svgOn),"achSVG liefert SVG-Medaille");
assert(/a8 8 0/.test(svgOff),"gesperrte Medaille zeigt Schloss");
assert(svgOn!==svgOff,"freigeschaltet != gesperrt");

console.log(fails? `\nErfolge-Logik: ${fails} FEHLER` : "\nErfolge-Logik + Sticker-SVG: alle Checks durch.");
process.exit(fails?2:0);
