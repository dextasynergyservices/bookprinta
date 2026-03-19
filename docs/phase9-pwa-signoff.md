# Phase 9.14: PWA Sign-Off

Date: 2026-03-19

## Overall Status

Conditional sign-off.

Implementation and local production verification are in place, but final release sign-off is still blocked by protected preview access and real device install checks.

## Verified Passed

- Local production PWA validation passed: service worker registration, locale-aware offline fallback, offline marketing cache, offline dashboard shell cache, and protected endpoint cache exclusions.
- Offline UI and mutation guards passed automated coverage: offline banner, offline page, disabled payment actions, disabled upload actions.
- Service-worker update prompt logic passed automated coverage.

Primary evidence:

- [phase9-pwa-local-validation.md](C:/Users/DEXTA-BUILD/Documents/bookprinta/docs/phase9-pwa-local-validation.md)
- [phase9-pwa-deployed-validation.md](C:/Users/DEXTA-BUILD/Documents/bookprinta/docs/phase9-pwa-deployed-validation.md)
- [apps/web/package.json](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/package.json)

## Acceptance Status

| Acceptance Criterion | Status | Evidence |
| --- | --- | --- |
| `/offline` page renders correctly | Pass | [phase9-pwa-local-validation.md](C:/Users/DEXTA-BUILD/Documents/bookprinta/docs/phase9-pwa-local-validation.md), [page.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/offline/page.test.tsx) |
| Offline banner appears when offline | Pass | [offline-status-banner.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/shared/offline-status-banner.test.tsx) |
| Offline banner hides when back online | Pass | [offline-status-banner.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/shared/offline-status-banner.test.tsx) |
| Upload and payment buttons disabled offline | Pass | [CheckoutView.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/checkout/CheckoutView.test.tsx), [PaymentMethodModal.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/checkout/PaymentMethodModal.test.tsx), [PayByTokenView.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(marketing)/pay/[token]/PayByTokenView.test.tsx), [manuscript-upload-flow.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/dashboard/manuscript-upload-flow.test.tsx), [reprint-same-modal.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/dashboard/reprint-same-modal.test.tsx), [BooksView.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(dashboard)/dashboard/books/BooksView.test.tsx) |
| Marketing pages load from cache offline | Pass | [phase9-pwa-local-validation.md](C:/Users/DEXTA-BUILD/Documents/bookprinta/docs/phase9-pwa-local-validation.md) |
| Payment and upload endpoints are not cached | Pass | [phase9-pwa-local-validation.md](C:/Users/DEXTA-BUILD/Documents/bookprinta/docs/phase9-pwa-local-validation.md), [cache-rules.test.ts](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/lib/pwa/cache-rules.test.ts) |
| App installs on Android Chrome correctly | Pending manual validation | Manifest parses cleanly, but real Android install prompt and standalone launch still need a physical-device check |
| App installs on iOS Safari correctly | Pending manual validation | Apple touch icon and Apple web app metadata are present, but Share -> Add to Home Screen still needs a real iPhone/iPad check |
| App installs on Desktop correctly | Pending manual validation | Manifest parses cleanly in Edge, but real Edge install prompt and standalone window launch still need manual confirmation |
| Service worker update prompts user to reload | Partial | [service-worker-update-prompt.test.tsx](C:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/shared/service-worker-update-prompt.test.tsx) passed; deployed two-build proof is still blocked by protected preview access |

## Manual Validation Still Required

- Android Chrome: install prompt, installed icon quality, splash screen, standalone launch
- iOS Safari: Add to Home Screen flow, home-screen icon, standalone launch
- Desktop Edge: install prompt, standalone launch, installed icon/splash
- Deployed update cycle: old build -> new build -> visible reload prompt

## Residual Risks

- The current Vercel preview is protected, so deployed HTTPS verification is not complete yet.
- Device-install UX cannot be fully proven from desktop emulation alone.
