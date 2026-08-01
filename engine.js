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
  TRUCKS:  { selfKraft: 1,                       label: "Vollgas",       text: "Dein Truck kämpft mit +1 Kraft, solange er steht." },
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
    const level = p._level ?? this.opts.aiLevel ?? 0.85;   // _level: optionale Per-Spieler-Staerke (Simulation)
    const banks = level >= 0.93;                       // NUR Stark spart gezielt auf grosse Maschinen (Mittel = Greedy)
    const hasBig = p.hand.some(c => c.kraft >= 5);
    // BANKING: Treibstoff sammeln, solange eine grosse Maschine (5-6) wartet, das eigene Brett frei ist
    // und der Tank noch nicht voll ist -> ermoeglicht das Deployen einer dominanten stehenden Maschine.
    if (banks && hasBig && !p.slot && p.fuel < TANK_MAX) return "fuel";
    // Sonst: Batterie holen, wenn Tank schon ordentlich gefuellt und Platz ist (z.B. waehrend die Maschine steht).
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

  needsIncome(i) { const p = this.players[i]; return this.opts.modules >= 2 && !p.income && !(p.fuel >= TANK_MAX && p.bat >= BAT_MAX); }
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
    const ea = this._kraft(a);
    const eb = this._kraft(b);
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
    else if ((this.round || 0) >= (this.opts.hardCap ?? 80)) {
      // Sicherheitsventil: extrem seltene Dauer-Pattsituation (perfekter KI-Spiegel, niemand steht je allein) ->
      // nach Kristallen entscheiden statt endlos weiterlaufen. Normale Spiele enden ~10-25 Runden, greift also nie.
      this.winner = this.players[0].crystals >= this.players[1].crystals ? 0 : 1;
      this.phase = "gameover"; ev.push({ t: "win", i: this.winner });
    } else this.beginRound();

    this.lastEvents = ev;
    return ev;
  }

  gain(p, kind) {
    if (kind === "bat") { if (p.bat < BAT_MAX) p.bat++; else if (p.fuel < TANK_MAX) p.fuel++; }
    else { if (p.fuel < TANK_MAX) p.fuel++; else if (p.bat < BAT_MAX) p.bat++; }
  }

  // Weltkraft-Kampfbonus einer Welt (selfKraft), rundengated. 0 wenn inaktiv. Fuer KI-Bewertung.
  _wbuff(world) {
    if (!this.opts.worldPowers || (this.round || 0) < (this.opts.powerStartRound ?? 2)) return 0;
    const pw = this.powers[world];
    return pw && pw.selfKraft ? pw.selfKraft : 0;
  }

  // Effektive Kampfkraft: Basiskraft + Turbo(+2) + optionaler Weltkraft-Bonus (selfKraft, rundengated).
  _kraft(p) {
    if (!p.slot) return null;
    let k = p.slot.kraft + (p.slotTurbo ? 2 : 0);
    if (this.opts.worldPowers && (this.round || 0) >= (this.opts.powerStartRound ?? 2)) {
      const pw = this.powers[p.slot.world];
      if (pw && pw.selfKraft) k += pw.selfKraft;                    // z. B. Vollgas (TRUCKS): +1 im Kampf, solange der Truck steht
    }
    return k;
  }

  // Weltkraft ausloesen, wenn Welt w den Ausloeser trigger nutzt.
  _power(pl, w, trigger, ev) {
    if ((this.round || 0) < (this.opts.powerStartRound ?? 2)) return;   // Weltkraefte erst ab Runde 2 (Fairness: kein Runde-1-Snowball)
    const pw = this.powers[w];
    if (!pw || pw.on !== trigger) return;
    const o = this.opp(pl.idx);
    let acted = false;
    if (pw.gain) { for (let k = 0; k < (pw.amt || 1); k++) this.gain(pl, pw.gain); acted = true; }
    if (pw.foeFuel) { o.fuel = Math.max(0, o.fuel - pw.foeFuel); acted = true; }   // Gegner bremsen (Kanister)
    if (pw.foeBat) { o.bat = Math.max(0, o.bat - pw.foeBat); acted = true; }        // Gegner bremsen (Batterie)
    if (pw.clearFoe) { if (o.slot) { o.garage.push(o.slot); o.slot = null; o.slotTurbo = false; acted = true; } }  // Spur leeren
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

  // --- KI: waehlt eine Aktion. DREI qualitativ unterschiedliche Spielstaerken ---
  //   Leicht  : verheizt kleine Maschinen, macht oft Fehlzuege, vergeudet Batterien, spart nie.
  //   Mittel  : solide Greedy (billigste ausreichende Maschine, mass Batterie-Einsatz), gelegentliche Fehler.
  //   Stark   : SPART Treibstoff fuer dominante 5-6er, haelt/verteidigt die stehende Maschine mit Batterie,
  //             raeumt gegnerische Waende per Abschlepper ab, verhindert gegnerische Punkte, Mirror-Turbo.
  aiChoose(p) {
    const i = p.idx, o = this.opp(i);
    const acts = this.legalActions(i);
    if (acts.length === 1) return acts[0];                 // z.B. slot besetzt -> none (Maschine bleibt zwangslaeufig stehen)
    const affordable = p.hand.filter(c => c.kraft && c.cost <= p.fuel);
    const level = p._level ?? this.opts.aiLevel ?? 0.85;   // _level: optionale Per-Spieler-Staerke (Simulation)
    const STARK  = level >= 0.93;
    const MITTEL = !STARK && level >= 0.75;
    const LEICHT = !STARK && !MITTEL;
    const blunder = LEICHT ? 0.42 : (MITTEL ? 0.15 : 0.02);
    const behind = p.crystals <= o.crystals;
    const gk = o.slot ? o.slot.kraft + this._wbuff(o.slot.world) : null;  // stehende Gegnermaschine inkl. Weltkraft-Bonus (Turbo ist nach dem Kampf verbraucht)
    const eff = c => c.kraft + this._wbuff(c.world);        // effektive Kampfkraft der eigenen Baukarte (mit Weltkraft-Bonus)
    const bigInHand = p.hand.filter(c => c.kraft >= 5);
    const build = (c, turbo) => ({ type: "build", uid: c.uid, turbo: !!(turbo && p.bat > 0) });
    const biggest = arr => arr.slice().sort((x, y) => y.kraft - x.kraft || x.cost - y.cost)[0];
    const towAct = acts.find(a => a.type === "tow" && a.mode === "tow");
    const boostAct = acts.find(a => a.type === "booster");
    const plusAct = acts.find(a => a.type === "tow" && a.mode === "plus");

    // --- FEHLZUG (schwaches Spiel): mit Wahrscheinlichkeit "blunder" eine schwache Aktion ---
    if (Math.random() < blunder) {
      const cards = acts.filter(a => a.type === "build").map(a => this.handCard(p, a.uid)).filter(Boolean);
      if (cards.length) {
        const pick = LEICHT ? cards.slice().sort((x, y) => x.kraft - y.kraft)[0]      // Leicht: kleinste (verschwendet)
                            : cards[Math.floor(Math.random() * cards.length)];        // Mittel: irgendeine
        return build(pick, LEICHT ? false : (p.bat > 0 && Math.random() < 0.3));       // Mittel vergeudet manchmal Batterie
      }
    }

    // --- Gegner steht: erobern / abschleppen / gleichziehen (gegnerischen Punkt verhindern!) ---
    if (gk !== null) {
      const beat = affordable.filter(c => eff(c) > gk).sort((x, y) => x.cost - y.cost || x.kraft - y.kraft)[0];
      if (beat) return build(beat, false);                                             // billigste ausreichende Maschine
      if (p.bat > 0) {                                                                  // Wand mit Batterie brechen
        const tb = affordable.filter(c => eff(c) + 2 > gk).sort((x, y) => x.cost - y.cost || y.kraft - x.kraft)[0];
        const useBat = STARK || (MITTEL && (behind || gk >= 5));
        if (tb && useBat) return build(tb, true);
      }
      if (towAct && (STARK || MITTEL || gk >= 4)) return towAct;                        // Abschlepper raeumt die Wand ab
      const tie = affordable.filter(c => eff(c) === gk).sort((x, y) => x.cost - y.cost)[0];
      if (tie) return build(tie, false);                                               // gleichziehen -> beide in Garage, verhindert Score
      // wirklich nicht kontaktierbar -> unten Ressourcen sammeln (Gegner punktet leider)
    } else {
      // --- Gegner steht NICHT: eigene Maschine aufs Brett bringen ---
      const bigAff = affordable.filter(c => c.kraft >= 5);
      if (bigAff.length) {
        const c = biggest(bigAff);
        // Stark: droht ein Spiegel-6 (Gegner hat vollen Tank)? Turbo, um den Gleichstand zu gewinnen und stehen zu bleiben.
        const mirror = STARK && p.bat > 0 && o.fuel >= 3 && c.kraft >= 6;
        return build(c, mirror);
      }
      // Keine grosse bezahlbar, aber eine im Blatt + fast genug Treibstoff -> BANKEN statt eine kleine zu verheizen (NUR Stark).
      if (STARK && bigInHand.length && p.fuel >= 2) {
        if (boostAct) return boostAct;                                                  // Booster: Ressource sammeln waehrend des Sparens
        if (STARK && plusAct) return plusAct;
        return { type: "pass" };
      }
      // Sonst: groesste bezahlbare bauen (etwas aufs Brett bringen, um zu punkten).
      if (affordable.length) {
        const c = biggest(affordable);
        const turbo = (STARK || MITTEL) && p.bat > 0 && behind && c.kraft >= 4 && this.opts.modules >= 2;
        return build(c, turbo);
      }
    }

    // --- Nichts Sinnvolles baubar: Reparieren > Booster > Abschlepper-Plus > Pass ---
    if (acts.some(a => a.type === "repair")) {
      const best = p.garage.filter(c => c.kraft).sort((x, y) => y.kraft - x.kraft)[0];
      return best ? { type: "repair", uid: best.uid } : { type: "repair" };
    }
    if (boostAct) return boostAct;
    if (plusAct) return plusAct;
    return { type: "pass" };
  }
}
