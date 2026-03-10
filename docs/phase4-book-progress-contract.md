# Phase 4 - Book Progress Tracker Contract (Alignment)

Related flow-lock document:
- `docs/phase0-manuscript-flow-lock.md` (authoritative pipeline state machine + API/job contracts)

## Endpoint Decision (Phase 0)

- Current implemented source endpoint: `GET /api/v1/orders/:id/tracking`
- Planned canonical endpoint (per CLAUDE.md API table): `GET /api/v1/books/:id`

Tracker contract normalization is locked in `apps/web/lib/api/book-progress-contract.ts` so UI code can stay stable while backend books endpoints are added.

## Locked Tracker Contract

- `bookId: string | null`
- `currentStatus: string | null`
- `rejectionReason: string | null`
- `currentStage: PAYMENT_RECEIVED | DESIGNING | DESIGNED | FORMATTING | FORMATTED | REVIEW | APPROVED | PRINTING | PRINTED | SHIPPING | DELIVERED`
- `timeline[]` entries with:
  - `stage`
  - `state` (`completed | current | upcoming | rejected`)
  - `reachedAt`
  - `sourceStatus`

## Locked Status Normalization Rules

The 11-step UI pipeline is:

`PAYMENT_RECEIVED -> DESIGNING -> DESIGNED -> FORMATTING -> FORMATTED -> REVIEW -> APPROVED -> PRINTING -> PRINTED -> SHIPPING -> DELIVERED`

Backend status normalization highlights:

- `AI_PROCESSING -> DESIGNING`
- `FORMATTING_REVIEW -> REVIEW`
- `PREVIEW_READY -> REVIEW`
- `IN_PRODUCTION -> PRINTING`
- `COMPLETED -> DELIVERED`
- `REJECTED -> REVIEW` (rendered as rejected/red state in UI)

## API Contract Upgrade Applied

`GET /api/v1/orders/:id/tracking` now includes:

- `bookId`
- `rejectionReason`

This closes the immediate gap for tracker data needs before `/books/:id` is implemented.
