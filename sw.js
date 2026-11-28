// PIBAL-RM BIMA Service Worker
// v19: library jsPDF ikut disimpan agar unduh PDF tetap jalan saat offline di Android
const CACHE_NAME = 'pibal-rm-bima-v19';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Library dari CDN (disimpan terpisah, gagal satu tidak membatalkan instalasi)
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ASSETS_TO_CACHE);
      await Promise.all(
        CDN_ASSETS.map((url) =>
          fetch(new Request(url, { mode: 'cors', credentials: 'omit' }))
            .then((res) => { if (res && res.ok) return cache.put(url, res); })
            .catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCacheable(response) {
  // status 200 (normal/CORS) atau opaque (type 'opaque', status 0) untuk CDN tanpa CORS
  return response && (response.status === 200 || response.type === 'opaque');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Jangan tangani blob:, data:, chrome-extension:, dll.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Library CDN: cache-first (cepat & tersedia offline), lalu perbarui di latar belakang
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (isCacheable(res)) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // File aplikasi: network-first, fallback ke cache (abaikan ?autopdf=... dll.)
  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
