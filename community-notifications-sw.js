self.importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
self.importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:'AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ',
  authDomain:'aias-bsr.firebaseapp.com',
  projectId:'aias-bsr',
  storageBucket:'aias-bsr.firebasestorage.app',
  messagingSenderId:'78055223814',
  appId:'1:78055223814:web:99460402c2b1fcd5ae8987'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'AIAS Basra Community', {
    body:data.body || 'You have a new community notification.',
    icon:'/LOGO.png',
    badge:'/LOGO.png',
    tag:data.notificationId || undefined,
    renotify:true,
    data:{url:data.url || '/community.html'}
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/community.html';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({type:'window', includeUncontrolled:true});
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.navigate(target);
      return;
    }
    await clients.openWindow(target);
  })());
});
