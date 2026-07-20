// KOSMOBAGGER - Spiel-Engine (volle Regeln). Framework-frei, laeuft im Browser und in Node.
// Rundenstruktur: Einkommen -> gleichzeitig verdeckt bauen -> aufdecken/Kampf -> nachziehen.
import { MACHINES, SPECIALS } from "./cards.js";

export const TANK_MAX = 3;
export const BAT_MAX = 2;

// Modul WELTKRAEFTE (Disruption). Jede Welt "bremst" den Gegner zu einem anderen Zeitpunkt.
//   on: Ausloeser ("build" | "win" | "score" Durchbruch | "stand" Maschine steht am Rundenende)
//   foeFuel/foeBat: Gegner verliert Kanister/Batterie.  (balanciert per Simulation, Spannweite 14, keine Stalls)
export const WORLD_POWERS = {
  KOSMOS:  { on: "score", foeFuel: 1,           label: "Störfeld",      text: "Kommt deine Kosmos-Maschine durch, verliert der Gegner 1 Kanister." },
  BAU:     { on: "build", foeFuel: 1,           label: "Erschütterung", text: "Baust du eine Bau-Maschine, verliert der Gegner 1 Kanister." },
  TRUCKS:  { on: "stand", foeFuel: 1,           label: "Blockade",      text: "Solange dein Truck steht, verliert der Gegner jede Runde 1 Kanister." },
  TECHNIK: { on: "win",   foeFuel: 2, foeBat: 1, label: "Entladung",    text: "Gewinnt deine Technik-Maschine, verliert der Gegner 2 Kanister und 1 Batterie." },
};

export function cost(kraft) { return kraft <= 2 ? 1 : (kraft <= 4 ? 2 : 3); }

function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let _uid = 1;
function inst(def) { return { ...def, uid: _uid++ }; }

// Baut eine Deckliste (Karten-Instanzen) nach Optionen.
// worlds: optionale Liste gewaehlter Welten (Modul Weltkraefte) -> nur diese Maschinen ins Deck.
function buildDeck(opts, worlds) {
  const cards = [];
  const copies = opts.deckDoubled ? 2 : 1;
  const useW = opts.worldPowers && Array.isArray(worlds) && worlds.length;
  const pool = useW ? MACHINES.filter(m => worlds.includes(m.world)) : MACHINES;
  for (let c = 0; c < copies; c++) for (const m of pool) cards.push(inst(m));
  if (opts.modules >= 2 || opts.boosters) {
    const bf = SPECIALS.find(s => s.id === "BOOSTER_FUEL");
    const bb = SPECIALS.find(s => s.id === "BOOSTER_BAT");
    for (let i = 0; i < (opts.boosters ?? 0); i++) cards.push(inst(i % 2 === 0 ? bf : bb));
  }
  const tow = SPECIALS.find(s => s.id === "ABSCHLEPPER");
  for (let i = 0; i < (opts.tows ?? 0); i++) cards.push(inst(tow));
  return cards;
}

function newPlayer(idx, name, isAI, opts, rng, worlds) {
  const deck = shuffle(buildDeck(opts, worlds), rng);
  const hand = [];
  for (let i = 0; i < 3 && deck.length; i++) hand.push(deck.pop());
  return {
    idx, name, isAI,
    deck, hand, garage: [],
    fuel: 0, bat: 0, crystals: 0,
    slot: null, slotTurbo: false,
    income: null,       // gewaehlte Einkommensart diese Runde
    pending: null,      // committed Aktion
  };
}

export class Game {
  constructor(opts = {}) {
    this.opts = Object.assign({
      modules: 2, target: 5, deckDoubled: true, boosters: 4, tows: 2,
      names: ["Spieler", "Computer"], ai: [false, true], aiLevel: 0.85,
    }, opts);
    // Weltkraefte: opts.powers ersetzt die Tabelle vollstaendig (fuer Simulation); sonst Standard.
    this.powers = this.opts.powers || WORLD_POWERS;
    const rng = Math.random;
    const W = this.opts.worlds || [];   // pro Spieler 2 gewaehlte Welten (Modul Weltkraefte)
    this.players = [
      newPlayer(0, this.opts.names[0], this.opts.ai[0], this.opts, rng, W[0]),
      newPlayer(1, this.opts.names[1], this.opts.ai[1], this.opts, rng, W[1]),
    ];
    this.round = 0;
    this.phase = "income";     // income | commit | resolve | gameover
    this.winner = null;
    this.log = [];
    this.lastEvents = [];
    this.beginRound();
  }

  opp(i) { return this.players[1 - i]; }

  beginRound() {
    this.round++;
    for (const p of this.players) { p.income = null; p.pending = null; }
    this.phase = "act";
    for (const p of this.players) {
      if (this.opts.modules < 2) this.setIncome(p.idx, "fuel");      // Modul 1: immer Kanister
      if (p.isAI) {
        if (!p.income) this.setIncome(p.idx, this.aiIncome(p));
        p.pending = this.aiChoose(p);
      }
    }
  }

  aiIncome(p) {
    // Batterie holen, wenn Tank schon ordentlich gefuellt und Batteriefach Platz hat.
    if (this.opts.modules >= 2 && p.bat < BAT_MAX && p.fuel >= 2) return "bat";
    if (p.fuel < TANK_MAX) return "fuel";
    if (p.bat < BAT_MAX) return "bat";
    return "fuel";
  }

  setIncome(i, kind) {
    const p = this.players[i];
    if (p.income) return;
    p.income = kind;
    if (kind === "bat" && p.bat < BAT_MAX) p.bat++;
    else if (p.fuel < TANK_MAX) p.fuel++;
    else if (p.bat < BAT_MAX) p.bat++;       // Tank voll -> Batterie als Ausweich
  }

  needsIncome(i) { return this.opts.modules >= 2 && !this.players[i].income; }
  needsCommit(i) { return !this.players[i].pending; }
  ready() { return this.players.every(p => p.income && p.pending); }

  // --- Legale Aktionen fuer Spieler i in der Commit-Phase ---
  legalActions(i) {
    const p = this.players[i];
    const acts = [];
    if (p.slot) { acts.push({ type: "none", label: "Maschine kaempft weiter" }); return acts; }
    // Maschinen bauen (bezahlbar)
    for (const c of p.hand) {
      if (c.kraft && c.cost <= p.fuel) {
        acts.push({ type: "build", uid: c.uid, turbo: false });
        if (this.opts.modules >= 2 && p.bat > 0)
          acts.push({ type: "build", uid: c.uid, turbo: true });
      }
    }
    // Booster
    for (const c of p.hand) if (c.kind === "booster")
      acts.push({ type: "booster", uid: c.uid });
    // Abschlepper (modal)
    for (const c of p.hand) if (c.kind === "tow") {
      if (this.opp(i).slot) acts.push({ type: "tow", uid: c.uid, mode: "tow" });
      acts.push({ type: "tow", uid: c.uid, mode: "plus", plusType: "fuel" });
      if (this.opts.modules >= 2) acts.push({ type: "tow", uid: c.uid, mode: "plus", plusType: "bat" });
    }
    // Reparieren (2 Batterien -> Maschine aus Garage auf die Hand)
    if (this.opts.modules >= 2 && p.bat >= 2 && p.garage.some(c => c.kraft))
      acts.push({ type: "repair" });
    acts.push({ type: "pass", label: "Sparen (nichts bauen)" });
    return acts;
  }

  commit(i, action) {
    const p = this.players[i];
    if (this.phase !== "act" || p.pending) return false;
    p.pending = action;
    return true;
  }

  bothCommitted() { return this.players.every(p => p.pending); }

  handCard(p, uid) { return p.hand.find(c => c.uid === uid); }

  // --- Runde aufloesen: Aktionen anwenden + Kampf + nachziehen. Gibt Events zurueck. ---
  resolve() {
    const ev = [];
    const pre = this.players.map(p => p.slot);   // stehende Maschinen VOR den Bauten

    // 1) Bauten/Booster/Repair/Plus zuerst
    this.players.forEach((p, i) => {
      const a = p.pending || { type: "pass" };
      if (a.type === "build") {
        const c = this.handCard(p, a.uid);
        p.hand = p.hand.filter(x => x.uid !== c.uid);
        p.fuel -= c.cost;
        p.slot = c; p.slotTurbo = false;
        if (a.turbo && p.bat > 0) { p.bat--; p.slotTurbo = true; }
        ev.push({ t: "build", i, card: c, turbo: p.slotTurbo });
        if (this.opts.worldPowers) this._power(p, c.world, "build", ev);
      } else if (a.type === "booster") {
        const c = this.handCard(p, a.uid);
        p.hand = p.hand.filter(x => x.uid !== c.uid); p.garage.push(c);
        this.gain(p, c.gives === "bat" ? "bat" : "fuel");
        ev.push({ t: "booster", i, gives: c.gives });
      } else if (a.type === "tow") {
        const c = this.handCard(p, a.uid);
        p.hand = p.hand.filter(x => x.uid !== c.uid); p.garage.push(c);
        if (a.mode === "plus") { this.gain(p, a.plusType || "fuel"); ev.push({ t: "towplus", i, gives: a.plusType }); }
        else ev.push({ t: "towpick", i });   // eigentliche Wirkung unten (auf pre-Slot)
      } else if (a.type === "repair") {
        if (p.bat >= 2) {
          // a.uid: gewaehlte Maschine aus der Garage. Ohne uid: erste Maschine (Fallback).
          let idx = -1;
          if (a.uid != null) idx = p.garage.findIndex(c => c.uid === a.uid && c.kraft);
          if (idx < 0) idx = p.garage.findIndex(c => c.kraft);
          if (idx >= 0) { p.bat -= 2; const c = p.garage.splice(idx, 1)[0]; p.hand.push(c); ev.push({ t: "repair", i, card: c }); }
        }
      } else {
        ev.push({ t: "pass", i });
      }
    });

    // 2) Abschleppen wirkt auf die VOR der Runde stehende Gegnermaschine
    this.players.forEach((p, i) => {
      if ((p.pending || {}).type === "tow" && p.pending.mode === "tow") {
        const o = this.opp(i);
        if (pre[o.idx]) {              // nur eine wirklich stehende Maschine
          const towed = pre[o.idx];
          o.garage.push(towed); o.slot = null; o.slotTurbo = false;
          ev.push({ t: "towed", i, victim: o.idx, card: towed });
        }
      }
    });

    // 3) Kampf
    const a = this.players[0], b = this.players[1];
    const ea = a.slot ? a.slot.kraft + (a.slotTurbo ? 2 : 0) : null;
    const eb = b.slot ? b.slot.kraft + (b.slotTurbo ? 2 : 0) : null;
    const wp = this.opts.worldPowers;
    if (a.slot && b.slot) {
      if (ea > eb) {
        this._onWin(a, ev);
        if (wp && b.slot && this.powers[b.slot.world] && this.powers[b.slot.world].robust && (ea - eb) <= 1) ev.push({ t: "power", i: 1, world: b.slot.world });  // robust: knappe Niederlage ueberlebt
        else if (b.slot) this._defeat(b, ev);
        ev.push({ t: "clash", winner: 0, ea, eb });
      } else if (eb > ea) {
        this._onWin(b, ev);
        if (wp && a.slot && this.powers[a.slot.world] && this.powers[a.slot.world].robust && (eb - ea) <= 1) ev.push({ t: "power", i: 0, world: a.slot.world });
        else if (a.slot) this._defeat(a, ev);
        ev.push({ t: "clash", winner: 1, ea, eb });
      } else {
        // Gleichstand. Weltkraft "Standhaft" (survive): Maschine bleibt stehen statt in die Garage.
        const aB = wp && this.powers[a.slot.world] && this.powers[a.slot.world].survive;
        const bB = wp && this.powers[b.slot.world] && this.powers[b.slot.world].survive;
        let winner = -1;
        if (aB && !bB) { this._defeat(b, ev); winner = 0; ev.push({ t: "power", i: 0, world: a.slot.world }); }
        else if (bB && !aB) { this._defeat(a, ev); winner = 1; ev.push({ t: "power", i: 1, world: b.slot.world }); }
        else if (aB && bB) { ev.push({ t: "power", i: 0, world: a.slot.world }); ev.push({ t: "power", i: 1, world: b.slot.world }); }  // beide bleiben stehen
        else { this._defeat(a, ev); this._defeat(b, ev); }
        ev.push({ t: "clash", winner, ea, eb });
      }
    } else if (a.slot) { a.crystals++; ev.push({ t: "score", i: 0 }); if (this.opts.worldPowers) this._power(a, a.slot.world, "score", ev); }
    else if (b.slot) { b.crystals++; ev.push({ t: "score", i: 1 }); if (this.opts.worldPowers) this._power(b, b.slot.world, "score", ev); }
    else { ev.push({ t: "nothing" }); }
    a.slotTurbo = false; b.slotTurbo = false;   // Turbo-Batterie ist nach dem Kampf verbraucht

    // Weltkraft-Ausloeser "stand": Maschine steht am Rundenende.
    if (this.opts.worldPowers) for (const p of this.players) if (p.slot) this._power(p, p.slot.world, "stand", ev);

    // 4) Nachziehen
    for (const p of this.players) this.drawUp(p);

    // 5) Sieg?
    for (const p of this.players) { p.income = null; p.pending = null; }
    const win = this.players.find(p => p.crystals >= this.opts.target);
    if (win) { this.winner = win.idx; this.phase = "gameover"; ev.push({ t: "win", i: win.idx }); }
    else this.beginRound();

    this.lastEvents = ev;
    return ev;
  }

  gain(p, kind) {
    if (kind === "bat") { if (p.bat < BAT_MAX) p.bat++; else if (p.fuel < TANK_MAX) p.fuel++; }
    else { if (p.fuel < TANK_MAX) p.fuel++; else if (p.bat < BAT_MAX) p.bat++; }
  }

  // Weltkraft ausloesen, wenn Welt w den Ausloeser trigger nutzt.
  _power(pl, w, trigger, ev) {
    const pw = this.powers[w];
    if (!pw || pw.on !== trigger) return;
    let acted = false;
    if (pw.gain) { for (let k = 0; k < (pw.amt || 1); k++) this.gain(pl, pw.gain); acted = true; }
    if (pw.foeFuel) { const o = this.opp(pl.idx); o.fuel = Math.max(0, o.fuel - pw.foeFuel); acted = true; }   // Gegner bremsen (Kanister)
    if (pw.foeBat) { const o = this.opp(pl.idx); o.bat = Math.max(0, o.bat - pw.foeBat); acted = true; }        // Gegner bremsen (Batterie)
    if (pw.clearFoe) { const o = this.opp(pl.idx); if (o.slot) { o.garage.push(o.slot); o.slot = null; o.slotTurbo = false; acted = true; } }  // Spur leeren
    if (acted) ev && ev.push({ t: "power", i: pl.idx, world: w });
  }

  // Maschine verliert einen Kampf (Ausloeser "lose"). toHand: kommt auf die Hand statt in die Garage.
  _defeat(pl, ev) {
    const card = pl.slot;
    pl.slot = null; pl.slotTurbo = false;
    const pw = this.opts.worldPowers && card ? this.powers[card.world] : null;
    if (pw && pw.toHand) pl.hand.push(card); else pl.garage.push(card);
    if (this.opts.worldPowers && card) this._power(pl, card.world, "lose", ev);
  }

  // Maschine gewinnt einen Kampf (Ausloeser "win").
  _onWin(pl, ev) {
    if (this.opts.worldPowers && pl.slot) this._power(pl, pl.slot.world, "win", ev);
  }

  drawUp(p) {
    while (p.hand.length < 3 && (p.deck.length || p.garage.length)) {
      if (!p.deck.length) { p.deck = shuffle(p.garage); p.garage = []; }
      p.hand.push(p.deck.pop());
    }
  }

  // --- KI: waehlt eine Aktion (greedy Spar-/Konter-Strategie) ---
  aiChoose(p) {
    const i = p.idx, o = this.opp(i);
    const acts = this.legalActions(i);
    if (acts.length === 1) return acts[0];                 // z.B. slot besetzt -> none
    const affordable = p.hand.filter(c => c.kraft && c.cost <= p.fuel);
    const level = this.opts.aiLevel ?? 0.85;
    if (Math.random() > level) {                            // Schwaeche: manchmal zufaellig
      const pool = acts.filter(a => a.type === "build");
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    const gk = o.slot ? o.slot.kraft : null;               // stehende Gegnermaschine
    const behind = p.crystals <= o.crystals;

    // Gegen eine stehende Wand, die ich nicht packe: Abschlepper (falls vorhanden)
    if (gk !== null) {
      const canBeat = affordable.some(c => c.kraft > gk || (p.bat > 0 && c.kraft + 2 > gk));
      const canTie = affordable.some(c => c.kraft === gk || (p.bat > 0 && c.kraft + 2 === gk));
      const tow = acts.find(a => a.type === "tow" && a.mode === "tow");
      if (tow && !canBeat && !canTie && gk >= 4) return tow;
      // schlagen (billigste ausreichende), sonst gleichziehen
      const beats = affordable.filter(c => c.kraft > gk);
      const ties = affordable.filter(c => c.kraft === gk);
      if (beats.length) { const c = beats.sort((x, y) => x.cost - y.cost || x.kraft - y.kraft)[0]; return { type: "build", uid: c.uid, turbo: false }; }
      if (p.bat > 0) {
        const turboBeat = affordable.filter(c => c.kraft + 2 > gk && c.kraft <= gk);
        if (turboBeat.length) { const c = turboBeat.sort((x, y) => y.kraft - x.kraft)[0]; return { type: "build", uid: c.uid, turbo: true }; }
      }
      if (ties.length) { const c = ties[0]; return { type: "build", uid: c.uid, turbo: false }; }
    }

    if (affordable.length) {
      // Kein Gegner steht: groesste bezahlbare Maschine bauen (Sparen zahlt sich aus)
      const c = affordable.sort((x, y) => y.kraft - x.kraft)[0];
      const turbo = this.opts.modules >= 2 && p.bat > 0 && behind && c.kraft >= 4;
      return { type: "build", uid: c.uid, turbo };
    }
    // Nichts bezahlbar: Reparieren > Booster > Abschlepper-Plus > Pass
    if (acts.some(a => a.type === "repair")) {
      const best = p.garage.filter(c => c.kraft).sort((x, y) => y.kraft - x.kraft)[0];
      return best ? { type: "repair", uid: best.uid } : { type: "repair" };
    }
    const boost = acts.find(a => a.type === "booster");
    if (boost) return boost;
    const plus = acts.find(a => a.type === "tow" && a.mode === "plus");
    if (plus) return plus;
    return { type: "pass" };
  }
}
