# Phase 6: Auth + Homepage QA and Rollout

## Objective
Ship the auth-path optimization and homepage server-fetch changes with measurable validation, environment discipline, and alertable failure signals.

## Release Gates
- warm login `p95 < 4s`
- homepage pricing and featured showcase present on first render
- homepage `LCP < 2.5s`
- no sustained `auth.login.timing` failure spike
- no sustained homepage SSR prefetch failures

## Automated Checks
- API auth optimization tests:
  - `bun run --cwd apps/api test -- src/auth/auth.service.spec.ts src/auth/strategies/jwt-refresh.strategy.spec.ts`
- Homepage server-fetch QA:
  - `bun run --cwd apps/web test -- --runTestsByPath "app/[locale]/(marketing)/page.test.tsx"`
- Existing manuscript workspace smoke suite:
  - `bun run test:e2e:book-workspace`

## Manual QA: Cold vs Warm Login
Use staging or production-like infrastructure. Local Docker is not a valid proxy for Render cold-start behavior.

### Warm Login Check
1. Hit `GET /api/v1/health/ping` until the API is warm.
2. Open the login page.
3. Perform at least 5 successful logins with real credentials.
4. For each login, capture:
   - browser console event: `[auth-timing]`
   - backend log event: `auth.login.timing`
   - request id / correlation id
5. Record:
   - `recaptchaDurationMs`
   - `requestDurationMs`
   - `totalDurationMs`
   - backend `verifyRecaptchaDurationMs`
   - backend `userLookupDurationMs`
   - backend `passwordCompareDurationMs`
   - backend `refreshTokenHashDurationMs`
   - backend `refreshTokenPersistDurationMs`

Pass condition:
- `p95(totalDurationMs) < 4000`

### Cold Login Check
1. Allow the API to idle or deploy a fresh instance.
2. Trigger one login without pre-warming the service.
3. Record:
   - `/api/v1/health/status` runtime block
   - first request completion timing
   - login client/backend timing events

Pass condition:
- cold login recovers cleanly without generic failure
- if cold-start latency is still unacceptable, move the API to a non-sleeping Render plan

## Manual QA: Homepage SSR
Validate on staging or production-like infra.

1. Load the homepage with JavaScript enabled and confirm:
   - pricing section shows package content immediately
   - featured showcase section shows server-fetched entries immediately
2. Load the homepage with JavaScript disabled and confirm:
   - pricing section shell is present
   - featured showcase entries are still visible from initial HTML
3. Inspect server logs:
   - no `[home-ssr] pricing prefetch failed`
   - no `[home-ssr] featured showcase prefetch failed`

Pass condition:
- pricing and featured showcase do not wait on client fetch to become visible

## Production Environment Checklist
Backend:
- `FRONTEND_URL`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_COOKIE_SAME_SITE`
- `RECAPTCHA_SECRET_KEY`
- `JWT_SECRET`
- `REFRESH_TOKEN_HMAC_SECRET`

Frontend:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`

Validation rules:
- cross-site frontend/API over HTTPS:
  - `AUTH_COOKIE_SAME_SITE=none`
  - `AUTH_COOKIE_DOMAIN` set to the shared parent domain when appropriate
- same-site deployment:
  - `AUTH_COOKIE_SAME_SITE=lax` is acceptable
- `NEXT_PUBLIC_API_URL` must point to the public API origin, not localhost
- `FRONTEND_URL` must match the real frontend origin used by browsers
- `REFRESH_TOKEN_HMAC_SECRET` must be a stable secret and must not change during active sessions

## Alerting and Dashboards
Primary signals:
- `auth.login.timing`
- `[home-ssr] pricing prefetch failed`
- `[home-ssr] featured showcase prefetch failed`
- Sentry tags:
  - `source=packages-api`
  - `source=showcase-api`

### Alert Thresholds
- login error spike:
  - alert when `auth.login.timing.outcome="failure"` exceeds 5% over 5 minutes
- slow warm login:
  - alert when `p95(auth.login.timing.totalDurationMs) > 4000` over 15 minutes
- reCAPTCHA degradation:
  - alert when `p95(auth.login.timing.verifyRecaptchaDurationMs) > 1500` over 15 minutes
- homepage pricing SSR fetch failures:
  - alert on any sustained `[home-ssr] pricing prefetch failed` events for 5 minutes
- homepage showcase SSR fetch failures:
  - alert on any sustained `[home-ssr] featured showcase prefetch failed` events for 5 minutes

### Dashboard Views
- Auth performance:
  - total login duration p50/p95
  - reCAPTCHA duration p50/p95
  - user lookup duration p50/p95
  - password compare duration p50/p95
  - refresh token persist duration p50/p95
  - failures by `errorCode`
- Homepage SSR:
  - pricing prefetch failures
  - showcase prefetch failures
  - package API Sentry exceptions
  - showcase API Sentry exceptions

## Release Validation Notes
- Deploy backend before frontend whenever auth contracts or API helpers changed.
- Run Prisma schema deployment plus the phone normalization backfill before enabling the optimized phone login path in production.
- Keep `GET /api/v1/health/ping` on the uptime monitor.
- If warm login still misses target after this phase, inspect the Phase 4 timing logs before making further auth changes.
