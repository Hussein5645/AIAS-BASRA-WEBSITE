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
