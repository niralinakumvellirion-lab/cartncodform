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
  const title = payload.notification?.title || 'You left something behind!';
  const body = payload.notification?.body || 'Complete your order now';
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    data: { url: payload.data?.url || self.location.origin },
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || self.location.origin;
  event.waitUntil(clients.openWindow(url));
});
