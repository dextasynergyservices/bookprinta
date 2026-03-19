# Phase 0: Showcase Contract Freeze and Gap Closure

Date: 2026-03-18
Owner: Admin Showcase Management
Status: Locked

## 1) Frozen Admin Endpoint Contracts

All endpoints are under `/api/v1`.

### Showcase Categories (Admin)

- `GET /admin/showcase-categories`
  - Response: `AdminShowcaseCategoriesListResponse`
  - Ordering: `sortOrder ASC`, then `name ASC`

- `POST /admin/showcase-categories`
  - Request: `AdminCreateShowcaseCategoryInput`
  - Response: `AdminShowcaseCategory`

- `PATCH /admin/showcase-categories/:id`
  - Request: `AdminUpdateShowcaseCategoryInput`
  - Response: `AdminShowcaseCategory`

- `DELETE /admin/showcase-categories/:id`
  - Response: `AdminDeleteShowcaseCategoryResponse`
  - Guardrail: if any showcase entries are assigned to the category, delete must fail with `409 Conflict`.

### Showcase Entries (Admin)

- `GET /admin/showcase`
  - Query: `AdminShowcaseEntriesListQuery`
  - Response: `AdminShowcaseEntriesListResponse`
  - Filters:
    - `q`: searches `bookTitle` and `authorName`
    - `categoryId`: filter by category
    - `isFeatured`: filter by featured state
  - Sort modes:
    - `sort_order_asc` (default)
    - `sort_order_desc`
    - `published_at_desc`
    - `published_at_asc`
    - `created_at_desc`
    - `created_at_asc`

- `POST /admin/showcase`
  - Request: `AdminCreateShowcaseEntryInput`
  - Response: `AdminShowcaseEntry`

- `PATCH /admin/showcase/:id`
  - Request: `AdminUpdateShowcaseEntryInput`
  - Response: `AdminShowcaseEntry`

- `DELETE /admin/showcase/:id`
  - Response: `AdminDeleteShowcaseEntryResponse`

### Linked User Search (Admin)

- `GET /admin/showcase/users/search`
  - Query: `AdminShowcaseUserSearchQuery`
  - Response: `AdminShowcaseUserSearchResponse`
  - Purpose: searchable dropdown for linking showcase entries to internal users.

## 2) Sort Order Semantics (Locked)

- `sortOrder` is the manual editorial ranking for both categories and entries.
- Lower `sortOrder` appears first.
- If two records have same `sortOrder`, fallback ordering applies:
  - categories: `name ASC`
  - entries: `createdAt DESC`
- `isFeatured` controls landing-page inclusion through existing public query mode (`isFeatured=true`).

## 3) Role Guard Policy (Locked)

Decision for showcase admin APIs:

- Allowed roles: `SUPER_ADMIN`, `ADMIN`, `EDITOR`

Rationale:

- Showcase is a content curation surface, and the current admin navigation already routes editors to showcase.
- Locking this now prevents frontend/backend authorization mismatch during implementation.

Notes:

- This decision is scoped to showcase management endpoints.
- Existing admin resources endpoints currently differ in role policy; that is out of scope for this phase and can be normalized in a separate hardening pass.

## 4) Shared Schema Source of Truth

Phase 0 contracts are now defined in:

- `packages/shared/schemas/showcase.schema.ts`

This file now contains admin DTO shapes for:

- category create/update/delete/list responses
- showcase entry create/update/list query/responses
- user-link search query/response

## 5) Routing Clarification (UI)

The existing admin route convention in this repo uses `/admin/*` paths under the admin group.

- Target page route for implementation: `app/[locale]/(admin)/admin/showcase/page.tsx`

This keeps showcase management consistent with existing admin modules (orders, books, users, packages).
