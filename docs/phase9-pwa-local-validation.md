# Phase 9.11: Local Production PWA Validation

Date: 2026-03-19

## Command

Run the local production PWA validation with:

```bash
npm run test:e2e:pwa-local
```

The verifier expects:

- web app served from `http://localhost:3000`
- API served from `http://localhost:3001`
- local seeded admin available at `admin@bookprinta.local`

## What It Verifies

- Chrome manifest parsing succeeds with no errors
- `sw.js` is registered, activated, and controlling the page
- precache includes locale-aware offline documents:
  - `/offline`
  - `/fr/offline`
  - `/es/offline`
- runtime caches are populated for:
  - marketing pages
  - dashboard shell pages
  - read-only API responses
- offline marketing navigation loads from the cached marketing route
- offline dashboard navigation stays on the cached dashboard shell route
- offline cache-miss navigation resolves to the localized offline experience
- payment, upload, and webhook endpoints do not appear in Cache Storage

## Verified Result

Local production validation passed on the built app.

Observed cache buckets:

- `serwist-precache-v2-http://localhost:3000/`
- `marketing-pages`
- `marketing-rsc`
- `dashboard-shell-pages`
- `dashboard-shell-rsc`
- `api-read-models`
- `next-image-assets`

Observed service worker state:

- script URL: `/sw.js`
- scope: `/`
- state: `activated`

Observed offline behaviors:

- `/fr/about` loaded offline from the service worker and preserved rendered marketing content
- `/fr/dashboard/books` loaded offline from the service worker and preserved rendered dashboard shell content
- `/fr/pwa-local-offline-miss` resolved through the service worker as the localized offline fallback path

Observed cache-policy protections:

- read-only API entries appeared in `api-read-models`
- payment, upload, and webhook requests were absent from Cache Storage

## Local Environment Note

This verifier should be run against `http://localhost:3000`, not an alternate local web port, because the API CORS configuration is currently aligned to the frontend origin configured in `apps/api/.env`.
