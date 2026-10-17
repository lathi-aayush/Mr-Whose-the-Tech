# Campus Sibling Setup

Run the app locally or deploy your own copy on Zoho Catalyst.

## Requirements

- Node.js 20+
- Catalyst CLI: `npm i -g zcatalyst-cli`, then `catalyst login`
- A Catalyst project with Data Store, Stratus, Authentication and Mail enabled

## Run Locally

```bash
cd functions/api && npm install && npm test && cd ../..
cd client && npm install && cp .env.example .env.development && cd ..
catalyst serve            # API on http://localhost:3000/server/api
cd client && npm run dev  # frontend on http://localhost:5173
```

## Environment Variables

Set these in `functions/api/catalyst-config.json`:

| Variable | Purpose |
|---|---|
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated sign-up domains, e.g. `vit.edu`. `*` allows any email (demo mode). |
| `APP_URL` | Where sign-up confirmation emails send users back to. |
| `AUTH_ZAID` | Catalyst Authentication ZAID (differs between Development and Production). |
| `STRATUS_BUCKET` | Stratus bucket name for listing photos. |
| `STRATUS_PUBLIC_BASE` | Public base URL of that bucket. |
| `MAIL_FROM` | Verified sender address in Catalyst Mail. Without it, emails are skipped and logged. |

To send email through your own SMTP account instead of Catalyst Mail, create `functions/api/secrets.json` (gitignored, deployed with the function):

```json
{ "SMTP_HOST": "smtp.gmail.com", "SMTP_PORT": "465", "SMTP_USER": "you@example.com", "SMTP_PASS": "app-password", "SMTP_FROM": "you@example.com" }
```

## Deploy

```bash
catalyst deploy --only functions
cd client && npx vite build && cd ..
catalyst deploy slate campussibling -m "release" -ni
```

See [HANDBOOK.md](HANDBOOK.md) for the Data Store tables and columns the API expects.
