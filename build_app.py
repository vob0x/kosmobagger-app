#!/usr/bin/env python3
"""Buendelt cards.js + engine.js + app.js + style.css + index.html zu EINER
selbst-enthaltenen KOSMOBAGGER.html (laeuft per Doppelklick, ohne Server).
Die ES-Module-Schluesselwoerter (import/export) werden entfernt, damit alles als
ein klassisches <script> laeuft (file:// erlaubt keine Modul-Imports)."""
import re
from pathlib import Path

HIER = Path(__file__).resolve().parent

def strip_module(js):
    out = []
    for line in js.splitlines():
        if re.match(r"\s*import\s.+from\s+[\"'].+[\"'];?\s*$", line):
            continue                                   # import-Zeile weg
        line = re.sub(r"^\s*export\s+(const|class|function|let|var)\s", r"\1 ", line)
        out.append(line)
    return "\n".join(out)

cards = strip_module((HIER / "cards.js").read_text(encoding="utf-8"))
engine = strip_module((HIER / "engine.js").read_text(encoding="utf-8"))
app = strip_module((HIER / "app.js").read_text(encoding="utf-8"))
css = (HIER / "style.css").read_text(encoding="utf-8")
html = (HIER / "index.html").read_text(encoding="utf-8")

bundle = "\n\n".join(["// ==== cards ====", cards, "// ==== engine ====", engine, "// ==== app ====", app])

html = html.replace('<link rel="stylesheet" href="style.css" />', f"<style>\n{css}\n</style>")
html = html.replace('<script type="module" src="app.js"></script>', f"<script>\n{bundle}\n</script>")

(HIER / "KOSMOBAGGER.html").write_text(html, encoding="utf-8")
print("KOSMOBAGGER.html gebaut:", len((HIER / "KOSMOBAGGER.html").read_text(encoding='utf-8')), "Zeichen")
