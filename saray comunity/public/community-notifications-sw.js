self.importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
self.importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:'AIzaSyAvPMOgz1w7SFylBY8cmn9nf9GQvn-IRNI',
  authDomain:'space-42d87.firebaseapp.com',
  projectId:'space-42d87',
  storageBucket:'space-42d87.firebasestorage.app',
  messagingSenderId:'658382934950',
  appId:'1:658382934950:web:c61b6fa237b203e6bf7567'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'AIAS Basra Community', {
    body:data.body || 'You have a new community notification.',
    icon:'/static/images/branding/LOGO.png',
    badge:'/static/images/branding/LOGO.png',
    tag:data.notificationId || undefined,
    renotify:true,
    data:{url:data.url || '/'}
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
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
