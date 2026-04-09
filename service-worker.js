// RouteLogger Service Worker
// PWA対応: オフライン機能とキャッシュ管理

const CACHE_NAME = 'RLog-v11';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/firebase-config.js',
  './js/app-main.js',
  './js/config.js',
  './js/state.js',
  './js/utils.js',
  './js/db.js',
  './js/map.js',
  './js/tracking.js',
  './js/camera.js',
  './js/firebase-ops.js',
  './js/ui.js',
  './data/minoo-emergency-points.geojson',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Service Workerのインストール
self.addEventListener('install', function (event) {
  // 待機せず即座にアクティブ化（旧バージョンを強制終了）
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(urlsToCache);
      })
      .catch(function (error) {
        console.error('[Service Worker] キャッシュエラー:', error);
      })
  );
});

// Service Workerのアクティベーション
self.addEventListener('activate', function (event) {

  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      // 旧キャッシュが存在するか確認（アップデート判定）
      const hasOldCache = cacheNames.some(function (name) {
        return name !== CACHE_NAME && name.startsWith('routelogger-');
      });

      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      )
      .then(function () {
        // 全クライアントを即座にこのSWの管理下に置く
        return self.clients.claim();
      })
      .then(function () {
        // アップデートの場合のみ、開いているページにリロードを通知
        if (hasOldCache) {
          return self.clients.matchAll({ type: 'window' }).then(function (clients) {
            clients.forEach(function (client) {
              client.postMessage({ type: 'SW_UPDATED' });
            });
          });
        }
      });
    })
  );
});

// リクエストの処理
self.addEventListener('fetch', function (event) {
  // 国土地理院のタイルは常にネットワークから取得（リアルタイム性のため）
  if (event.request.url.includes('cyberjapandata.gsi.go.jp')) {
    event.respondWith(
      fetch(event.request)
        .catch(function () {
          // オフライン時は何も返さない（地図が表示されないだけ）
          return new Response('', { status: 200 });
        })
    );
    return;
  }

  // その他のリソースはキャッシュファースト戦略
  event.respondWith(
    caches.match(event.request)
      .then(function (response) {
        // キャッシュにあればそれを返す
        if (response) {
          return response;
        }

        // なければネットワークから取得
        return fetch(event.request)
          .then(function (response) {
            // レスポンスが有効でない場合はそのまま返す
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをクローンしてキャッシュに保存
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(function (cache) {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(function (error) {
            console.error('[Service Worker] フェッチエラー:', error);
            return new Response('', { status: 408, statusText: 'Network error' });
          });
      })
  );
});
