// KOSMOBAGGER PWA Service-Worker.
// App-Shell NETWORK-FIRST (online aktuell), Medien CACHE-FIRST (offline). Version bei Release erhoehen.
const CACHE = "kosmobagger-v11";
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
  "assets/hero.png",
  "assets/batterie.png",
  "assets/kanister.png",
  "assets/kristall.png",
  "assets/sfx/clash.wav",
  "assets/sfx/click.wav",
  "assets/sfx/lose.wav",
  "assets/sfx/place.wav",
  "assets/sfx/reveal.wav",
  "assets/sfx/score.wav",
  "assets/sfx/tick.wav",
  "assets/sfx/win.wav"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const isMedia = /\.(png|jpe?g|webp|gif|svg|wav|mp3|ogg|woff2?)$/i.test(new URL(req.url).pathname);
  if (isMedia) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)).catch(()=>{}); return res; })));
  } else {
    e.respondWith(fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)).catch(()=>{}); return res; }).catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))));
  }
});
