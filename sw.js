const CACHE_NAME = 'imyoo-v1';
const STATIC_ASSETS = [
  '/wedding/',
  '/wedding/index.html',
  '/wedding/style.css',
  '/wedding/app.js',
  '/wedding/manifest.json',
  '/wedding/icon-192.png',
  '/wedding/icon-512.png',
];

// 설치 시 정적 파일 캐시
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 오래된 캐시 삭제
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선, 실패 시 캐시 사용
self.addEventListener('fetch', (e) => {
  // Firebase, Google Fonts 등 외부 요청은 캐시 안 함
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
