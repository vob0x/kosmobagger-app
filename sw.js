// KOSMOBAGGER PWA Service-Worker.
// App-Shell NETWORK-FIRST (online aktuell), Medien CACHE-FIRST (offline). Version bei Release erhoehen.
const CACHE = "kosmobagger-v40";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "engine.js",
  "cards.js",
  "manifest.webmanifest",
  "cards/ABSCHLEPPER.png",
  "cards/BAU-1_Schaufel-Helfer.png",
  "cards/BAU-2_Mini-Bagger.png",
  "cards/BAU-3_Radlader.png",
  "cards/BAU-4_Beton-Mischer.png",
  "cards/BAU-5_Turbo-Bagger.png",
  "cards/BAU-6_Riesen-Kran.png",
  "cards/BOOSTER_BAT.png",
  "cards/BOOSTER_FUEL.png",
  "cards/KOS-1_Sternen-Funke.png",
  "cards/KOS-2_Raketen-Flitzer.png",
  "cards/KOS-3_Mond-Rover.png",
  "cards/KOS-4_Sternen-Kran.png",
  "cards/KOS-5_Planeten-Bohrer.png",
  "cards/KOS-6_Galaxie-Riese.png",
  "cards/RUECKSEITE.png",
  "cards/TEC-1_Schrauben-Bot.png",
  "cards/TEC-2_Helfer-Roboter.png",
  "cards/TEC-3_Bohr-Roboter.png",
  "cards/TEC-4_Blitz-Drohne.png",
  "cards/TEC-5_Mega-Roboter.png",
  "cards/TEC-6_Boss-Roboter.png",
  "cards/TRK-1_Flink-Lieferwagen.png",
  "cards/TRK-2_Flitzer-Truck.png",
  "cards/TRK-3_Tank-Laster.png",
  "cards/TRK-4_Schwerlast-Truck.png",
  "cards/TRK-5_Monster-Truck.png",
  "cards/TRK-6_Riesen-Sattelschlepper.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-64.png",
  "icons/icon-192.png",
  "icons/icon-512-maskable.png",
  "icons/icon-512.png",
  "assets/arena.png",
  "assets/board.png",
  "assets/hero.png",
  "assets/intro.mp4",
  "assets/win.mp4",
  "assets/lose.mp4",
  "assets/erklaervideo.mp4",
  "assets/batterie.png",
  "assets/kanister.png",
  "assets/kristall.png",
  "assets/kurzregeln.png",
  "assets/icons/build.png",
  "assets/icons/turbo.png",
  "assets/icons/save.png",
  "assets/icons/repair.png",
  "assets/icons/tow.png",
  "assets/icons/back.png",
  "assets/icons/replay.png",
  "assets/icons/home.png",
  "assets/icons/sound.png",
  "assets/sfx/clash.wav",
  "assets/sfx/click.wav",
  "assets/sfx/lose.wav",
  "assets/sfx/place.wav",
  "assets/sfx/reveal.wav",
  "assets/sfx/score.wav",
  "assets/sfx/tick.wav",
  "assets/sfx/win.wav"
];
// AUSFALLSICHER: einzelne fehlgeschlagene Assets (z. B. ein grosses Video auf langsamer Leitung)
// duerfen das Update NICHT blockieren. Sonst bleibt die alte Version aktiv -> Videos fehlen.
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map(a => c.add(a)));   // add pro Asset, Fehler egal
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;

  // VIDEO-STREAMING: iOS/Safari holt Video per HTTP-Range. Aus dem Cache kaeme sonst faelschlich eine
  // ganze 200-Antwort statt 206 -> die Wiedergabe stockt/setzt staendig neu an. Wir beantworten
  // Range-Anfragen korrekt mit 206 (aus dem Cache, sonst Netz) -> fluessig, auch offline.
  if (req.headers.has("range")) {
    e.respondWith((async () => {
      const range = req.headers.get("range") || "";
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const cached = await caches.match(req.url, { ignoreVary: true, ignoreSearch: false });
      if (!cached || !m) return fetch(req);
      const buf = await cached.arrayBuffer();
      const total = buf.byteLength;
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
      if (start >= total) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      const body = buf.slice(start, end + 1);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": cached.headers.get("Content-Type") || "video/mp4",
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(body.byteLength),
          "Accept-Ranges": "bytes",
        },
      });
    })());
    return;
  }

  const isMedia = /\.(png|jpe?g|webp|gif|svg|wav|mp3|ogg|mp4|webm|woff2?)$/i.test(new URL(req.url).pathname);
  if (isMedia) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)).catch(()=>{}); return res; })));
  } else {
    e.respondWith(fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)).catch(()=>{}); return res; }).catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))));
  }
});
