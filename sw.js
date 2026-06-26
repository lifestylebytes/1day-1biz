// 1일1비 서비스워커 (PWA 설치 + 웹 푸시)
// 캐싱은 일부러 안 함 (633KB 앱이 stale 버전으로 굳는 사고 방지). 항상 네트워크 최신.

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// 설치 가능 조건상 fetch 핸들러는 있어야 함. 그냥 통과(네트워크 그대로).
self.addEventListener('fetch', () => {});

// 푸시 수신 → 시스템 알림 표시 (앱이 꺼져 있어도 옴)
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || '1일1비';
  const options = {
    body: data.body || '오늘도 5분 출근해요!',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || './index.html' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 → 앱 열기 (이미 열려 있으면 포커스)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
