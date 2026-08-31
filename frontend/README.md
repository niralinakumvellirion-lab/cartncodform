# CartnCodForm — Frontend

Next.js 14 (App Router) + Tailwind CSS.

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_BACKEND_URL
npm run dev                   # http://localhost:3000
```

## Environment variables

| Key | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BACKEND_URL` | Base URL of the Express backend (default `http://localhost:4000`) |

## Pages

| Route | Description |
| --- | --- |
| `/` | Landing page (CartnCodForm branding) |
| `/dashboard` | Owner dashboard — all connected stores overview |
| `/dashboard/[shop]` | Single store view — Abandoned Carts + COD Orders tabs |
| `/install` | Shopify app install page |
| `/cod-form/[shop]` | Public COD order form (`?productName=...&price=...`) |

Dashboard routes share a dark-sidebar / white-content layout (`app/dashboard/layout.js`).
