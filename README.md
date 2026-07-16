# KOSMOBAGGER — lokale Version (Web)

Eine lokal spielbare Fassung von KOSMOBAGGER im Stil digitaler Kartenspiele
(Magic-Arena-artig), gegen den Computer **oder** zu zweit am selben Mac (Hotseat).

## Starten (kein Installieren nötig)

**Einfachster Weg:** Doppelklick auf **`KOSMOBAGGER.html`** — öffnet im Standardbrowser.

Alternativ Doppelklick auf **`start.command`** (öffnet dasselbe). Falls macOS beim
`.command` „nicht geöffnet, weil Entwickler nicht verifiziert" meldet: Rechtsklick →
_Öffnen_ → _Öffnen_ (nur beim ersten Mal).

Es läuft komplett offline im Browser. Kein Server, kein Konto, keine Internetverbindung.

## Was drin ist

- **Gegen Computer** (drei Stärken) oder **2 Spieler Hotseat** (mit Weitergabe-Schutz,
  damit niemand den verdeckten Zug des anderen sieht).
- **Modul 1** (nur Treibstoff) oder **Modul 2** (+ Batterien: Turbo-Schub +2, Reparieren).
- **Booster** (+1 Kanister/Batterie) und der **modale Abschlepper** (Gegnermaschine in die
  Garage schicken **oder** +1 Nachschub).
- Ziel **3** (kurz) oder **5** (normal) Kristalle.
- Deine echten Kartenbilder aus `05_Pipeline/out/` (liegen als Kopie in `cards/`).

## So spielt es sich

1. **Einkommen** (Modul 2): pro Runde ⛽ Kanister **oder** 🔋 Batterie wählen.
2. **Bauen** — verdeckt: eine Maschine (kostet Treibstoff), oder Booster/Abschlepper
   spielen, oder sparen. Steht schon deine Maschine, kämpft sie weiter.
3. **Aufdecken & Kampf** — grössere Zahl gewinnt und **bleibt stehen**, die kleinere geht
   in die Garage. Kommt deine Maschine unangefochten durch, nimmst du **1 Kristall**.
4. Wer zuerst die Zielzahl Kristalle hat, gewinnt.

## Für Entwickler (optional)

- Quelle: `cards.js` (Kartendaten), `engine.js` (Regeln), `app.js` (UI), `style.css`,
  `index.html`. Die spielbare Einzeldatei wird daraus gebaut:
  ```
  python3 build_app.py      # erzeugt KOSMOBAGGER.html (alles inline)
  ```
- Tests (Node):
  ```
  node test_engine.mjs      # Balance/Terminierung/Skill der Regel-Engine
  node test_ui.mjs          # UI-Pipeline headless (voller Durchlauf, keine Laufzeitfehler)
  ```
- Die KI stammt aus der Spar-/Konter-Strategie der Playtest-Simulationen (`06_Playtest/`).

## Status

Regel-Engine und UI-Ablauf sind headless geprüft (faire Spiegel-Werte, Partien
terminieren, Können schlägt Zufall, keine Laufzeitfehler über ganze Partien inkl.
Mensch-Zügen). Feinschliff an Optik/Animationen kommt am besten aus dem echten Spielen —
Rückmeldungen willkommen.
