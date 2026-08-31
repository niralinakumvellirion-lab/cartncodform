// Version: 2 — updated 2026-08-31
// If push still fails, clear this SW in DevTools -> Application -> Service Workers -> Unregister

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU",
  projectId: "cartncodform",
  messagingSenderId: "133172185047",
  appId: "1:133172185047:web:23be3ca1f3ccf357a62d92",
  authDomain: "cartncodform.firebaseapp.com",
  storageBucket: "cartncodform.appspot.com",
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] Background message received:', payload);
    const title = payload.notification?.title || 'CartnCodForm';
    const body = payload.notification?.body || 'You have a new notification';
    const icon = payload.notification?.icon || '/favicon.ico';

    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/favicon.ico',
    });
  });

  console.log('[SW] Firebase messaging initialized successfully');
} catch (error) {
  console.error('[SW] Firebase initialization error:', error);
}
