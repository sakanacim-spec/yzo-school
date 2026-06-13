/*
 * Service Worker — Notifications Web Push Avancées
 * Types supportés : message, announcement, payment, presence, general
 */

self.addEventListener('push', (event) => {
  let data = { title: 'Notification', body: 'Vous avez une nouvelle information.', type: 'general' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Notification', body: event.data.text(), type: 'general' };
    }
  }

  // Configuration par type de notification
  const typeConfig = {
    message:      { tag: 'message-notif',    requireInteraction: false },
    announcement: { tag: 'announce-notif',   requireInteraction: true  },
    payment:      { tag: 'payment-notif',    requireInteraction: true  },
    presence:     { tag: 'presence-notif',   requireInteraction: false },
    general:      { tag: 'general-notif',    requireInteraction: false },
  };

  const cfg = typeConfig[data.type] || typeConfig.general;

  // Actions contextuelles selon le type
  const actions = [];
  if (data.type === 'message') {
    actions.push({ action: 'open_chat', title: '💬 Voir le message' });
  } else if (data.type === 'announcement') {
    actions.push({ action: 'open_announce', title: '📋 Voir l\'annonce' });
  } else if (data.type === 'payment') {
    actions.push({ action: 'open_payment', title: '💳 Voir le reçu' });
  }

  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: cfg.tag,
    renotify: true,
    requireInteraction: cfg.requireInteraction,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data.url || '/',
      type: data.type
    },
    actions
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifType = event.notification.data?.type || 'general';
  const action = event.action;

  // Déterminer la page de destination selon le type
  let targetPath = '/';
  if (action === 'open_chat' || notifType === 'message') {
    targetPath = '/?page=chat';
  } else if (action === 'open_announce' || notifType === 'announcement') {
    targetPath = '/?page=annonces';
  } else if (action === 'open_payment' || notifType === 'payment') {
    targetPath = '/?page=parent_historique';
  } else if (notifType === 'presence') {
    targetPath = '/?page=parent_dashboard';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          // Envoyer un message au client pour naviguer vers la bonne page
          client.postMessage({ type: 'PUSH_NAVIGATE', page: targetPath, notifType });
          return;
        }
      }
      return clients.openWindow(targetPath);
    })
  );
});

// Activation immédiate du SW sans attendre
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
