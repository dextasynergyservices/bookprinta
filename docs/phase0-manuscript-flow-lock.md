# Phase 0 - Manuscript Flow Lock + State Machine

## Purpose

Lock the authoritative implementation contract for the manuscript engine path:

`upload -> ai-format -> server-count -> billing-gate -> approve -> final-pdf`

This document is the Phase 0 source of truth for all next implementation phases.

## Source Of Truth

- [CLAUDE.md](/c:/Users/DEXTA-BUILD/Documents/bookprinta/CLAUDE.md): sections 7.2, 8 (Path A step 9), 11, 18.2, API table (Books/Payments)
- [bookprinta-diagrams.jsx](/c:/Users/DEXTA-BUILD/Documents/bookprinta/bookprinta-diagrams.jsx): Path A block + engine diagram (steps 0-7)
- Prisma enums/models in [schema.prisma](/c:/Users/DEXTA-BUILD/Documents/bookprinta/apps/api/prisma/schema.prisma)

## Scope

- Covers only standard "Needs Formatting" flow after checkout payment.
- Covers Book + Order state transitions, API payload contracts, and job payload contracts.
- Covers billing gate and extra-pages payment unlock path.

## Non-Goals

- No worker implementation in this phase.
- No UI implementation details in this phase.
- No schema migration in this phase.

## Canonical Flow (Locked)

1. User selects `pageSize` + `fontSize` before manuscript upload.
2. User uploads DOCX/PDF.
3. Backend validates size/type, scans malware, stores raw file, extracts `wordCount`, computes `estimatedPages`.
4. Backend enqueues AI formatting job.
5. AI job stores `CLEANED_HTML` and updates book HTML pointer.
6. Backend enqueues server page-count job.
7. Page-count job stores authoritative `Book.pageCount`.
8. Billing gate computes overage against package `pageLimit`.
9. If overage > 0: user pays via `/payments/extra-pages`, webhook marks success, gate unlocks.
10. User approves via `/books/:id/approve`.
11. Backend enqueues final PDF generation, stores `FINAL_PDF`, transitions production statuses.

## State Machine Lock

### Book Status (Pipeline Path)

| From | To | Trigger | Required Conditions | Side Effects |
|---|---|---|---|---|
| `PAYMENT_RECEIVED` or `AWAITING_UPLOAD` | `UPLOADED` | `POST /books/:id/upload` success | Valid settings + clean file | Save `RAW_MANUSCRIPT`, `wordCount`, `estimatedPages` |
| `UPLOADED` | `AI_PROCESSING` | AI job enqueue | Upload completed | Create `Job(type=AI_CLEANING,status=QUEUED)` |
| `AI_PROCESSING` | `FORMATTING` | AI worker starts | Queue worker claimed job | Update job attempts/start timestamps |
| `FORMATTING` | `FORMATTED` | AI worker success | HTML passes validation rules | Save `CLEANED_HTML`, set `currentHtmlUrl` |
| `FORMATTED` | `PREVIEW_READY` | Server count success | `Book.pageCount` computed | Gate snapshot written |
| `PREVIEW_READY` | `APPROVED` | `POST /books/:id/approve` | Gate passed or overage paid | Queue final-PDF job |
| `APPROVED` | `IN_PRODUCTION` | Final PDF job success or production kickoff | `FINAL_PDF` available | Save `finalPdfUrl`, continue admin pipeline |
| Any active pipeline status | `REJECTED` | Admin reject | Admin action + reason | Set `rejectionReason`, block approval |

### Order Status (Pipeline Path)

| From | To | Trigger | Required Conditions | Side Effects |
|---|---|---|---|---|
| `PAID` | `FORMATTING` | First upload accepted | Book tied to order | Enter processing window |
| `FORMATTING` | `PREVIEW_READY` | Server page count ready and no overage | `pageCount <= package.pageLimit` | Approval may proceed |
| `FORMATTING` or `PREVIEW_READY` | `PENDING_EXTRA_PAYMENT` | Gate overage detected | `pageCount > package.pageLimit` | Save `extraAmount = overage * 10` |
| `PENDING_EXTRA_PAYMENT` | `PREVIEW_READY` | Extra-pages payment success webhook | Payment `type=EXTRA_PAGES` + `status=SUCCESS` | Gate unlock |
| `PREVIEW_READY` | `APPROVED` | Book approved | Approval preconditions true | Queue final PDF generation |
| `APPROVED` | `IN_PRODUCTION` | Final PDF generated and handoff complete | Book approved | Continue normal production lifecycle |

## Billing Gate Rules (Locked)

1. Authoritative page count source is `Book.pageCount` (Gotenberg path), never Paged.js.
2. Bundle limit source is `Order.package.pageLimit`.
3. Overage formula: `overagePages = max(Book.pageCount - package.pageLimit, 0)`.
4. Extra fee formula: `extraAmount = overagePages * 10` (NGN).
5. Approve precondition:
   - If `overagePages == 0`, approval allowed.
   - If `overagePages > 0`, approval blocked until a successful `EXTRA_PAGES` payment covers the current overage snapshot.
6. Settings change invalidates previous gate result and re-runs AI + recount before approval can proceed.

## External API Contract Lock

### Implemented Endpoints (Must Be Preserved)

#### `PATCH /api/v1/books/:id/settings` (Auth)

Request (JSON):

```json
{
  "pageSize": "A4",
  "fontSize": 12
}
```

Response (200):

```json
{
  "id": "cm_book_id",
  "pageSize": "A4",
  "fontSize": 12,
  "wordCount": 42000,
  "estimatedPages": 168,
  "updatedAt": "2026-03-06T12:00:00.000Z"
}
```

#### `POST /api/v1/books/:id/upload` (Auth, multipart)

Request (multipart):
- `file`: `.docx` or `.pdf`, <= 10MB

Response (201):

```json
{
  "bookId": "cm_book_id",
  "fileId": "cm_file_id",
  "fileUrl": "https://res.cloudinary.com/.../raw/upload/...",
  "fileName": "manuscript.docx",
  "fileSize": 945231,
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "pageSize": "A5",
  "fontSize": 11,
  "wordCount": 42000,
  "estimatedPages": 173
}
```

#### `POST /api/v1/payments/extra-pages` (Auth)

Request (current schema):

```json
{
  "bookId": "cm_book_id",
  "provider": "PAYSTACK",
  "extraPages": 23,
  "callbackUrl": "https://app.example.com/dashboard/books/cm_book_id"
}
```

Response (200):

```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference": "ep_...",
  "provider": "PAYSTACK"
}
```

#### `POST /api/v1/books/:id/approve` (Auth)

Request:

```json
{
  "gateSnapshot": "optional-hash-or-version"
}
```

Response (200):

```json
{
  "bookId": "cm_book_id",
  "bookStatus": "APPROVED",
  "orderStatus": "APPROVED",
  "queuedJob": {
    "queue": "pdf-generation",
    "name": "generate-pdf",
    "jobId": "cm_job_id"
  }
}
```

Reject with `409` when billing gate is not satisfied.

#### `GET /api/v1/books/:id/preview` (Auth)

Response (200):

```json
{
  "bookId": "cm_book_id",
  "previewPdfUrl": "https://res.cloudinary.com/.../preview.pdf",
  "status": "PREVIEW_READY",
  "watermarked": true
}
```

#### `GET /api/v1/books/:id/files` (Auth)

Response (200):

```json
{
  "bookId": "cm_book_id",
  "files": [
    {
      "id": "cm_file_raw",
      "fileType": "RAW_MANUSCRIPT",
      "url": "https://res.cloudinary.com/.../manuscript.docx",
      "fileName": "manuscript.docx",
      "fileSize": 945231,
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "version": 1,
      "createdBy": "cm_user_id",
      "createdAt": "2026-03-06T12:00:00.000Z"
    },
    {
      "id": "cm_file_html",
      "fileType": "CLEANED_HTML",
      "url": "https://res.cloudinary.com/.../cleaned.html",
      "fileName": null,
      "fileSize": null,
      "mimeType": "text/html",
      "version": 1,
      "createdBy": null,
      "createdAt": "2026-03-06T12:05:00.000Z"
    },
    {
      "id": "cm_file_preview_pdf",
      "fileType": "PREVIEW_PDF",
      "url": "https://res.cloudinary.com/.../preview.pdf",
      "fileName": "preview-bull-count-1.pdf",
      "fileSize": 482113,
      "mimeType": "application/pdf",
      "version": 1,
      "createdBy": "SYSTEM",
      "createdAt": "2026-03-06T12:07:00.000Z"
    },
    {
      "id": "cm_file_final_pdf",
      "fileType": "FINAL_PDF",
      "url": "https://res.cloudinary.com/.../final.pdf",
      "fileName": "final-bull-pdf-1.pdf",
      "fileSize": 478902,
      "mimeType": "application/pdf",
      "version": 1,
      "createdBy": "SYSTEM",
      "createdAt": "2026-03-06T12:12:00.000Z"
    }
  ]
}
```

## Internal Job Contract Lock

Note: Prisma `JobType` currently uses `AI_CLEANING`; queue/job name uses `format-manuscript`. This mapping is locked:

- `Job.type = AI_CLEANING` <-> queue `ai-formatting` + job name `format-manuscript`
- `Job.type = PAGE_COUNT` <-> queue `page-count` + job name `count-pages`
- `Job.type = PDF_GENERATION` <-> queue `pdf-generation` + job name `generate-pdf`

### `format-manuscript` payload

```json
{
  "bookId": "cm_book_id",
  "orderId": "cm_order_id",
  "userId": "cm_user_id",
  "rawFileId": "cm_file_raw",
  "rawFileUrl": "https://res.cloudinary.com/.../manuscript.docx",
  "mimeType": "application/pdf",
  "wordCount": 42000,
  "estimatedPages": 173,
  "pageSize": "A5",
  "fontSize": 11,
  "trigger": "upload|settings_change"
}
```

Result:

```json
{
  "cleanedHtmlFileId": "cm_file_html",
  "cleanedHtmlUrl": "https://res.cloudinary.com/.../cleaned.html",
  "outputWordCount": 41870
}
```

### `count-pages` payload

```json
{
  "bookId": "cm_book_id",
  "orderId": "cm_order_id",
  "cleanedHtmlFileId": "cm_file_html",
  "cleanedHtmlUrl": "https://res.cloudinary.com/.../cleaned.html",
  "pageSize": "A5",
  "fontSize": 11,
  "bundlePageLimit": 150
}
```

Result:

```json
{
  "pageCount": 173,
  "overagePages": 23,
  "extraAmount": 230,
  "gateStatus": "PAYMENT_REQUIRED",
  "previewPdfFileId": "cm_file_preview_pdf",
  "previewPdfUrl": "https://res.cloudinary.com/.../preview.pdf"
}
```

### `generate-pdf` payload

```json
{
  "bookId": "cm_book_id",
  "orderId": "cm_order_id",
  "cleanedHtmlFileId": "cm_file_html",
  "cleanedHtmlUrl": "https://res.cloudinary.com/.../cleaned.html",
  "pageSize": "A5",
  "fontSize": 11
}
```

Result:

```json
{
  "finalPdfFileId": "cm_file_final_pdf",
  "finalPdfUrl": "https://res.cloudinary.com/.../final.pdf"
}
```

## Settings Change Re-Run Contract

When `PATCH /books/:id/settings` is called after manuscript upload exists:

1. Mark gate result stale.
2. Requeue `format-manuscript` with `trigger=settings_change`.
3. Requeue `count-pages` after AI success.
4. Keep approval blocked until recount completes and gate is re-evaluated.

## Locked Validation + Failure Rules

- Upload is blocked if scanner unavailable.
- File validation:
  - MIME allowlist: PDF, DOCX
  - Max size: 10MB
  - Word limit: 100,000
- AI output validation:
  - Must contain body content
  - Must not include script/style
  - Output word count within 20% of input
- If AI or Gotenberg fails after retries:
  - Job status -> `FAILED`
  - Book remains non-approvable
  - Admin fallback path (manual `CLEANED_HTML`) remains available

## Open Decisions Locked For Phase 1 Implementation

1. `extraPages` request safety:
   - Server must recompute overage from authoritative snapshot and reject mismatched client-sent `extraPages`.
2. Gate snapshot strategy:
   - Use `book.version` + `pageCount` + `pageSize` + `fontSize` hash to prevent stale approvals.
3. Where to set `Order.status` during re-runs:
   - Use `FORMATTING` while AI/count jobs are active.

## Phase 0 Exit Criteria

- This contract is approved and referenced by implementation PRs.
- Any implementation that diverges from this file must update this file in the same PR with rationale.
