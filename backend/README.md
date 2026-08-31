# CartnCodForm — Backend

Node.js + Express + MongoDB (Mongoose) API for the CartnCodForm multi-store Shopify platform.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # then fill in real values
npm run dev            # nodemon, or `npm start`
```

## Exposing the backend with ngrok (required for local Shopify dev)

Shopify must reach your backend over a public **HTTPS** URL for the OAuth
callback and for webhook delivery. `localhost` will not work. Use ngrok to
tunnel to the local server:

1. Install ngrok globally:

   ```bash
   npm install -g ngrok
   ```

2. Start the backend (`npm run dev`), then in another terminal run:

   ```bash
   ngrok http 4000
   ```

3. Copy the HTTPS forwarding URL ngrok prints, e.g. `https://abc123.ngrok.io`.

4. Set it as `BACKEND_URL` in `backend/.env`:

   ```
   BACKEND_URL=https://abc123.ngrok.io
   ```

5. Also register that same URL as an **Allowed redirection URL**
   (`https://abc123.ngrok.io/api/auth/callback`) in your Shopify app settings.

The app uses `BACKEND_URL` to build the OAuth `redirect_uri` and the webhook
callback addresses. The free ngrok URL changes every restart — update
`BACKEND_URL` (and the Shopify redirect URL) each time.

## Seeding sample data

```bash
npm run seed
```

Creates one demo store (`cartncodform-demo.myshopify.com`) with 3 abandoned
customers (email / phone-only / anonymous) and 3 COD orders
(pending / confirmed / cancelled). Re-running it replaces the previous demo data.

## Environment variables (`.env`)

| Key | Purpose |
| --- | --- |
| `SHOPIFY_API_KEY` | Shopify app API key (client_id) |
| `SHOPIFY_API_SECRET` | Shopify app API secret (client_secret) |
| `SHOP_DOMAIN` | Default dev store, e.g. `your-store.myshopify.com` |
| `MONGODB_URI` | MongoDB connection string |
| `PORT` | API port (default `4000`) |
| `FRONTEND_URL` | Allowed CORS origin (default `http://localhost:3000`) |
| `BACKEND_URL` | Optional. Public backend URL used to build OAuth redirect + webhook addresses. Falls back to the request host. |

## Routes

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/auth/install?shop=<domain>` | Start Shopify OAuth |
| GET | `/api/auth/callback` | OAuth callback — saves store + token, registers webhooks |
| POST | `/api/webhooks/cart` | Receive `carts/create` + `carts/update` |
| POST | `/api/webhooks/checkout` | Receive `checkouts/create` + `checkouts/update` |
| GET | `/api/stores` | List connected stores (with counts) |
| GET | `/api/stores/:shopDomain/customers` | Abandoned customers for a store |
| GET | `/api/stores/:shopDomain/orders` | COD orders for a store |
| POST | `/api/cod/order` | Save a new COD order (public) |
| PATCH | `/api/cod/order/:id` | Update a COD order's status |

## Webhooks registered on install

`carts/create`, `carts/update`, `checkouts/create`, `checkouts/update`.
Cart topics POST to `/api/webhooks/cart`; checkout topics POST to `/api/webhooks/checkout`.
Every webhook logs its full payload to the console.

Both webhook routes verify the `X-Shopify-Hmac-Sha256` header against
`SHOPIFY_API_SECRET` and return **401 Unauthorized** if it does not match, so
`SHOPIFY_API_SECRET` must be set for real Shopify deliveries to be accepted.
Use `npm run seed` (not hand-rolled curl calls) to populate test data locally.

The Shopify Admin API version is pinned to **2025-01** in `utils/shopify.js`.
