# Phase 0 - Auth + Homepage Performance Baseline

## Purpose

Lock the production performance contract for two paths before implementing fixes:

- user login
- homepage public sections that depend on backend data (`pricing/packages` and featured `showcase`)

This document is the Phase 0 source of truth for the performance workstream.

## Source Of Truth

- [CLAUDE.md](/c:/Users/DEXTA-BUILD/Documents/bookprinta/CLAUDE.md): Section 10 (Performance Targets), Section 11 (Security), Section 18.1b (Render cold starts), Section 26 (Showcase)
- Current auth implementation in [auth.service.ts](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.service.ts), [auth.controller.ts](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.controller.ts), and [login/page.tsx](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(auth)/login/page.tsx)
- Current homepage implementation in [page.tsx](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(marketing)/page.tsx), [pricing-preview.tsx](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/marketing/home/pricing-preview.tsx), [PricingCards.tsx](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/marketing/pricing/PricingCards.tsx), [showcase-preview.tsx](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/marketing/home/showcase-preview.tsx), [usePackages.ts](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/hooks/usePackages.ts), [use-showcase.ts](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/hooks/use-showcase.ts), and [showcase.ts](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/lib/api/showcase.ts)

## Scope

- `POST /api/v1/auth/login`
- `/login` frontend submit path
- homepage pricing preview section
- homepage featured showcase preview section
- production hosting assumptions for Vercel frontend + Render API

## Non-Goals

- No login optimization implementation in this phase
- No homepage SSR refactor in this phase
- No auth schema/index migration in this phase
- No showcase backend implementation in this phase

## Locked Production Targets

### Login

- Warm login `p95 < 4s`
- Warm login `p50 < 2s`
- Cold-start login must not exceed `10s`
- Generic frontend login failure (`Unable to log in right now`) must be exceptional, not part of normal login behavior

### Homepage

- `pricing/packages` content must be visible in the initial HTML response
- featured `showcase` content must be visible in the initial HTML response
- homepage `LCP < 2.5s`
- public homepage sections must not wait for client-side backend fetches before content appears

## Locked Intended Architecture

### Login Path

1. Frontend executes reCAPTCHA once.
2. Frontend posts credentials to `/api/v1/auth/login`.
3. Backend verifies reCAPTCHA.
4. Backend performs one normalized user lookup.
5. Backend performs one password comparison.
6. Backend issues cookies and persists the refresh-token record.

Design rules:

- Warm login should complete within the target budget above.
- Cold starts are an infrastructure failure mode, not acceptable steady-state behavior.
- Login timing must be attributable to concrete steps, not hidden behind generic errors.

### Homepage Pricing Preview

1. Homepage server fetches public package-category data.
2. Response is cached/revalidated on the server.
3. Initial HTML already contains package content.
4. Client code may enhance the UI, but must not gate first paint of pricing content.

Reference implementation pattern already exists on the full pricing page: [pricing/page.tsx](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(marketing)/pricing/page.tsx)

### Homepage Featured Showcase Preview

1. Homepage server fetches featured showcase entries only.
2. Response is cached/revalidated on the server.
3. Initial HTML already contains featured showcase cards.
4. Full filter/search/infinite-scroll behavior remains on `/showcase`, not on the homepage.

This is explicitly required by `CLAUDE.md`: the homepage gets a small featured section, while the full showcase experience lives on `/showcase`: [CLAUDE.md:3438](/c:/Users/DEXTA-BUILD/Documents/bookprinta/CLAUDE.md:3438)

### Infrastructure

- Frontend is hosted on Vercel
- Backend is hosted on Render
- Render free-tier cold starts are a known risk and are explicitly called out in `CLAUDE.md`: [CLAUDE.md:2654](/c:/Users/DEXTA-BUILD/Documents/bookprinta/CLAUDE.md:2654)
- External keep-alive pings are a mitigation, not the final professional solution
- Production target remains a non-sleeping API service tier

## Current Implementation Snapshot

### Login

Current code path:

1. Frontend waits for `executeRecaptcha("login_form")`: [login/page.tsx:181](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(auth)/login/page.tsx:181)
2. Frontend sends `POST /api/v1/auth/login`: [login/page.tsx:184](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(auth)/login/page.tsx:184)
3. Backend verifies reCAPTCHA against Google in production: [auth.service.ts:359](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.service.ts:359), [auth.service.ts:1062](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.service.ts:1062)
4. Backend either:
   - does a single email lookup + `bcrypt.compare`, or
   - builds multiple phone candidates and loops through matching users with repeated `bcrypt.compare`: [auth.service.ts:907](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.service.ts:907)
5. Backend issues tokens and hashes/stores the refresh token with bcrypt cost `12`: [auth.service.ts:50](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.service.ts:50), [auth.service.ts:760](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.service.ts:760)

Operational constraints:

- Login endpoint is throttled to `10 req/min`: [auth.controller.ts:38](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.controller.ts:38)
- reCAPTCHA verification times out after `5000ms`: [auth.service.ts:1066](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/src/auth/auth.service.ts:1066)
- Generic frontend failure message is emitted on network/request failure, not on standard auth rejection: [login/page.tsx:239](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(auth)/login/page.tsx:239)

### Homepage Pricing Preview

Current code path:

1. Homepage renders `<PricingPreview />`: [page.tsx:24](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(marketing)/page.tsx:24)
2. `PricingPreview` renders client-side `<PricingCards />`: [pricing-preview.tsx:43](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/marketing/home/pricing-preview.tsx:43)
3. `PricingCards` fetches data in the browser with `usePackageCategories()`: [PricingCards.tsx:467](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/marketing/pricing/PricingCards.tsx:467)
4. `usePackageCategories()` calls `fetch(`${API_V1_BASE_URL}/package-categories`)`: [usePackages.ts:64](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/hooks/usePackages.ts:64), [usePackages.ts:72](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/hooks/usePackages.ts:72)

Conclusion:

- pricing content is not in initial HTML today
- pricing content depends on hydration + browser fetch to backend

### Homepage Featured Showcase Preview

Current code path:

1. Homepage renders `<ShowcasePreview />`: [page.tsx:25](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/app/[locale]/(marketing)/page.tsx:25)
2. `ShowcasePreview` fetches data client-side through `useShowcase()`: [showcase-preview.tsx:17](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/components/marketing/home/showcase-preview.tsx:17)
3. `useShowcase()` uses `useInfiniteQuery()` against `/api/v1/showcase`: [use-showcase.ts:7](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/hooks/use-showcase.ts:7)
4. `showcase.ts` uses a plain browser `fetch()` with no timeout before falling back: [showcase.ts:52](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/web/lib/api/showcase.ts:52)

Current repo gap:

- `CLAUDE.md` requires public showcase endpoints: [CLAUDE.md:3469](/c:/Users/DEXTA-BUILD/Documents/bookprinta/CLAUDE.md:3469)
- this branch does not currently show a corresponding `showcase` controller/service implementation under `apps/api/src`

Conclusion:

- featured showcase content is not in initial HTML today
- homepage showcase preview is waiting on a client-side API call that may fail or stall before fallback
- current implementation does not match the intended homepage featured-showcase architecture in `CLAUDE.md`

## Baseline Status Matrix

| Path / Metric | Target | Current Baseline | Confidence | Status |
|---|---|---|---|---|
| Warm login p95 | `< 4s` | Not emitted by current system | Low | Unknown |
| Warm login p50 | `< 2s` | Not emitted by current system | Low | Unknown |
| Cold login p95 | `< 10s` | User-reported `> 60s` possible; Render free-tier cold starts documented at `30-60s` | Medium | Failing |
| Login failure mode clarity | No generic error for normal path | Generic `Unable to log in right now` appears on request failure | High | Failing |
| Pricing visible in initial HTML | Yes | No, client-fetched after hydration | High | Failing |
| Featured showcase visible in initial HTML | Yes | No, client-fetched after hydration | High | Failing |
| Homepage LCP | `< 2.5s` | Not yet measured in repo telemetry | Low | Unknown |
| Showcase backend parity with CLAUDE | Implemented | Public showcase endpoints absent in current branch | High | Failing |

## Measurement Contract

Phase 0 locks what must be measured in production before optimization claims are accepted.

### Login Measurements

Frontend:

- `login_execute_recaptcha_ms`
- `login_request_ms`
- `login_total_ms`

Backend:

- `login_verify_recaptcha_ms`
- `login_user_lookup_ms`
- `login_password_compare_ms`
- `login_refresh_token_store_ms`
- `login_total_ms`

Required aggregation:

- `p50`
- `p95`
- error rate by `errorCode`

Sampling rules:

- warm samples: at least `20` production login attempts with the API already warm
- cold samples: at least `5` production login attempts after idle/cold-start conditions

### Homepage Measurements

Required checks:

- verify pricing markup exists in initial HTML response
- verify featured showcase markup exists in initial HTML response
- capture homepage `LCP`
- capture server fetch duration for pricing preview data
- capture server fetch duration for homepage featured showcase data

Required aggregation:

- `p50`
- `p95`

## Phase 0 Decisions (Locked)

1. Login slowness will be treated as both an infrastructure and request-path problem.
2. Homepage pricing preview must move to server fetch with revalidation.
3. Homepage featured showcase preview must move to server fetch with revalidation.
4. Full showcase search/filter/infinite-scroll remains on `/showcase`; the homepage only renders featured entries.
5. Auth optimization work will not proceed without timing instrumentation.
6. Production performance fixes must align with `CLAUDE.md` hosting assumptions:
   - frontend on Vercel
   - backend on Render
   - Render cold-start mitigation immediately, non-sleeping tier as the final fix

## Phase 0 Exit Status

### Completed

- Production targets are locked.
- Intended architecture is locked.
- Current code-observable baseline is documented.
- Known implementation mismatches are identified.

### Not Yet Complete

- Exact production login `p50/p95` is not yet available because the current system does not emit the required timing breakdown.
- Exact homepage server-fetch timing `p50/p95` is not yet available because homepage pricing/showcase are not server-fetched today.

Phase 0 is therefore complete as a baseline/specification document, but the numeric timing baseline must be collected as part of the instrumentation workstream before optimization claims are accepted.
