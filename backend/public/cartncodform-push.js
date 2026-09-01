/* CartnCodForm — self-contained storefront push script.
 * Injects its own CSS + popup HTML, works on desktop and mobile, and only
 * calls Notification.requestPermission() from a real user gesture (the popup
 * "Allow" button) so mobile browsers don't silently drop the request.
 * Load with:  <script defer src="https://cartncodform-backend.onrender.com/cartncodform-push.js"></script>
 */
(function () {
  'use strict';

  if (window.__ccfPushLoaded) return;
  window.__ccfPushLoaded = true;

  const BACKEND_URL = 'https://cartncodform-backend.onrender.com';
  const VAPID_KEY =
    'BMPrLf4eInbFu1IpI_ZqyblmkbSYIm0JyukselN80lglfwuBfyaU7kOQZ6FFxo1PjUqh1xnGzd2uVPdJrYEh0Jo';

  const firebaseConfig = {
    apiKey: 'AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU',
    projectId: 'cartncodform',
    messagingSenderId: '133172185047',
    appId: '1:133172185047:web:23be3ca1f3ccf357a62d92',
    authDomain: 'cartncodform.firebaseapp.com',
    storageBucket: 'cartncodform.appspot.com',
  };

  // --- SHOP_DOMAIN detection — multiple fallbacks -------------------------
  const SHOP_DOMAIN =
    window.Shopify?.shop ||
    document.querySelector('meta[name="myshopify-domain"]')?.content ||
    document
      .querySelector('meta[property="og:url"]')
      ?.content?.match(/([^/]+\.myshopify\.com)/)?.[1] ||
    window.location.hostname;

  console.log('[CCF] Shop domain detected:', SHOP_DOMAIN);

  // ---------------------------------------------------------------------------
  // 1. Inject CSS
  // ---------------------------------------------------------------------------
  const style = document.createElement('style');
  style.id = 'ccf-style';
  style.textContent = `
    #ccf-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    #ccf-card {
      background: #fff;
      border-radius: 20px;
      max-width: 360px;
      width: 90%;
      padding: 28px;
      text-align: center;
      position: relative;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      animation: ccf-slide 0.3s ease;
      box-sizing: border-box;
    }
    @keyframes ccf-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes ccf-slide {
      from { transform: translateY(30px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes ccf-bounce {
      0% { transform: scale(0); }
      60% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }
    #ccf-x {
      position: absolute; top: 10px; right: 14px;
      background: none; border: none; font-size: 22px;
      line-height: 1; cursor: pointer; color: #999;
    }
    #ccf-timer {
      position: absolute; top: 12px; left: 14px;
      background: #f0f0f0; border-radius: 20px;
      padding: 3px 10px; font-size: 12px; color: #666; font-weight: 600;
    }
    #ccf-emoji {
      font-size: 54px; display: block; margin: 6px 0 12px;
      animation: ccf-bounce 0.6s ease 0.15s both;
    }
    #ccf-badge {
      background: linear-gradient(135deg, #ff6b6b, #ee5a24);
      color: #fff; font-size: 11px; font-weight: 700;
      padding: 4px 12px; border-radius: 20px; display: inline-block;
      margin-bottom: 14px; letter-spacing: 0.5px; text-transform: uppercase;
    }
    #ccf-discount {
      background: linear-gradient(135deg, #11998e, #38ef7d);
      color: #fff; border-radius: 10px; padding: 10px;
      margin-bottom: 16px; font-weight: 700; font-size: 15px;
    }
    #ccf-card h2 {
      font-size: 22px; font-weight: 800; color: #1a1a2e;
      margin: 0 0 10px; line-height: 1.3;
    }
    #ccf-card p {
      font-size: 14px; color: #666; margin: 0 0 20px; line-height: 1.6;
    }
    #ccf-benefits {
      background: #f8f9ff; border-radius: 12px; padding: 14px;
      margin-bottom: 20px; text-align: left;
    }
    #ccf-benefits div {
      font-size: 13px; color: #444; padding: 4px 0;
      display: flex; align-items: center; gap: 8px;
    }
    #ccf-yes {
      width: 100%;
      background: #667eea;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: #fff; border: none; border-radius: 12px;
      padding: 16px; font-size: 16px; font-weight: 700; cursor: pointer;
      margin-bottom: 10px;
      box-shadow: 0 4px 20px rgba(102,126,234,0.4);
    }
    #ccf-yes:active { transform: translateY(1px); }
    #ccf-no {
      background: none; border: none; color: #aaa;
      font-size: 13px; text-decoration: underline; cursor: pointer; padding: 4px;
    }
  `;

  // ---------------------------------------------------------------------------
  // 2. Inject popup HTML
  // ---------------------------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.id = 'ccf-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div id="ccf-card">
      <button id="ccf-x" aria-label="Close">&times;</button>
      <div id="ccf-timer">&#9201; <span id="ccf-count">15</span>s</div>
      <span id="ccf-emoji">&#128276;</span>
      <div id="ccf-badge">Exclusive Members Only</div>
      <div id="ccf-discount">&#127873; Subscribe &amp; get 10% OFF!</div>
      <h2>Never Miss a Deal Again!</h2>
      <p>Get instant alerts for flash sales, restocks, and exclusive offers &mdash; before anyone else!</p>
      <div id="ccf-benefits">
        <div>&#9989; Flash sale alerts &mdash; first access</div>
        <div>&#9989; Back in stock notifications</div>
        <div>&#9989; Exclusive discount codes</div>
      </div>
      <button id="ccf-yes">&#128276; Yes! Notify Me</button>
      <br>
      <button id="ccf-no">No thanks, I hate deals</button>
    </div>
  `;

  function mount() {
    if (!document.getElementById('ccf-style')) {
      (document.head || document.documentElement).appendChild(style);
    }
    if (!document.getElementById('ccf-overlay') && document.body) {
      document.body.appendChild(overlay);
    }
    wireUp();
  }

  // ---------------------------------------------------------------------------
  // 3. Show / hide with INLINE styles (no CSS classes)
  // ---------------------------------------------------------------------------
  let timer = null;
  let timeLeft = 15;

  function startCountdown() {
    timeLeft = 15;
    const countEl = document.getElementById('ccf-count');
    if (countEl) countEl.textContent = timeLeft;
    clearInterval(timer);
    timer = setInterval(() => {
      timeLeft--;
      const el = document.getElementById('ccf-count');
      if (el) el.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timer);
        hidePopup();
      }
    }, 1000);
  }

  function showPopup() {
    const o = document.getElementById('ccf-overlay');
    if (!o) return;
    o.style.display = 'flex';
    o.style.alignItems = 'center';
    o.style.justifyContent = 'center';
    startCountdown();
    console.log('[CCF] Popup shown');
  }

  function hidePopup() {
    const o = document.getElementById('ccf-overlay');
    if (o) o.style.display = 'none';
    clearInterval(timer);
  }

  // expose for manual testing (test-popup.html)
  window.ccfShowPopup = showPopup;
  window.ccfHidePopup = hidePopup;

  // ---------------------------------------------------------------------------
  // 4. Service worker
  // ---------------------------------------------------------------------------
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.log('[CCF] Service Worker not supported');
      return null;
    }
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.active && reg.active.scriptURL.includes('cartncodform-sw')) {
          console.log('[CCF] Found existing SW, reusing');
          await navigator.serviceWorker.ready;
          return reg;
        }
      }

      console.log('[CCF] Registering new Service Worker...');
      const reg = await navigator.serviceWorker.register(
        BACKEND_URL + '/cartncodform-sw.js',
        { updateViaCache: 'none' }
      );
      console.log('[CCF] SW registered:', reg.scope);

      if (reg.installing) {
        console.log('[CCF] SW installing, waiting...');
        await new Promise((resolve, reject) => {
          reg.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              console.log('[CCF] SW activated');
              resolve();
            }
            if (e.target.state === 'redundant') reject(new Error('SW became redundant'));
          });
          setTimeout(reject, 30000, new Error('SW activation timeout'));
        });
      }

      await navigator.serviceWorker.ready;
      console.log('[CCF] SW ready');
      return reg;
    } catch (err) {
      console.error('[CCF] SW registration failed:', err);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. FCM subscription
  // ---------------------------------------------------------------------------
  async function subscribePush(swReg) {
    try {
      console.log('[CCF] Starting push subscription for shop:', SHOP_DOMAIN);
      if (!swReg) {
        console.error('[CCF] No service worker registration');
        return;
      }

      console.log('[CCF] Loading Firebase...');
      let initializeApp, getApps, getMessaging, getToken;
      try {
        const appModule = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
        );
        initializeApp = appModule.initializeApp;
        getApps = appModule.getApps;
        const msgModule = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js'
        );
        getMessaging = msgModule.getMessaging;
        getToken = msgModule.getToken;
      } catch (importErr) {
        console.error('[CCF] Firebase import failed:', importErr);
        return;
      }

      console.log('[CCF] Firebase loaded, initializing app...');
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      const messaging = getMessaging(app);

      console.log('[CCF] Getting FCM token...');
      let token;
      try {
        token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
      } catch (tokenErr) {
        console.error('[CCF] Token generation failed:', tokenErr.code, tokenErr.message);
        console.log('[CCF] Retrying token generation...');
        await new Promise((r) => setTimeout(r, 2000));
        try {
          token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swReg,
          });
        } catch (retryErr) {
          console.error('[CCF] Retry also failed:', retryErr.message);
          return;
        }
      }

      if (!token) {
        console.error('[CCF] No FCM token received');
        return;
      }

      console.log('[CCF] FCM token obtained:', token.substring(0, 20) + '...');
      localStorage.setItem('ccf_fcm_token', token);

      try {
        const response = await fetch(BACKEND_URL + '/api/push/subscribe-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token,
            page: window.location.pathname,
          }),
        });
        const data = await response.json();
        console.log('[CCF] Subscription response:', data);
        if (data.success) {
          console.log('[CCF] Successfully subscribed!');
          localStorage.setItem('ccf_push_subscribed', '1');
        }
      } catch (fetchErr) {
        console.error('[CCF] Backend subscription failed:', fetchErr);
      }
    } catch (err) {
      console.error('[CCF] Subscribe error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Wire up buttons
  // ---------------------------------------------------------------------------
  let wired = false;
  function wireUp() {
    if (wired) return;
    const yes = document.getElementById('ccf-yes');
    const no = document.getElementById('ccf-no');
    const x = document.getElementById('ccf-x');
    if (!yes || !no || !x) return;
    wired = true;

    yes.addEventListener('click', async () => {
      hidePopup();
      yes.textContent = 'Enabling...';
      try {
        const permission = await Notification.requestPermission();
        console.log('[CCF] requestPermission ->', permission);
        if (permission === 'granted') {
          const swReg = await registerSW();
          if (swReg) await subscribePush(swReg);
        } else {
          sessionStorage.setItem('ccf_push_denied_session', '1');
        }
      } catch (e) {
        console.log('[CCF] Permission error:', e);
      }
    });

    const dismiss = () => {
      hidePopup();
      sessionStorage.setItem('ccf_push_denied_session', '1');
    };
    no.addEventListener('click', dismiss);
    x.addEventListener('click', dismiss);
  }

  // ---------------------------------------------------------------------------
  // 7. Init
  // ---------------------------------------------------------------------------
  async function init() {
    mount();

    if (!('Notification' in window)) {
      console.log('[CCF] Notifications not supported');
      return;
    }

    console.log('[CCF] Permission status:', Notification.permission);

    if (Notification.permission === 'granted') {
      console.log('[CCF] Permission granted, re-subscribing silently...');
      const swReg = await registerSW();
      if (swReg) await subscribePush(swReg);
      return;
    }

    if (Notification.permission === 'denied') {
      console.log('[CCF] Permission denied by user');
      return;
    }

    if (sessionStorage.getItem('ccf_push_denied_session')) {
      console.log('[CCF] Dismissed this session, not showing popup');
      return;
    }

    if (localStorage.getItem('ccf_push_subscribed') === '1') {
      console.log('[CCF] Already subscribed, re-subscribing silently...');
      const swReg = await registerSW();
      if (swReg) await subscribePush(swReg);
      return;
    }

    console.log('[CCF] Will show popup in 3 seconds');
    setTimeout(showPopup, 3000);
  }

  // ---------------------------------------------------------------------------
  // 8. Cart tracking
  // ---------------------------------------------------------------------------
  function trackCartAdd() {
    document.addEventListener('click', async function (e) {
      const btn = e.target.closest(
        '[name="add"], .product-form__submit, button[type="submit"][form], [data-testid="add-to-cart"]'
      );
      if (!btn) return;
      const form =
        btn.closest('form[action*="/cart/add"]') || btn.closest('form[action="/cart/add"]');
      if (!form) return;

      console.log('[CCF] Add to cart detected');

      if (!localStorage.getItem('ccf_push_subscribed')) {
        if (('Notification' in window) && Notification.permission === 'default') {
          showPopup();
        }
      }

      const token = localStorage.getItem('ccf_fcm_token');
      if (token) {
        fetch(BACKEND_URL + '/api/push/cart-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token,
            event: 'add_to_cart',
            url: window.location.href,
          }),
        })
          .then((r) => r.json())
          .then((d) => console.log('[CCF] Cart activity tracked:', d))
          .catch((err) => console.log('[CCF] Cart track error:', err));
      } else {
        console.log('[CCF] No token yet for cart tracking');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 9. Start
  // ---------------------------------------------------------------------------
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
  trackCartAdd();
})();
