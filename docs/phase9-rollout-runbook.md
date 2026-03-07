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
