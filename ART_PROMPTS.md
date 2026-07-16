# KOSMOBAGGER App — custom Grafik-Prompts

Zwei optionale Grafiken heben das UI. Die App zieht sie **automatisch**, sobald die Dateien
im Ordner `assets/` liegen — nichts weiter zu tun. Fehlen sie, bleibt der animierte
Sternenfeld-Hintergrund (funktioniert also auch ohne).

Erzeuge sie **im selben Stil wie deine Karten** (häng den bestehenden **Stil-Anker** an).
Wichtig: **ruhig und dunkel**, damit Karten, HUD und Text darüber lesbar bleiben.

---

## 1) Arena-Hintergrund → `assets/arena.png`

Liegt großflächig hinter dem Spielbrett (wird von der App abgedunkelt und leicht entsättigt).

**Format:** Querformat, ~16:9. **Speichern als** `07_App/assets/arena.png`.

```
A wide cinematic battle-arena background for a children's machine card game, landscape 16:9.
A cosmic construction arena: a dark deep-blue-and-purple starry space above, a subtle
industrial platform / launch-pad floor below with faint glowing energy lines and a soft
central glow where two machines would clash. Distant nebula and a couple of soft planets.
VERY calm and low-contrast in the CENTRE (that area sits behind the cards and must stay
readable) — all detail and brightness only near the edges. No characters, no vehicles, no
text, no logos, no UI, no frames. Muted, atmospheric, cute-but-epic children's cartoon
style with thick soft shapes. Dark overall.
```

## 2) Menü-Hero → `assets/hero.png`

Ein kurzer Banner oben im Startmenü (Titelbereich). Wird unten weich ausgeblendet.

**Format:** Querformat, breit & flach (~3:1). **Speichern als** `07_App/assets/hero.png`.

```
A short wide banner illustration for a children's machine card game menu, aspect about 3:1.
Two cute cartoon machines facing off head-to-head in the centre — on the left a friendly
yellow excavator, on the right a friendly blue space-rover — with a small cluster of
glowing blue energy crystals sparkling between them. Deep space-and-construction background,
dark blue-purple, soft glow. Thick clean outlines, big friendly eyes, colourful, epic but
cute. Leave the LOWER third darker and calmer (text is placed over it). No text, no letters,
no logo, no UI.
```

---

## Logo (optional)

Aktuell nutzt das Menü automatisch das App-Icon (der Galaxie-Riese im Sternenfeld) als
Logo-Emblem über dem Schriftzug. Willst du ein eigenes Wort-Bild-Logo, erzeuge es
transparent (PNG) und speichere es als `assets/logo.png` — sag mir dann Bescheid, dann
hänge ich es statt des Icon-Emblems ein.

> Nach dem Ablegen der Dateien: Seite neu laden. Auf der installierten PWA zusätzlich die
> `CACHE`-Version in `sw.js` hochzählen und `assets/arena.png` / `assets/hero.png` in die
> `ASSETS`-Liste im `sw.js` aufnehmen (oder `make_sw`-Schritt erneut laufen lassen), damit
> sie offline mitgecacht werden.
```
