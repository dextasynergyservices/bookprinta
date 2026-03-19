# Phase 0: Admin System Settings, Audit Logs, and Analytics Architecture Freeze

Date: 2026-03-19
Owner: Admin Control Surfaces
Status: Locked

## Scope

Freeze architecture and implementation boundaries for three distinct admin pages:

1. `/admin/system-settings`
2. `/admin/audit-logs`
3. `/admin/analytics`

This freeze prevents feature overlap and keeps each surface focused on one operational concern.

## Decisions

1. Three-page split is mandatory and explicit.
2. System Settings handles configuration only.
3. Audit Logs handles traceability and incident triage only.
4. Analytics handles KPIs, trends, and chart-based insight only.
5. No cross-contamination is allowed between these surfaces.

## Surface Boundaries (Locked)

### 1) System Settings (`/admin/system-settings`)

Allowed:

- Payment gateway configuration (enable/disable, test/live mode, priority, API keys).
- System setting key/value controls.
- Production delay manual override controls and status snapshot.

Disallowed:

- KPI cards, charts, trend analysis.
- Incident triage workflows.

### 2) Audit Logs (`/admin/audit-logs`)

Allowed:

- Admin action audit trail.
- Error/system log triage view and filters.
- Incident status actions (acknowledge/assign/resolve) in later phases.

Disallowed:

- Settings mutation controls.
- KPI/dashboard widgets.

### 3) Analytics (`/admin/analytics`)

Allowed:

- KPI cards.
- Chart-based performance insights.
- Time-range trend analysis.

Disallowed:

- Configuration forms.
- Audit/event detail operations.

## Role Access Matrix (Freeze)

This matrix freezes access intent for implementation in later phases.

| Role | System Settings | Audit Logs | Analytics |
|---|---|---|---|
| `SUPER_ADMIN` | Full write | Full triage/actions | Full access |
| `ADMIN` | Operational write | Full triage/actions | Full access |
| `MANAGER` | View-only where explicitly approved | View-only where explicitly approved | View access |
| `EDITOR` | No access (unless explicitly granted later) | No access (unless explicitly granted later) | No access (unless explicitly granted later) |

Notes:

1. Final endpoint-level enforcement is implemented in controller guards and service authorization checks.
2. Any exception must be documented in a dedicated contract-freeze amendment.

## Non-Negotiables (Locked)

1. Mobile-first implementation (base styles target 375px first, then `md`/`lg` enhancements).
2. WCAG accessibility coverage for all controls, tables, and chart interactions.
3. i18n-safe copy via `messages/en.json` as source of truth with mirrored `fr.json` and `es.json` keys.
4. Audit trail must be recorded for all critical mutations.
5. No raw secrets are returned from any API response.
6. High-risk operational toggles require explicit user confirmation in UI.

## Canonical References

- Source of truth requirements:
  - `CLAUDE.md`
- Existing admin shell + nav:
  - `apps/web/components/admin/admin-shell.tsx`
  - `apps/web/components/admin/admin-navigation.ts`
- Route group:
  - `apps/web/app/[locale]/(admin)/admin/`
- Existing analytics entry:
  - `apps/web/app/[locale]/(admin)/admin/analytics/page.tsx`
- Existing production-delay admin APIs:
  - `apps/api/src/production-delay/admin-system.controller.ts`

## Exit Criteria Check

1. Distinct routes confirmed and frozen: complete.
2. Strict separation by operational concern: complete.
3. Role access matrix intent frozen: complete.
4. Non-negotiables frozen for implementation and QA: complete.
