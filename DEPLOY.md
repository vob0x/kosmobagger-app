# KOSMOBAGGER als PWA auf GitHub Pages veröffentlichen

Dieser Ordner ist eine **installierbare, offline-fähige PWA**. Auf GitHub Pages läuft sie
über HTTPS und lässt sich auf iPhone/iPad/Android/Mac/Windows „als App" hinzufügen.

## Einmalig veröffentlichen

1. Auf **github.com** ein **neues, leeres Repository** anlegen (z. B. `kosmobagger`) —
   ohne README/Lizenz/.gitignore.
2. In diesem Ordner (`07_App`) im Terminal (das Repo ist schon initialisiert & committet):
   ```
   git remote add origin https://github.com/<DEIN-NAME>/kosmobagger.git
   git branch -M main
   git push -u origin main
   ```
3. Im Repo: **Settings → Pages → Source: „Deploy from a branch" → Branch `main` / `/(root)`
   → Save.**
4. Nach ~1 Minute live unter **https://<DEIN-NAME>.github.io/kosmobagger/**

## Installieren
- **iPhone/iPad (Safari):** Teilen → „Zum Home-Bildschirm".
- **Android (Chrome):** Menü → „App installieren".
- **Mac/Windows (Chrome/Edge):** Installations-Symbol in der Adressleiste.

Danach läuft alles **offline** (Service-Worker cached App + alle 28 Karten + Icons).

## Aktualisieren
Dateien ändern → committen → pushen. Und in **`sw.js`** die `CACHE`-Version hochzählen
(`kosmobagger-v1` → `-v2`), damit installierte Geräte die neue Fassung laden.

## Gut zu wissen
- **Einstieg ist `index.html`** (modulare Fassung, lädt `app.js`/`engine.js`/`cards.js`).
  Für den reinen Doppelklick ohne Server gibt es weiterhin `KOSMOBAGGER.html` (gebündelt).
- Alle Pfade sind **relativ** — die App funktioniert an jedem Pages-Unterpfad.
- Dev-Werkzeuge im Ordner (`build_app.py`, `make_pwa_icons.py`, `test_*.mjs`) stören das
  Hosting nicht; sie werden einfach mit ausgeliefert (oder du löschst sie vor dem Push).
