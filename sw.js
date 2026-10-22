// Service worker do YFX Gym: a app abre sem rede; os dados (Supabase) vão sempre à rede.
// Ao mudar ficheiros, sobe a VERSION para os telemóveis receberem a nova versão.
const VERSION = "yfxgym-v2";
const SHELL = ["./", "index.html", "css/app.css", "js/vendor/supabase.js", "js/config.js", "js/yofi.js", "js/exercises.js", "js/store.js", "js/app.js",
  "manifest.webmanifest", "fonts/manrope-latin.woff2", "fonts/manrope-latin-ext.woff2", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  // navegação: rede primeiro (versão nova), senão a app em cache
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(VERSION).then((ca) => ca.put("index.html", c)); return r; }).catch(() => caches.match("index.html")));
    return;
  }
  // ficheiros da app: cache primeiro (rápido em rede lenta), atualizados pela VERSION
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then((ca) => ca.put(req, c)); } return r; })));
});
