import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export { app };

/**
 * Ask for notification permission and return an FCM token.
 * Always resolves to { token, error } — never throws — so the UI can show the
 * real reason it failed instead of a generic message. Explicitly registers the
 * service worker and waits for it to become active before calling getToken().
 */
export async function requestNotificationPermission() {
  try {
    if (typeof window === 'undefined') {
      return { token: null, error: 'Server side - skipping' };
    }

    // Check browser support
    if (!('serviceWorker' in navigator)) {
      return { token: null, error: 'messaging/unsupported-browser' };
    }

    if (!('Notification' in window)) {
      return { token: null, error: 'messaging/unsupported-browser' };
    }

    // Check if Firebase messaging is supported
    const { isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) {
      return { token: null, error: 'messaging/unsupported-browser' };
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { token: null, error: 'messaging/permission-blocked' };
    }

    // Register service worker explicitly and WAIT for it to be active
    let swRegistration;
    try {
      swRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' }
      );
      console.log('[push] SW registered:', swRegistration.scope);

      // Wait for the service worker to be active
      await navigator.serviceWorker.ready;
      console.log('[push] SW is ready and active');

      // Extra wait to ensure SW is fully active
      if (swRegistration.installing) {
        await new Promise((resolve) => {
          swRegistration.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') resolve();
          });
        });
      }
    } catch (swError) {
      console.error('[push] SW registration error:', swError);
      return { token: null, error: `failed to register service worker: ${swError.message}` };
    }

    // Get FCM token
    try {
      const { getMessaging, getToken } = await import('firebase/messaging');
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        return { token: null, error: 'No FCM registration token was returned' };
      }

      console.log('[push] FCM Token obtained successfully');
      return { token, error: null };
    } catch (tokenError) {
      console.error('[push] Token error:', tokenError);
      console.error('[push] code:', tokenError.code, '| message:', tokenError.message);
      return { token: null, error: tokenError.code || tokenError.message };
    }

  } catch (error) {
    console.error('[push] requestNotificationPermission error:', error);
    console.error('[push] code:', error.code, '| message:', error.message);
    return { token: null, error: error.code || error.message };
  }
}

export function onForegroundMessage(callback) {
  if (typeof window === 'undefined') return;
  const messaging = getMessaging(app);
  return onMessage(messaging, callback);
}
