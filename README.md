# Campus Exchange

A campus-only marketplace where students list, find, and exchange pre-owned books, calculators, lab supplies, and other items, so they get reused instead of thrown out.

Built for the ACM Online Buildathon (Sustainability / Campus Utility).

## Links

- **Live app:** _coming soon_
- **Demo video (3–5 min):** _coming soon_

## Features

- **Listings** with photos, description, category, and condition
- **Search, filter, and sort** across all listings
- **Inquiries and exchange requests** (buy, swap, or free)
- **Availability tracking**: sellers move items through Available → Reserved → Completed
- **Campus-only sign-up**: restricted to verified college email domains
- **360° condition view**: drag to rotate an item and inspect its condition from every angle

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, Tailwind CSS (installable PWA) |
| Hosting | Zoho Catalyst Slate |
| API | Catalyst Serverless Function (Node.js) |
| Database | Catalyst Data Store |
| Images | Catalyst Stratus |
| Auth | Catalyst Authentication |

## Run Locally

Requires Node 20+ and the Catalyst CLI (`npm i -g zcatalyst-cli`).

```bash
cd client
npm install
cp .env.example .env.development
cd ..
catalyst serve
```

## Team

- Aayush Lathi
