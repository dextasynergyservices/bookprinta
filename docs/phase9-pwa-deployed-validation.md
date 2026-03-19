# Phase 9.12: Deployed HTTPS PWA Validation

Date: 2026-03-19

## Command

Run the deployed HTTPS verifier with:

```bash
PWA_WEB_BASE_URL="https://your-preview-or-staging-origin" \
PWA_VERCEL_BYPASS_TOKEN="your-vercel-bypass-token" \
npm run test:e2e:pwa-deployed
```

Optional update-cycle verification:

```bash
PWA_WEB_BASE_URL="https://your-preview-or-staging-origin" \
PWA_VERCEL_BYPASS_TOKEN="your-vercel-bypass-token" \
PWA_EXPECT_UPDATE=true \
npm run test:e2e:pwa-deployed
```

## What It Verifies

- deployed origin is served over HTTPS
- Chrome manifest parsing succeeds with no installability errors
- `sw.js` is registered, activated, and controlling the deployed page
- generated worker includes locale-aware offline fallbacks:
  - `/offline`
  - `/fr/offline`
  - `/es/offline`
- deployed precache contains the offline documents
- a deployed marketing page is cached and still renders offline from the service worker
- an uncached deployed route falls back to the localized offline page
- optional update-cycle polling can detect the `Update available` prompt after a second deploy

## Preview Protection Note

The current Vercel preview is protected by deployment authentication. Without a valid bypass token, Vercel returns `401 Authentication Required`, so Phase 9.12 cannot be fully completed against that preview yet.

The expected access pattern is:

```text
https://current-domain/current-pathname?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=$bypass_token
```

The deployed verifier handles this automatically when `PWA_VERCEL_BYPASS_TOKEN` is set.

## Current Branch Preview

- branch: `feat/pwa-verification-flow`
- branch commit: `e320e91e22b01e1f3821c9d3b6caa5e789e65d5c`
- preview origin discovered from GitHub checks:
  - `https://bookprinta-git-feat-pwa-verific-34a422-dextas-projects-18d82b9d.vercel.app`

## Update-Cycle Procedure

1. Run the verifier once without `PWA_EXPECT_UPDATE=true` to confirm the preview is reachable and controlled by the current worker.
2. Trigger a second deployment on the same preview alias.
3. Re-run the verifier with `PWA_EXPECT_UPDATE=true`.
4. The verifier reloads until the `Update available` prompt appears, then clicks `Reload` and confirms the updated worker takes control.
