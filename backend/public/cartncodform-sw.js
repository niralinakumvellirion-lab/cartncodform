importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU",
  projectId: "cartncodform",
  messagingSenderId: "133172185047",
  appId: "1:133172185047:web:23be3ca1f3ccf357a62d92",
  authDomain: "cartncodform.firebaseapp.com",
  storageBucket: "cartncodform.appspot.com",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message:', payload);

  var title = payload.notification?.title ||
              payload.data?.title ||
              'You left items in your cart!';
  var body = payload.notification?.body ||
             payload.data?.body ||
             'Complete your order now';
  var icon = payload.notification?.icon ||
             payload.data?.icon ||
             'https://img.icons8.com/color/96/shopping-cart--v1.png';
  var image = payload.notification?.image ||
              payload.data?.image ||
              payload.data?.imageUrl ||
              null;
  var url = payload.data?.url || '/';

  var options = {
    body: body,
    icon: icon,
    badge: 'https://img.icons8.com/color/96/shopping-cart--v1.png',
    data: { url: url },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  // Add image if available
  if (image) {
    options.image = image;
  }

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || self.location.origin;
  event.waitUntil(clients.openWindow(url));
});
