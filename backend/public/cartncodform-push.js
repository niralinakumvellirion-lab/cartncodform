(function() {
  const BACKEND_URL = 'https://cartncodform-backend.onrender.com';
  const SHOP_DOMAIN = '{{shop.permanent_domain}}'; // Shopify liquid variable

  // Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU",
    projectId: "cartncodform",
    messagingSenderId: "133172185047",
    appId: "1:133172185047:web:23be3ca1f3ccf357a62d92",
    authDomain: "cartncodform.firebaseapp.com",
    storageBucket: "cartncodform.appspot.com",
  };

  // Load Firebase scripts dynamically
  function loadScript(src, callback) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    document.head.appendChild(script);
  }

  // Register service worker for push
  async function registerSW() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
    try {
      const reg = await navigator.serviceWorker.register(
        BACKEND_URL + '/cartncodform-sw.js',
        { scope: '/' }
      );
      await navigator.serviceWorker.ready;
      return reg;
    } catch (err) {
      console.log('[CartnCodForm] SW registration failed:', err);
      return null;
    }
  }

  // Get FCM token and save to backend
  async function subscribePush(swReg) {
    try {
      const VAPID_KEY = 'BMPrLf4eInbFu1IpI_ZqyblmkbSYIm0JyukselN80lglfwuBfyaU7kOQZ6FFxo1PjUqh1xnGzd2uVPdJrYEh0Jo';
      const { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');
      const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');

      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      const messaging = getMessaging(app);

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (token) {
        await fetch(BACKEND_URL + '/api/push/subscribe-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token,
            page: window.location.pathname
          }),
        });
        console.log('[CartnCodForm] Customer push subscribed');
      }
    } catch (err) {
      console.log('[CartnCodForm] Push subscribe failed:', err);
    }
  }

  // Show permission prompt after 3 seconds
  async function init() {
    if (Notification.permission === 'granted') {
      const swReg = await registerSW();
      if (swReg) await subscribePush(swReg);
      return;
    }

    if (Notification.permission === 'denied') return;

    // Wait 3 seconds then ask
    setTimeout(async () => {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const swReg = await registerSW();
        if (swReg) await subscribePush(swReg);
      }
    }, 3000);
  }

  // Start when page loads
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
