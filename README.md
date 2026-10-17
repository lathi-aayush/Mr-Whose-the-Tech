# Campus Sibling

A campus-only marketplace where students list, find, and exchange pre-owned books, calculators, lab supplies, and hostel gear, so they get reused instead of thrown out.

Built for the ACM Online Buildathon (Sustainability / Campus Utility).

## Links

- **Live app:** https://campussibling-wnfeccgs.onslate.in
- **Demo video (3–5 min):** _coming soon_

> **Demo note:** the app is built for a single campus and normally accepts only `@vit.edu` emails. For judging, sign-up is open to any email so you can try it. Set `ALLOWED_EMAIL_DOMAINS` back to `vit.edu` to lock it to one campus.

## Problem

Every semester, seniors throw away or hoard textbooks, calculators and lab coats that juniors then buy new. WhatsApp groups bury listings within hours, have no search, and give no way to know whether an item is still available.

## Solution

One searchable board, limited to verified students of one campus (`@vit.edu`), where every item has a clear status.

1. A seller lists an item with photos, category, condition, and whether it's for sale, swap, or free.
2. Buyers search, filter, and sort, then send an inquiry with a message.
3. The seller accepts one inquiry. The item flips to **Reserved**, other pending requests are declined, and both sides see each other's email.
4. After the handover the seller marks it **Completed**, and it drops out of the default browse.

## Features

- **Listings** with up to 5 photos (compressed in the browser), description, category, and condition
- **Search, filter, and sort** by text, category, condition, type, status, date, and price; filters live in the URL so results are shareable
- **Inquiries and exchange requests** for buying, swapping, or taking free items
- **Status tracking** Available → Reserved → Completed, enforced on the server
- **Campus-only accounts**: sign-up is rejected unless the email domain matches (`ALLOWED_EMAIL_DOMAINS`; `*` opens it for the demo)
- **Contact privacy**: emails are revealed only after a seller accepts
- Installable on phones (PWA manifest), skeleton loaders, keyboard shortcut `/` to search

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4 |
| Hosting | Zoho Catalyst Slate |
| API | Catalyst Advanced I/O Function (Node.js 20) |
| Database | Catalyst Data Store (ZCQL) |
| Images | Catalyst Stratus (pre-signed direct uploads) |
| Auth | Catalyst Embedded Authentication |

## Why This Stack

- **Catalyst** puts hosting, auth, database, and file storage in one free-tier project, hosted in an Indian data centre close to our users.
- **Serverless function**: no server to keep running; the API scales to zero between demos.
- **Pre-signed Stratus uploads**: photos go straight from the phone to storage, so the function never handles large files.
- **React + Vite + Tailwind**: fast iteration and a consistent design system with very little custom CSS.

## Run Locally

Requires Node 20+ and the Catalyst CLI (`npm i -g zcatalyst-cli`).

```bash
cd functions/api && npm install && npm test && cd ../..
cd client && npm install && cp .env.example .env.development && cd ..
catalyst serve            # API on http://localhost:3000/server/api
cd client && npm run dev  # frontend on http://localhost:5173
```

The function needs `ALLOWED_EMAIL_DOMAINS`, `APP_URL` (where sign-up emails return users), `AUTH_ZAID`, `STRATUS_BUCKET`, and `STRATUS_PUBLIC_BASE` in `functions/api/catalyst-config.json`.

## Team

- Aayush Lathi
