// Service Worker — Agenda Ju
const CACHE = 'agenda-ju-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/config.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)).catch(() => caches.match('/index.html')));
});
self.addEventListener('push', e => {
  const d = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(d.title||'Agenda Ju 🌸', {
    body: d.body||'Você tem um lembrete!',
    icon: '/assets/icon.png',
    badge: '/assets/icon.png',
    vibrate: [100, 50, 100]
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
