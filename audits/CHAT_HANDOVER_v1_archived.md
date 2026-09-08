# CartnCodForm — Chat Handover
Date: September 2, 2026

## How to Use This File
Share this file content in a new Claude chat to continue 
the project exactly where we left off.

---

## Project Summary
CartnCodForm is a multi-store Shopify SaaS platform that:
- Tracks abandoned carts and checkout events via Shopify webhooks
- Captures customer details and cart items
- Lets store owners send reminders via Push, WhatsApp, Email
- Provides a COD (Cash on Delivery) order form for customers

## Live URLs
- Frontend: https://cartncodform-beryl.vercel.app
- Backend: https://cartncodform-backend.onrender.com
- GitHub: https://github.com/niralinakumvellirion-lab/cartncodform
- Dev Store: cartncod-form.myshopify.com

## Local Project Path
D:\cartncodform\

## Tech Stack
- Frontend: Next.js 14 (App Router) → Vercel
- Backend: Node.js + Express → Render (free)
- Database: MongoDB Atlas M0 (free)
- Auth: NextAuth.js (Google Login)
- Email: Resend (free tier)
- Push: Firebase FCM
- Shopify: Partner App + App Embed Block + App Proxy

---

## Working Method (IMPORTANT - Follow This Always)
1. Audit existing work first before making changes
2. Write all audit reports to .txt files (not inline)
3. Generate Claude Code prompts for implementation
4. Every Claude Code prompt must end with self-audit written to audit.txt
5. Paste audit.txt back to Claude chat before proceeding
6. Keep responses short and skimmable

---

## Completed Features ✅
- Shopify OAuth (store connect/disconnect)
- Webhook handlers (carts + checkouts)
- HMAC webhook verification
- Multi-store dashboard with Google Login
- Mobile responsive UI (hamburger menu)
- Abandoned cart tracking with customer details
- Product image fetch via Shopify Admin API
- COD Order Form (public page)
- Email notifications (Resend)
- WhatsApp button (wa.me link - zero cost, no API)
- Owner push notifications (Firebase FCM)
- Customer push notifications via App Embed + App Proxy
- Creative popup (countdown, discount badge, benefits list)
- Token check: popup only if no existing FCM token
- Stale token auto-cleanup
- Single token per device
- Cart add tracking
- Foreground + background notification handlers
- Disconnect store feature
- Backend deployed on Render
- Frontend deployed on Vercel
- MongoDB Atlas connected
- UptimeRobot keeping Render alive

---

## Current Issue 🔴 (Where We Stopped)

### Problem
Android push notification shows correctly BUT product image 
is not displayed. Cart shopping icon shows instead.

### Root Cause Found
1. Cart webhooks (carts/create, carts/update) do NOT include 
   product images in line_items payload
2. fetchProductImage() in webhooks.js calls Shopify Admin API 
   after save to get product image → works ✅
3. Image saved to AbandonedCustomer.productImageUrl ✅
4. BUT dashboard SendPushButton was using:
   cartItems?.[0]?.imageUrl (always null for cart webhooks)
5. FIXED to use: productImageUrl || cartItems?.[0]?.imageUrl

### Last Fix Applied (Not Yet Tested)
File: frontend/app/dashboard/[shop]/page.js
- SendPushButton now accepts productImageUrl prop
- Uses productImageUrl first, falls back to cartItems image

### Debug Logs Added (Already in Code)
- backend/utils/pushNotification.js logs imageUrl received
- backend/routes/push.js logs imageUrl from request
- backend/routes/webhooks.js logs Final productImageUrl

### What Needs Testing
1. npm run delete:subs (clear all stale tokens)
2. Fresh Android Chrome subscribe on store
3. Add product to cart → leave page (triggers webhook)
4. Check Render logs:
   [webhook] Final productImageUrl before push: https://cdn.shopify.com/...
5. Owner dashboard → Abandoned Carts → 🔔 Push button
6. Check Render logs:
   [send-customer] imageUrl from request: https://cdn.shopify.com/...
   [push-customer] imageUrl received: https://cdn.shopify.com/...
7. Android notification → product image show?

---

## Key Files to Read First

### For Current Issue:
1. backend/routes/webhooks.js
   - mapPayloadToCustomer() - extracts cart data
   - fetchProductImage() - fetches image from Admin API
   - handleWebhook() - saves + sends push with image

2. backend/utils/pushNotification.js
   - sendPushToCustomers() - FCM send with webpush image

3. backend/public/cartncodform-sw.js
   - onBackgroundMessage handler - shows notification with image

4. extensions/cartncodform-embed/blocks/push-notifications.liquid
   - App Embed block - customer push subscription

5. frontend/app/dashboard/[shop]/page.js
   - SendPushButton component - sends push with productImageUrl

---

## NPM Scripts (run from backend/)
npm run dev                 # Local development
npm run seed               # Seed demo data
npm run test:push          # Test owner push
npm run test:customer:push # Test customer push (real store)
npm run check:subs         # List customer subscriptions
npm run clean:tokens       # Remove stale/duplicate tokens
npm run delete:subs        # Delete ALL customer subscriptions
npm run add:scripttags     # Add ScriptTag to stores
npm run remove:scripttags  # Remove ScriptTag from stores

---

## Environment Variables

### Render (backend)
SHOPIFY_API_KEY=b2cafd271c21b90a630528234402b0a1
SHOPIFY_API_SECRET=<in Render dashboard>
MONGODB_URI=<in Render dashboard>
FRONTEND_URL=https://cartncodform-beryl.vercel.app
BACKEND_URL=https://cartncodform-backend.onrender.com
RESEND_API_KEY=<in Render dashboard>
FROM_EMAIL=onboarding@resend.dev
TEST_OWNER_EMAIL=<owner email>
FIREBASE_PROJECT_ID=cartncodform
FIREBASE_CLIENT_EMAIL=<in Render dashboard>
FIREBASE_PRIVATE_KEY=<in Render dashboard>

### Vercel (frontend)
NEXT_PUBLIC_BACKEND_URL=https://cartncodform-backend.onrender.com
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU
NEXT_PUBLIC_FIREBASE_PROJECT_ID=cartncodform
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=133172185047
NEXT_PUBLIC_FIREBASE_APP_ID=1:133172185047:web:23be3ca1f3ccf357a62d92
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BMPrLf4eInbFu1IpI_ZqyblmkbSYIm0JyukselN80lglfwuBfyaU7kOQZ6FFxo1PjUqh1xnGzd2uVPdJrYEh0Jo
NEXTAUTH_SECRET=<in Vercel dashboard>
NEXTAUTH_URL=https://cartncodform-beryl.vercel.app
GOOGLE_CLIENT_ID=<in Vercel dashboard>
GOOGLE_CLIENT_SECRET=<in Vercel dashboard>

---

## Firebase Config
API Key: AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU
Project ID: cartncodform
Sender ID: 133172185047
App ID: 1:133172185047:web:23be3ca1f3ccf357a62d92
VAPID: BMPrLf4eInbFu1IpI_ZqyblmkbSYIm0JyukselN80lglfwuBfyaU7kOQZ6FFxo1PjUqh1xnGzd2uVPdJrYEh0Jo

---

## Shopify App Info
- App name: CartnCodForm
- Client ID: b2cafd271c21b90a630528234402b0a1
- Current version: cartncodform-17
- App Proxy: /apps/cartncodform/ → Render backend
- App Embed: push-notifications.liquid (cartncodform-push handle)
- Scopes: read_orders, read_customers, write_customers,
          write_script_tags, read_script_tags, read_products
- Dev store: cartncod-form.myshopify.com

---

## Known Issues & Workarounds

### Chrome Dangerous Site Warning (OAuth)
Cause: onrender.com flagged by Chrome Safe Browsing
Fix: Type "thisisunsafe" on red warning page
Long-term: Buy custom domain

### Render Cold Start (15min sleep)
Fix: UptimeRobot pings every 5min (already setup)
Workaround: Open backend URL first, wait for status:ok

### MongoDB DNS on Windows
Fix: All local scripts use dns.setServers(['8.8.8.8','1.1.1.1'])

### Stale FCM Tokens
Fix: npm run clean:tokens or npm run delete:subs
Auto-cleanup: Added in pushNotification.js

### SW Scope for FCM
Fix: Blob URL registration for root scope /
SW served via App Proxy with Service-Worker-Allowed: / header

---

## Pending Features
- [ ] Product image in Android notification (current issue)
- [ ] iOS PWA push notifications
- [ ] Cart → Recovered auto status update
- [ ] Pagination on dashboard tables
- [ ] Analytics/charts dashboard
- [ ] Subscription billing (Razorpay)
- [ ] SMS notifications (MSG91 + DLT)
- [ ] Shopify App Store publish
- [ ] Web Pixels API for full journey tracking

---

## Next Steps After Current Issue Fixed
1. iOS PWA push setup
2. Cart recovered status
3. Analytics dashboard
4. Shopify App Store submission prep
