# Phase 6: Admin Showcase QA and Rollout

## Objective
Ship the admin showcase management workspace with stable API contracts, mobile-first usability, and complete translation key coverage for EN/FR/ES.

## Scope Shipped Before UI QA
- Phase 0 contract freeze for admin showcase endpoints and role policy.
- Phase 1 backend CRUD for showcase categories.
- Phase 2 backend CRUD/list/filter/sort for showcase entries.
- Phase 3 admin user-link search endpoint with capped cursor pagination.
- Phase 4 web data layer with typed API client and React Query hooks.

## Release Gates
- Admin category CRUD works end-to-end with conflict-safe delete handling.
- Admin entry CRUD works end-to-end, including `isFeatured`, `sortOrder`, and linked user search.
- Admin showcase endpoints are role-protected (`SUPER_ADMIN`, `ADMIN`, `EDITOR`).
- Locale files include all new admin showcase keys in `en.json`, `fr.json`, and `es.json`.
- i18n key parity test passes.

## Automated Checks
- Showcase service tests:
  - `bun run --cwd apps/api test -- src/showcase/showcase.service.spec.ts`
- Web i18n key parity:
  - `bun run --cwd apps/web test -- --runTestsByPath "messages/messages-i18n-coverage.test.ts"`
- Optional web type check before rollout:
  - `bun run --cwd apps/web typecheck`

## Manual QA: Admin Showcase Categories
Use staging or production-like infrastructure with real auth cookies and admin roles.

1. Open admin showcase workspace as `EDITOR` and confirm category list renders.
2. Create a category with valid `name`, `slug`, and `sortOrder`.
3. Edit category fields and verify persisted updates.
4. Try deleting a category that has assigned entries and confirm conflict message.
5. Delete an unassigned category and confirm it disappears from list.

Pass condition:
- Create, update, and delete flows succeed with accurate toasts.
- Conflict-safe delete guard is enforced for assigned categories.

## Manual QA: Admin Showcase Entries
1. Create an entry with title, author, category, year, `sortOrder`, and optional linked user.
2. Toggle `isFeatured` and verify list refresh reflects updated state.
3. Change `sortOrder` and verify ordering updates.
4. Validate entry form behavior for invalid year and missing required fields.
5. Delete an entry and verify it is removed from list.

Pass condition:
- Entry CRUD and toggle/reorder flows persist correctly.
- Validation errors are visible and actionable.

## Manual QA: User Link Search
1. In entry form, type at least two characters in linked-user search.
2. Confirm only minimal payload fields are shown (`id`, `displayName`, `email`, `profileComplete`).
3. Confirm empty state message appears when no user matches query.
4. Confirm selecting a user stores the linked user id.

Pass condition:
- Search is performant, paginated, and stable under repeated queries.

## Message Key Rollout Checklist
Add and keep in sync these `admin` namespace keys across all locale files:

- `showcase_workspace_description`
- `showcase_categories_title`
- `showcase_categories_description`
- `showcase_category_create_title`
- `showcase_category_edit_title`
- `showcase_category_field_name`
- `showcase_category_field_slug`
- `showcase_category_field_sort_order`
- `showcase_category_field_active`
- `showcase_category_action_create`
- `showcase_category_action_creating`
- `showcase_category_action_save`
- `showcase_category_action_saving`
- `showcase_category_action_delete`
- `showcase_category_action_deleting`
- `showcase_category_toast_created`
- `showcase_category_toast_updated`
- `showcase_category_toast_deleted`
- `showcase_category_toast_create_failed`
- `showcase_category_toast_update_failed`
- `showcase_category_toast_delete_failed`
- `showcase_category_delete_blocked`
- `showcase_category_delete_blocked_description`
- `showcase_category_validation_name_required`
- `showcase_category_validation_name_too_long`
- `showcase_category_validation_slug_pattern`
- `showcase_category_validation_sort_order_required`
- `showcase_entries_title`
- `showcase_entries_description`
- `showcase_entry_create_title`
- `showcase_entry_edit_title`
- `showcase_entry_field_title`
- `showcase_entry_field_author_name`
- `showcase_entry_field_about_book`
- `showcase_entry_field_testimonial`
- `showcase_entry_field_published_year`
- `showcase_entry_field_category`
- `showcase_entry_field_category_placeholder`
- `showcase_entry_field_user`
- `showcase_entry_field_user_placeholder`
- `showcase_entry_field_featured`
- `showcase_entry_field_sort_order`
- `showcase_entry_field_cover_image`
- `showcase_entry_field_preview_path`
- `showcase_entry_action_create`
- `showcase_entry_action_creating`
- `showcase_entry_action_save`
- `showcase_entry_action_saving`
- `showcase_entry_action_delete`
- `showcase_entry_action_deleting`
- `showcase_entry_toast_created`
- `showcase_entry_toast_updated`
- `showcase_entry_toast_deleted`
- `showcase_entry_toast_create_failed`
- `showcase_entry_toast_update_failed`
- `showcase_entry_toast_delete_failed`
- `showcase_entry_validation_title_required`
- `showcase_entry_validation_author_required`
- `showcase_entry_validation_about_book_too_long`
- `showcase_entry_validation_testimonial_too_long`
- `showcase_entry_validation_year_invalid`
- `showcase_entry_validation_category_required`
- `showcase_entry_validation_sort_order_required`
- `showcase_user_search_placeholder`
- `showcase_user_search_searching`
- `showcase_user_search_empty`
- `showcase_categories_loading`
- `showcase_entries_loading`
- `showcase_categories_empty`
- `showcase_entries_empty`
- `showcase_page_error_title`
- `showcase_page_error_description`
- `showcase_page_retry`

## Production Environment Checklist
Backend:
- `FRONTEND_URL`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_COOKIE_SAME_SITE`

Frontend:
- `NEXT_PUBLIC_API_URL`

Validation rules:
- Cross-site frontend/API over HTTPS:
  - `AUTH_COOKIE_SAME_SITE=none`
  - `AUTH_COOKIE_DOMAIN` set to the shared parent domain when appropriate
- Same-site deployment:
  - `AUTH_COOKIE_SAME_SITE=lax` is acceptable
- `NEXT_PUBLIC_API_URL` must point to the public API origin, not localhost
- `FRONTEND_URL` must match the real frontend origin used by browsers

## Alerting and Dashboards
Primary signals:
- Admin showcase API 4xx/5xx rates.
- Sentry tags:
  - `source=showcase-api`

Alert thresholds:
- Error-rate spike:
  - alert when admin showcase endpoint failures exceed 5% over 5 minutes
- Latency regression:
  - alert when p95 admin showcase read endpoints exceeds 1200ms over 15 minutes

Dashboard views:
- Admin showcase API:
  - list endpoint latency p50/p95
  - user-search latency p50/p95
  - create/update/delete error distribution

## Release Validation Notes
- Deploy backend before frontend whenever DTO contracts or service responses changed.
- Keep contract freeze doc aligned with any follow-up endpoint shape changes.
- If i18n parity fails, add the missing keys to `en.json`, then mirror to `fr.json` and `es.json`.
