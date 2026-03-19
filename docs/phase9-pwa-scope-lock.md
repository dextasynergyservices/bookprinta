# Phase 9.1 - PWA Scope Lock + Acceptance Traceability

## Purpose

Lock the authoritative Phase 9 PWA scope before implementation starts.

This document reconfirms every PWA requirement from `CLAUDE.md` Section 23, Section 23.4, Section 23.5, Constraints 26 and 27, and the Phase 9 checklist. It also provides a traceability matrix so each acceptance criterion has:

- one primary code area
- one automated test target
- one manual verification step

## Source Of Truth

- [CLAUDE.md](../CLAUDE.md): Phase 9 checklist, Section 23, Section 23.4, Section 23.5, Constraints 26 and 27
- [bookprinta-diagrams.jsx](../bookprinta-diagrams.jsx): architecture reference for the PWA lane
- Phase 9 task brief: install flow, offline page, service worker, caching, and update cycle

## Architecture Reference

The architecture diagram already expects the following PWA contract:

- installable app
- offline support (basic)
- precached static assets
- network-first for API
- branded `/offline` page

That expectation appears in [bookprinta-diagrams.jsx](../bookprinta-diagrams.jsx) and must remain true after implementation.

## Scope

- Serwist service worker configuration and client registration
- Web App Manifest completeness and installability assets
- localized offline page
- global offline banner and online-state handling
- runtime caching rules
- offline behavior for marketing pages and dashboard shell
- blocking of offline mutations for payments, uploads, approvals, and related submissions
- Android Chrome, iOS Safari, and Desktop Edge install verification
- service worker update prompt and reload cycle

## Non-Goals

- push notifications, which remain deferred per Section 23.6
- offline form submission queueing
- offline payment queueing
- offline upload queueing
- introducing frontend API routes for PWA behavior

## Locked Requirements Inventory

| ID | Locked requirement | Source | Primary code area | Verification owner |
|---|---|---|---|---|
| PWA-001 | The frontend PWA stack must use Serwist with generated service worker output and production-only enablement. | CLAUDE 23.1-23.3 | [apps/web/next.config.ts](../apps/web/next.config.ts) | build + browser SW registration check |
| PWA-002 | The service worker must expose a branded offline document fallback. | CLAUDE 23.3, 23.5 | [apps/web/sw.ts](../apps/web/sw.ts) | worker fallback test + offline navigation check |
| PWA-003 | The Web App Manifest must include install metadata and icons for `192x192`, `512x512`, and `maskable`. | CLAUDE 23.3 | [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | manifest unit test + DevTools Manifest panel |
| PWA-004 | The app must ship a branded offline page at `app/[locale]/offline/page.tsx`. | task brief, CLAUDE 23.3, 23.5 | `apps/web/app/[locale]/offline/page.tsx` | route render test + offline fallback check |
| PWA-005 | Static assets must be precached at build time until next deploy. | CLAUDE 23.4 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + Cache Storage inspection |
| PWA-006 | Marketing pages (`/`, `/pricing`, `/about`) must use `StaleWhileRevalidate` with a 1 hour TTL. | CLAUDE 23.4 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + offline marketing reload |
| PWA-007 | Dashboard shell routes must use `StaleWhileRevalidate` with a 30 minute TTL. | CLAUDE 23.4 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + offline dashboard shell reload |
| PWA-008 | Read-only API responses must use `NetworkFirst` with a 5 minute fallback. | CLAUDE 23.4, Constraint 26 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + offline read API fallback |
| PWA-009 | Fonts must use `CacheFirst` with a 1 year retention window. | CLAUDE 23.4 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test |
| PWA-010 | Paged.js preview assets must stay `NetworkOnly`. | CLAUDE 23.4 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + preview network inspection |
| PWA-011 | Payment flows must stay `NetworkOnly` and must never be cached. | CLAUDE 23.4, Constraint 26 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + payment request inspection |
| PWA-012 | File upload flows must stay `NetworkOnly` and must never be cached. | CLAUDE 23.4, Constraint 26 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + upload request inspection |
| PWA-013 | Webhook endpoints must stay `NetworkOnly` and must never be cached. | CLAUDE 23.4, Constraint 26 | [apps/web/sw.ts](../apps/web/sw.ts) | runtime caching test + route matcher review |
| PWA-014 | The service worker must not intercept payment endpoints, webhook routes, file upload requests, or unsafe NestJS API traffic beyond the approved cache strategy. | Constraint 26 | [apps/web/sw.ts](../apps/web/sw.ts) | matcher coverage test + network verification |
| PWA-015 | When offline, the UI must show a sticky top banner with the exact offline message and hide it automatically when the connection returns. | CLAUDE 23.5, Constraint 27 | `apps/web/components/shared/offline-banner.tsx` | component test + browser offline toggle |
| PWA-016 | When offline, cached marketing pages and dashboard shell must still load from cache. | CLAUDE 23.5 | [apps/web/sw.ts](../apps/web/sw.ts) | offline E2E + DevTools offline reload |
| PWA-017 | When offline, upload buttons, payment buttons, approve button, and form submissions must be disabled. | CLAUDE 23.5, Constraint 27 | `apps/web/hooks/use-online-status.ts` | offline action-guard E2E |
| PWA-018 | Order status should expose cached data with a last-updated indicator when offline. | CLAUDE 23.5 | `apps/web/app/[locale]/(dashboard)/dashboard/orders/[id]/OrderTrackingView.tsx` | component test + offline dashboard order check |
| PWA-019 | Uncached document navigations must resolve to the offline fallback page. | CLAUDE 23.5 | [apps/web/sw.ts](../apps/web/sw.ts) | offline E2E + direct uncached route navigation |
| PWA-020 | Offline mutations are forbidden. No queueing for forms, payments, or uploads is allowed. | CLAUDE 23.5, Constraint 27 | `apps/web/hooks/use-online-status.ts` | mutation guard test + offline interaction check |
| PWA-021 | Install flow must work on Android Chrome, iOS Safari, and Desktop Edge. | Phase 9 checklist, acceptance criteria | [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | manifest/metadata test + device/browser install matrix |
| PWA-022 | New deploys must surface an update prompt and allow the user to reload into the new service worker version. | Phase 9 checklist | `apps/web/components/shared/sw-update-prompt.tsx` | update prompt test + two-build manual deploy cycle |

## Phase 9 Checklist Coverage

| Checklist item | Locked requirement IDs | Primary code area | Automated test target | Manual verification step |
|---|---|---|---|---|
| Verify Serwist service worker configured correctly in `next.config.ts` | PWA-001 | [apps/web/next.config.ts](../apps/web/next.config.ts) | `apps/web/sw.test.ts` | run production build, confirm worker output and registration in DevTools |
| Verify `app/manifest.ts` has correct icons | PWA-003, PWA-021 | [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | `apps/web/app/manifest.test.ts` | open Application -> Manifest and confirm `192`, `512`, `maskable` |
| Create `/offline` page with branded design and reload CTA | PWA-004 | `apps/web/app/[locale]/offline/page.tsx` | `apps/web/app/[locale]/offline/page.test.tsx` | load `/en/offline` on mobile viewport and verify branding + reload action |
| Implement offline banner component | PWA-015 | `apps/web/components/shared/offline-banner.tsx` | `apps/web/components/shared/offline-banner.test.tsx` | toggle browser offline and verify show/hide behavior |
| Disable upload buttons and payment buttons while offline | PWA-017, PWA-020 | `apps/web/hooks/use-online-status.ts` | `e2e/tests/pwa-offline-action-guard.spec.ts` | go offline during checkout and manuscript flows and verify disabled controls |
| Verify caching strategy from Section 23.4 | PWA-005 through PWA-014 | [apps/web/sw.ts](../apps/web/sw.ts) | `apps/web/sw.test.ts` | inspect DevTools Cache Storage + Network for each cache class |
| Test install flow on Android Chrome | PWA-021 | [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | `apps/web/app/manifest.test.ts` | Add to Home Screen on Android Chrome and launch standalone |
| Test install flow on iOS Safari | PWA-021 | [apps/web/app/layout.tsx](../apps/web/app/layout.tsx) | `apps/web/app/pwa-metadata.test.ts` | Share -> Add to Home Screen on iPhone/iPad and launch standalone |
| Test install flow on Desktop Microsoft Edge | PWA-021 | [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | `apps/web/app/manifest.test.ts` | use Edge install prompt and launch standalone window |
| Test offline behavior for cached and uncached pages | PWA-015 through PWA-020 | [apps/web/sw.ts](../apps/web/sw.ts) | `e2e/tests/pwa-offline-cache.spec.ts` | warm cache online, switch offline, reload marketing, dashboard, and uncached pages |
| Test service worker update cycle | PWA-022 | `apps/web/components/shared/sw-update-prompt.tsx` | `e2e/tests/pwa-update-cycle.spec.ts` | load build A, deploy build B, confirm update prompt and reload |

## Acceptance Traceability Matrix

| Acceptance criterion | Locked requirement IDs | Primary code area | Automated test target | Manual verification step | Current baseline |
|---|---|---|---|---|---|
| `/offline` page renders correctly (branded, mobile-first) | PWA-004, PWA-019 | `apps/web/app/[locale]/offline/page.tsx` | `apps/web/app/[locale]/offline/page.test.tsx` | open localized offline route on mobile viewport and confirm logo, fonts, colors, CTA | Missing |
| Offline banner appears when `navigator.onLine = false` | PWA-015 | `apps/web/components/shared/offline-banner.tsx` | `apps/web/components/shared/offline-banner.test.tsx` | toggle DevTools offline and confirm sticky banner appears at top | Missing |
| Offline banner hides when back online | PWA-015 | `apps/web/components/shared/offline-banner.tsx` | `apps/web/components/shared/offline-banner.test.tsx` | restore network and confirm animated banner exit | Missing |
| Upload and payment buttons disabled offline | PWA-017, PWA-020 | `apps/web/hooks/use-online-status.ts` | `e2e/tests/pwa-offline-action-guard.spec.ts` | verify checkout payment, quote payment, upload, and approve actions are disabled offline | Missing |
| Marketing pages load from cache offline | PWA-006, PWA-016 | [apps/web/sw.ts](../apps/web/sw.ts) | `e2e/tests/pwa-offline-cache.spec.ts` | warm `/`, `/pricing`, `/about`, switch offline, reload each route | Partial |
| Payment and upload endpoints NOT cached (`NetworkOnly`) | PWA-011, PWA-012, PWA-014 | [apps/web/sw.ts](../apps/web/sw.ts) | `apps/web/sw.test.ts` | inspect `payments/*` and upload requests in Network and Cache Storage | Failing baseline |
| App installs on Android Chrome correctly | PWA-003, PWA-021 | [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | `apps/web/app/manifest.test.ts` | install from Android Chrome and verify icon, splash, standalone launch | Partial |
| App installs on iOS Safari correctly | PWA-003, PWA-021 | [apps/web/app/layout.tsx](../apps/web/app/layout.tsx) | `apps/web/app/pwa-metadata.test.ts` | add to home screen from iOS Safari and verify standalone launch | Unverified |
| App installs on Desktop correctly | PWA-003, PWA-021 | [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | `apps/web/app/manifest.test.ts` | install from Edge and verify standalone launch + icon | Partial |
| Service worker update prompts user to reload | PWA-022 | `apps/web/components/shared/sw-update-prompt.tsx` | `e2e/tests/pwa-update-cycle.spec.ts` | load old build, publish new build, confirm reload prompt appears | Missing |

## Primary User-Facing Surfaces To Cover

These are the high-risk surfaces that must be included when wiring offline guards:

- [apps/web/components/checkout/PaymentMethodModal.tsx](../apps/web/components/checkout/PaymentMethodModal.tsx)
- [apps/web/app/[locale]/checkout/CheckoutView.tsx](../apps/web/app/[locale]/checkout/CheckoutView.tsx)
- `apps/web/app/[locale]/(marketing)/pay/[token]/PayByTokenView.tsx`
- [apps/web/components/dashboard/manuscript-upload-flow.tsx](../apps/web/components/dashboard/manuscript-upload-flow.tsx)
- [apps/web/components/dashboard/reprint-same-modal.tsx](../apps/web/components/dashboard/reprint-same-modal.tsx)
- `apps/web/app/[locale]/(dashboard)/dashboard/books/BooksView.tsx`
- `apps/web/app/[locale]/(admin)/admin/payments/AdminPaymentsView.tsx`

## Baseline Audit Snapshot

This snapshot records the repo state before Phase 9 implementation starts.

| Area | Baseline finding | Impact on Phase 9 |
|---|---|---|
| [apps/web/sw.ts](../apps/web/sw.ts) | current worker forces `/api/v1/*` through `NetworkOnly` | conflicts with the locked `NetworkFirst` rule for read API fallback |
| [apps/web/app/manifest.ts](../apps/web/app/manifest.ts) | current manifest has `192` and `512`, but no `maskable` icon entry | installability is incomplete |
| `apps/web/app/[locale]/offline/page.tsx` | route does not exist | offline fallback acceptance cannot pass |
| global online-state layer | no shared `navigator.onLine` hook/provider is present | offline banner and disabled-action logic have no central source |
| service worker update UX | no update prompt component is present | update-cycle acceptance cannot pass |
| client registration surface | no explicit Serwist UI provider/update integration is mounted in the locale shell | update UX and online cache messaging still need to be added |

## Exit Criteria For Phase 9.1

- all PWA requirements are locked in one document
- every Phase 9 checklist item is mapped to a code area, automated test, and manual verification step
- every acceptance criterion is mapped to a primary code area, automated test target, and manual verification step
- the current repo baseline is recorded so implementation can be measured against it
