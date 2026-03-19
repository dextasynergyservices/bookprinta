# Phase 9 Rollout Runbook

## Objective
Release the manuscript workspace and engine pipeline safely across environments without stranding books already in progress.

## Runtime Flags
- `APP_ENV`: `development | staging | production`
- `FEATURE_BOOK_WORKSPACE`: enables the dashboard manuscript workspace shell
- `FEATURE_MANUSCRIPT_PIPELINE`: enables settings save, upload, AI formatting, and server count entry points
- `FEATURE_BILLING_GATE`: enables automated extra-page payment flow
- `FEATURE_FINAL_PDF`: enables approval -> final PDF automation
- `FEATURE_MANUSCRIPT_ALLOW_IN_FLIGHT`: keeps already-started books on the automated path during rollback

## Environment Defaults
- `development`: all manuscript features enabled by default
- `test`: all manuscript features enabled by default
- `staging`: all manuscript features enabled by default
- `production`: all manuscript features disabled by default until explicitly enabled

## In-Flight Rule
A book is treated as in flight when any of the following is true:
- manuscript pipeline status has already advanced beyond `AWAITING_UPLOAD`
- settings already exist (`pageSize` + `fontSize`)
- manuscript metrics or rendered artifacts already exist (`wordCount`, `estimatedPages`, `pageCount`, `currentHtmlUrl`, `previewPdfUrl`, `finalPdfUrl`)

When `FEATURE_MANUSCRIPT_ALLOW_IN_FLIGHT=true`, these books remain eligible even if a feature is turned off for new traffic.

## Rollout Order
1. Enable all flags in `development` and validate local smoke flow.
2. Enable all flags in `staging`.
3. Validate:
   - upload -> AI format -> server count -> billing gate -> approve -> final PDF
   - scanner failure path
   - Gemini failure/retry path
   - Gotenberg timeout/retry path
   - webhook idempotency
4. In `production`, enable flags in this order:
   - `FEATURE_BOOK_WORKSPACE`
   - `FEATURE_MANUSCRIPT_PIPELINE`
   - `FEATURE_BILLING_GATE`
   - `FEATURE_FINAL_PDF`
5. Keep `FEATURE_MANUSCRIPT_ALLOW_IN_FLIGHT=true` during the rollout window.

## Monitoring
Use `GET /api/v1/health/status` as the operational dashboard source. It now exposes:
- dependency status: database, redis, gotenberg, gemini, scanner
- rollout snapshot: environment, in-flight policy, enabled features
- BullMQ queue visibility:
  - `aiFormatting`, `pageCount`, `pdfGeneration`
  - per-queue counts: `waiting`, `active`, `delayed`, `failed`, `completed`, `prioritized`, `waitingChildren`
  - queue connection source: `env` or `localhost_fallback`
  - persisted pipeline job summary, including stale queued/processing DB jobs

Track these release signals:
- manuscript upload success/error rate
- scanner unavailable rate
- AI formatting failures and retry counts
- Gotenberg failures/timeouts and retry counts
- queue depth and stuck jobs for `ai-formatting`, `page-count`, and `pdf-generation`
- books reaching `PREVIEW_READY`
- extra-page payment initiation vs success
- approval success rate
- final PDF generation success rate

Supplement with:
- Sentry for exceptions and worker failures
- Pino logs for queue/job correlation
- Playwright smoke suite for browser-level regression checks
- Auth/homepage rollout checklist in [phase6-auth-homepage-qa-rollout.md](c:/Users/DEXTA-BUILD/Documents/bookprinta/docs/phase6-auth-homepage-qa-rollout.md)

## Keep-Warm Guidance
- Preferred external monitor target: `GET /api/v1/health/ping`
- Do not point keep-alive monitors at `GET /api/v1/health/status`; that route intentionally checks downstream services and is heavier
- `GET /api/v1/health` remains as a backward-compatible alias, but new monitors should use `/health/ping`
- External keep-alive (UptimeRobot/UptimeBoot) is a temporary mitigation for Render free-tier cold starts
- The real production fix is a non-sleeping Render plan (Starter or better)

## Local Dev Recovery
For local-only recovery of a stuck BullMQ pipeline, use:
- `POST /api/v1/health/dev/queues/reset`

Rules:
- allowed only in `development` and `test`
- refuses to run if any BullMQ queue still has active jobs
- clears non-active BullMQ jobs from `ai-formatting`, `page-count`, and `pdf-generation`
- marks persisted pipeline `Job` rows in `QUEUED` / `PROCESSING` as `FAILED` so a fresh retry can be queued cleanly

Do not use this as a production recovery path. In production, investigate queue depth, worker liveness, Redis health, Gemini latency, and Gotenberg latency first.

## Rollback
If production degrades:
1. Set `FEATURE_BOOK_WORKSPACE=false` and `FEATURE_MANUSCRIPT_PIPELINE=false` to stop new books entering the automated manuscript path.
2. Leave `FEATURE_MANUSCRIPT_ALLOW_IN_FLIGHT=true` so books already in progress can finish.
3. If payments are impacted, set `FEATURE_BILLING_GATE=false`.
4. If final rendering is impacted, set `FEATURE_FINAL_PDF=false`.
5. Confirm `GET /api/v1/health/status` reflects the rollback flags.
6. Route newly blocked books through the manual/admin fallback path.

## Safe Fallback Expectations
- New books see a rollout notice in the dashboard instead of broken actions.
- In-flight books continue when grandfathering is enabled.
- Workers already running are not force-stopped by rollout flags.
- No schema rollback is required; rollout is additive and reversible at the environment level.

## Phase 8 QA Addendum (Admin Resources)
This addendum tracks the Phase 8 hardening pass for admin resources (i18n, accessibility, performance, and QA).

### i18n Validation
- Admin resources keys are present in `en.json` and mirrored in `fr.json` and `es.json`.
- New workflow labels (slug checks, markdown controls, upload retry/progress states) are included in all three locales.

### Accessibility Validation
- Keyboard path verified for primary admin resource actions: create, edit, publish/unpublish, preview, and delete.
- Form controls use explicit labels and/or ARIA labels for screen-reader announcement.
- Dialog open behavior now directs focus to the first editable input for faster keyboard operation.
- Mobile touch targets for compact action buttons are expanded to >=44px logical height on small screens.

### Performance Validation
- Admin resources workspace is lazy loaded from the route to reduce initial render cost.
- Resource markdown editor UI is extracted into a shared memoized component to reduce churn in parent rerenders.
- Article table columns and key action handlers are memoized/callback-stabilized to limit unnecessary table/card rerenders.

### QA Matrix
- Unit tests: admin resources hooks (query key normalization + mutation cache invalidation).
- Component tests: resources workspace form validation, filter URL sync, publish toggle, and delete confirmation flow.
- E2E tests: full admin resource category/article CRUD + public preview link behavior.

### Architecture Reference Check
Validated against [bookprinta-diagrams.jsx](../bookprinta-diagrams.jsx):
- Client layer expectations preserved (Next.js admin UI + route-level chunking).
- Testing and docs lane reinforced with explicit unit/component/E2E coverage for admin resources.
- No architecture drift introduced in API or engine boundaries while completing Phase 8 hardening.

## Phase 9 Release and Rollout Safety (Admin Resources)

### Guard Rails
- Ship only under the normal admin route tree: `/[locale]/(admin)/admin/resources`.
- Keep frontend protection enabled via `AdminAuthGate` role checks and route access mapping.
- Keep backend protection enabled via `JwtAuthGuard + RolesGuard` on:
  - `admin/resources` endpoints
  - `admin/resource-categories` endpoints
- Allowed roles stay: `ADMIN`, `SUPER_ADMIN`, `EDITOR`.

### Production Cloudinary Requirements
Required env vars for signed cover upload:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Runtime enforcement:
- In `APP_ENV=production` (or `NODE_ENV=production`), API startup now fails fast when any required Cloudinary variable is missing.
- In non-production environments, startup remains warning-only for local development flexibility.

### Targeted Smoke Checks
Execute these in staging before production release:
1. Category CRUD:
   - create category
   - edit category (name/slug/sort order/active)
   - delete category with and without linked articles
2. Article CRUD:
   - create article (title/slug/content/category)
   - edit article fields and save
   - delete article
3. Publish/unpublish:
   - toggle from draft -> published
   - toggle from published -> draft
4. Preview URL:
   - open preview action from admin table
   - verify localized public resource URL resolves expected slug
5. Upload progress:
   - upload cover and confirm progress indicator updates and reaches completion
   - verify cancel/retry behavior

### First Release Window Monitoring
Observe for at least the first release window:
- API logs (Pino) for admin resources endpoints, especially `cover-upload` authorize/finalize events.
- Sentry for frontend and backend errors in resources/admin namespaces.
- Unexpected 4xx/5xx spikes on:
  - `POST /api/v1/admin/resource-categories`
  - `PATCH /api/v1/admin/resource-categories/:id`
  - `POST /api/v1/admin/resources`
  - `PATCH /api/v1/admin/resources/:id`
  - `POST /api/v1/admin/resources/cover-upload`

### Exit Criteria
Stable production rollout with no regressions in admin workflows:
- category CRUD works
- article CRUD works
- publish/unpublish works
- preview action works
- cover upload progress UX works
- no sustained error trend in logs/Sentry during the release window
