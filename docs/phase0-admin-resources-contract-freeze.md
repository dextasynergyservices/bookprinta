# Phase 0: Admin Resources Contract Freeze

Date: 2026-03-19

## Scope

Freeze and align contracts for admin resource category management and article CRUD.

## Decisions

1. Canonical admin route for resources is `/admin/resources`.
2. Existing app architecture remains canonical under `app/[locale]/(admin)/admin/*`.
3. A compatibility alias route exists at `app/[locale]/(admin)/resources/page.tsx` and redirects to `/admin/resources`.
4. Content-role policy is aligned between frontend nav and backend guards: `EDITOR` is authorized for admin resources and resource categories.
5. Shared request/response contracts remain sourced from shared schema + API DTOs.
6. Publish/unpublish semantics and `publishedAt` behavior are server-authoritative and unchanged.

## Canonical References

- Route shell:
  - `apps/web/app/[locale]/(admin)/admin/page.tsx`
- Alias redirect:
  - `apps/web/app/[locale]/(admin)/resources/page.tsx`
- Frontend admin navigation role policy:
  - `apps/web/components/admin/admin-navigation.ts`
- Backend guards (aligned):
  - `apps/api/src/resources/admin-resources.controller.ts`
  - `apps/api/src/resources/admin-resource-categories.controller.ts`
- Shared contracts:
  - `packages/shared/schemas/resource.schema.ts`
  - `apps/api/src/resources/dto/resources.dto.ts`
- Publish/unpublish semantics:
  - `apps/api/src/resources/resources.service.ts`

## Slug Uniqueness Behavior (Frozen for Phase 0)

1. Slug format is validated by shared schema (`slug` regex in `resource.schema.ts`).
2. Uniqueness is enforced server-side by persistence constraints and handled in service-layer error mapping.
3. Phase 0 does not add a dedicated slug availability endpoint.
4. Frontend UX in later phases should surface backend duplicate errors clearly at create/update time.

## Publication Behavior (Frozen)

1. `isPublished: false` forces `publishedAt: null`.
2. `isPublished: true` sets `publishedAt` to provided value or current timestamp when absent.
3. Unpublish clears `publishedAt`.
4. Invalid combinations (for example setting `publishedAt` while unpublishing) are rejected by service validation.

## Exit Criteria Check

1. No ambiguity on canonical route: complete.
2. No ambiguity on role policy: complete.
3. No ambiguity on request/response contracts: complete.
4. No ambiguity on slug uniqueness handling in Phase 0: complete.
5. No ambiguity on publication semantics: complete.