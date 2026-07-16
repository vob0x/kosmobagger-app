#!/bin/bash
# Doppelklick startet einen kleinen lokalen Server und oeffnet das Spiel im Browser.
# Fenster offen lassen, solange du spielst / testest. Beenden: Fenster schliessen oder Ctrl+C.
cd "$(dirname "$0")"
PORT=8765
echo "KOSMOBAGGER laeuft auf  http://localhost:$PORT/KOSMOBAGGER.html"
echo "(Dieses Fenster offen lassen. Zum Beenden schliessen.)"
python3 -m http.server $PORT >/dev/null 2>&1 &
SRV=$!
sleep 1
open "http://localhost:$PORT/KOSMOBAGGER.html"
trap "kill $SRV 2>/dev/null" EXIT
wait $SRV
