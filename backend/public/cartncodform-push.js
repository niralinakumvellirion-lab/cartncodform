/* CartnCodForm — self-contained storefront push script.
 * Injects its own CSS + popup HTML, works on desktop and mobile (Android
 * Chrome friendly), and only calls Notification.requestPermission() from a
 * real user gesture (the popup "Allow" button).
 * Load with:
 *   <script async src="https://cartncodform-backend.onrender.com/cartncodform-push.js"></script>
 */
(function () {
  'use strict';

  var BACKEND_URL = 'https://cartncodform-backend.onrender.com';
  var VAPID_KEY =
    'BMPrLf4eInbFu1IpI_ZqyblmkbSYIm0JyukselN80lglfwuBfyaU7kOQZ6FFxo1PjUqh1xnGzd2uVPdJrYEh0Jo';

  var firebaseConfig = {
    apiKey: 'AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU',
    projectId: 'cartncodform',
    messagingSenderId: '133172185047',
    appId: '1:133172185047:web:23be3ca1f3ccf357a62d92',
    authDomain: 'cartncodform.firebaseapp.com',
    storageBucket: 'cartncodform.appspot.com',
  };

  // --- SHOP_DOMAIN detection — multiple fallbacks -------------------------
  var SHOP_DOMAIN =
    (window.Shopify && window.Shopify.shop) ||
    (document.querySelector('meta[name="myshopify-domain"]') || {}).content ||
    (((document.querySelector('meta[property="og:url"]') || {}).content || '')
      .match(/([^/]+\.myshopify\.com)/) || [])[1] ||
    window.location.hostname;

  console.log('[CCF] Shop domain detected:', SHOP_DOMAIN);

  // ---------------------------------------------------------------------------
  // CSS + HTML as strings
  // ---------------------------------------------------------------------------
  function getCss() {
    return [
      '#ccf-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);',
      'z-index:999999;display:none;align-items:center;justify-content:center;padding:16px;',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-tap-highlight-color:transparent;}",
      '#ccf-card{background:#fff;border-radius:20px;max-width:360px;width:90%;padding:28px;',
      'text-align:center;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.3);',
      'animation:ccf-slide .3s ease;box-sizing:border-box;}',
      '@keyframes ccf-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes ccf-slide{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}',
      '@keyframes ccf-bounce{0%{transform:scale(0)}60%{transform:scale(1.2)}100%{transform:scale(1)}}',
      '#ccf-x{position:absolute;top:10px;right:14px;background:none;border:none;font-size:22px;',
      'line-height:1;cursor:pointer;color:#999;}',
      '#ccf-timer{position:absolute;top:12px;left:14px;background:#f0f0f0;border-radius:20px;',
      'padding:3px 10px;font-size:12px;color:#666;font-weight:600;}',
      '#ccf-emoji{font-size:54px;display:block;margin:6px 0 12px;animation:ccf-bounce .6s ease .15s both;}',
      '#ccf-badge{background:linear-gradient(135deg,#ff6b6b,#ee5a24);color:#fff;font-size:11px;',
      'font-weight:700;padding:4px 12px;border-radius:20px;display:inline-block;margin-bottom:14px;',
      'letter-spacing:.5px;text-transform:uppercase;}',
      '#ccf-discount{background:linear-gradient(135deg,#11998e,#38ef7d);color:#fff;border-radius:10px;',
      'padding:10px;margin-bottom:16px;font-weight:700;font-size:15px;}',
      '#ccf-card h2{font-size:22px;font-weight:800;color:#1a1a2e;margin:0 0 10px;line-height:1.3;}',
      '#ccf-card p{font-size:14px;color:#666;margin:0 0 20px;line-height:1.6;}',
      '#ccf-benefits{background:#f8f9ff;border-radius:12px;padding:14px;margin-bottom:20px;text-align:left;}',
      '#ccf-benefits div{font-size:13px;color:#444;padding:4px 0;display:flex;align-items:center;gap:8px;}',
      '#ccf-yes{width:100%;background:#667eea;background:linear-gradient(135deg,#667eea,#764ba2);',
      'color:#fff;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:700;',
      'cursor:pointer;margin-bottom:10px;box-shadow:0 4px 20px rgba(102,126,234,0.4);}',
      '#ccf-yes:active{transform:translateY(1px);}',
      '#ccf-no{background:none;border:none;color:#aaa;font-size:13px;text-decoration:underline;',
      'cursor:pointer;padding:4px;}',
    ].join('');
  }

  function getHtml() {
    return [
      '<div id="ccf-overlay" role="dialog" aria-modal="true">',
      '<div id="ccf-card">',
      '<button id="ccf-x" aria-label="Close">&times;</button>',
      '<div id="ccf-timer">&#9201; <span id="ccf-count">15</span>s</div>',
      '<span id="ccf-emoji">&#128276;</span>',
      '<div id="ccf-badge">Exclusive Members Only</div>',
      '<div id="ccf-discount">&#127873; Subscribe &amp; get 10% OFF!</div>',
      '<h2>Never Miss a Deal Again!</h2>',
      '<p>Get instant alerts for flash sales, restocks, and exclusive offers &mdash; before anyone else!</p>',
      '<div id="ccf-benefits">',
      '<div>&#9989; Flash sale alerts &mdash; first access</div>',
      '<div>&#9989; Back in stock notifications</div>',
      '<div>&#9989; Exclusive discount codes</div>',
      '</div>',
      '<button id="ccf-yes">&#128276; Yes! Notify Me</button>',
      '<br>',
      '<button id="ccf-no">No thanks, I hate deals</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // mount() — idempotent: injects CSS + HTML, wires buttons
  // ---------------------------------------------------------------------------
  function mount() {
    // Prevent double mount
    if (document.getElementById('ccf-overlay')) return;

    // Inject CSS
    if (!document.getElementById('ccf-style')) {
      var style = document.createElement('style');
      style.id = 'ccf-style';
      style.textContent = getCss();
      (document.head || document.documentElement).appendChild(style);
    }

    // Inject HTML
    var div = document.createElement('div');
    div.innerHTML = getHtml();
    var overlay = div.firstElementChild;
    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      (document.documentElement).appendChild(overlay);
    }

    console.log('[CCF] Mounted, overlay:', !!document.getElementById('ccf-overlay'));
    wireUp();

    // FIX 5: visible test button when ?ccf_test=1
    if (
      new URLSearchParams(window.location.search).get('ccf_test') === '1' &&
      !document.getElementById('ccf-test-btn')
    ) {
      setTimeout(function () {
        if (document.getElementById('ccf-test-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'ccf-test-btn';
        btn.textContent = 'Test CCF Popup';
        btn.style.cssText =
          'position:fixed;bottom:20px;right:20px;z-index:999998;background:#667eea;color:white;border:none;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer;';
        btn.onclick = showPopup;
        document.body.appendChild(btn);
        console.log('[CCF] Test button added');
      }, 1000);
    }
  }

  // ---------------------------------------------------------------------------
  // Show / hide
  // ---------------------------------------------------------------------------
  var timer = null;
  var timeLeft = 15;

  function startCountdown() {
    timeLeft = 15;
    var countEl = document.getElementById('ccf-count');
    if (countEl) countEl.textContent = timeLeft;
    clearInterval(timer);
    timer = setInterval(function () {
      timeLeft--;
      var el = document.getElementById('ccf-count');
      if (el) el.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timer);
        hidePopup();
      }
    }, 1000);
  }

  function showPopup() {
    var o = document.getElementById('ccf-overlay');
    if (!o) {
      console.log('[CCF] Overlay not found, mounting...');
      mount();
      o = document.getElementById('ccf-overlay');
    }
    if (!o) {
      console.log('[CCF] ERROR: Could not create overlay');
      return;
    }

    // Force display with all required styles
    o.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'bottom:0',
      'background:rgba(0,0,0,0.6)',
      'z-index:999999',
    ].join(';');

    console.log('[CCF] Popup shown, overlay display:', o.style.display);
    startCountdown();
  }

  function hidePopup() {
    var o = document.getElementById('ccf-overlay');
    if (o) o.style.display = 'none';
    clearInterval(timer);
  }

  // expose for manual testing (test-popup.html)
  window.ccfShowPopup = showPopup;
  window.ccfHidePopup = hidePopup;

  // ---------------------------------------------------------------------------
  // Service worker
  // ---------------------------------------------------------------------------
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.log('[CCF] Service Worker not supported');
      return null;
    }
    try {
      var regs = await navigator.serviceWorker.getRegistrations();
      for (var i = 0; i < regs.length; i++) {
        var r = regs[i];
        if (r.active && r.active.scriptURL.indexOf('cartncodform-sw') !== -1) {
          console.log('[CCF] Found existing SW, reusing');
          await navigator.serviceWorker.ready;
          return r;
        }
      }

      console.log('[CCF] Registering new Service Worker...');
      var reg = await navigator.serviceWorker.register(
        BACKEND_URL + '/cartncodform-sw.js',
        { updateViaCache: 'none' }
      );
      console.log('[CCF] SW registered:', reg.scope);

      if (reg.installing) {
        console.log('[CCF] SW installing, waiting...');
        await new Promise(function (resolve, reject) {
          reg.installing.addEventListener('statechange', function (e) {
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
  // FCM subscription
  // ---------------------------------------------------------------------------
  async function subscribePush(swReg) {
    try {
      console.log('[CCF] Starting push subscription for shop:', SHOP_DOMAIN);
      if (!swReg) {
        console.error('[CCF] No service worker registration');
        return;
      }

      console.log('[CCF] Loading Firebase...');
      var initializeApp, getApps, getMessaging, getToken;
      try {
        var appModule = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
        );
        initializeApp = appModule.initializeApp;
        getApps = appModule.getApps;
        var msgModule = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js'
        );
        getMessaging = msgModule.getMessaging;
        getToken = msgModule.getToken;
      } catch (importErr) {
        console.error('[CCF] Firebase import failed:', importErr);
        return;
      }

      console.log('[CCF] Firebase loaded, initializing app...');
      var app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      var messaging = getMessaging(app);

      console.log('[CCF] Getting FCM token...');
      var token;
      try {
        token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
      } catch (tokenErr) {
        console.error('[CCF] Token generation failed:', tokenErr.code, tokenErr.message);
        console.log('[CCF] Retrying token generation...');
        await new Promise(function (r) { setTimeout(r, 2000); });
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
        var response = await fetch(BACKEND_URL + '/api/push/subscribe-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token: token,
            page: window.location.pathname,
          }),
        });
        var data = await response.json();
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
  // Wire up buttons — the ONLY place Notification.requestPermission() is called
  // ---------------------------------------------------------------------------
  var wired = false;
  function wireUp() {
    if (wired) return;
    var yes = document.getElementById('ccf-yes');
    var no = document.getElementById('ccf-no');
    var x = document.getElementById('ccf-x');
    if (!yes || !no || !x) return;
    wired = true;

    yes.addEventListener('click', async function () {
      hidePopup();
      yes.textContent = 'Enabling...';
      try {
        var permission = await Notification.requestPermission();
        console.log('[CCF] requestPermission ->', permission);
        if (permission === 'granted') {
          var swReg = await registerSW();
          if (swReg) await subscribePush(swReg);
        } else {
          sessionStorage.setItem('ccf_push_denied_session', '1');
        }
      } catch (e) {
        console.log('[CCF] Permission error:', e);
      }
    });

    var dismiss = function () {
      hidePopup();
      sessionStorage.setItem('ccf_push_denied_session', '1');
    };
    no.addEventListener('click', dismiss);
    x.addEventListener('click', dismiss);
  }

  // ---------------------------------------------------------------------------
  // init() — shows the popup; never asks permission directly
  // ---------------------------------------------------------------------------
  async function init() {
    // Mount HTML first
    if (!document.getElementById('ccf-overlay')) mount();

    if (!('Notification' in window)) {
      console.log('[CCF] Notifications not supported on this browser');
      return;
    }

    var perm = Notification.permission;
    console.log('[CCF] Permission:', perm);

    if (perm === 'granted') {
      try {
        var sw = await registerSW();
        if (sw) await subscribePush(sw);
      } catch (e) {
        console.log('[CCF] Re-subscribe error:', e.message);
      }
      return;
    }

    if (perm === 'denied') {
      console.log('[CCF] Permission denied');
      return;
    }

    if (sessionStorage.getItem('ccf_push_denied_session')) return;
    if (localStorage.getItem('ccf_push_subscribed') === '1') {
      try {
        var sw2 = await registerSW();
        if (sw2) await subscribePush(sw2);
      } catch (e) {}
      return;
    }

    // Show popup after delay
    console.log('[CCF] Scheduling popup...');
    setTimeout(function () {
      console.log('[CCF] Showing popup now');
      showPopup();
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Cart tracking
  // ---------------------------------------------------------------------------
  function trackCartAdd() {
    document.addEventListener('click', async function (e) {
      var btn = e.target.closest(
        '[name="add"], .product-form__submit, button[type="submit"][form], [data-testid="add-to-cart"]'
      );
      if (!btn) return;
      var form =
        btn.closest('form[action*="/cart/add"]') || btn.closest('form[action="/cart/add"]');
      if (!form) return;

      console.log('[CCF] Add to cart detected');

      if (!localStorage.getItem('ccf_push_subscribed')) {
        if ('Notification' in window && Notification.permission === 'default') {
          showPopup();
        }
      }

      var token = localStorage.getItem('ccf_fcm_token');
      if (token) {
        fetch(BACKEND_URL + '/api/push/cart-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token: token,
            event: 'add_to_cart',
            url: window.location.href,
          }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) { console.log('[CCF] Cart activity tracked:', d); })
          .catch(function (err) { console.log('[CCF] Cart track error:', err); });
      } else {
        console.log('[CCF] No token yet for cart tracking');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Auto-initialize
  // ---------------------------------------------------------------------------
  function startCCF() {
    if (window.__ccfPushLoaded) return;
    window.__ccfPushLoaded = true;
    mount();
    trackCartAdd();
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCCF);
  } else {
    startCCF();
  }

  // Also try on load as fallback
  window.addEventListener('load', function () {
    if (!window.__ccfPushLoaded) startCCF();
  });
})();
