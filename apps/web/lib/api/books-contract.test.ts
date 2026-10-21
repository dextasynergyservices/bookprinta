import { normalizeUserBooksListPayload } from "./books-contract";

describe("normalizeUserBooksListPayload", () => {
  it("returns the typed response when the payload matches the shared schema", () => {
    const payload = {
      items: [
        {
          id: "cm1111111111111111111111111",
          orderId: "cm2222222222222222222222222",
          title: "The Lagos Chronicle",
          status: "PREVIEW_READY",
          productionStatus: "REVIEW",
          orderStatus: "PREVIEW_READY",
          // Both required by UserBooksListResponseSchema and both returned by
          // the API. They were added to the schema without updating this
          // fixture, so the parse failed — and because the normalizer falls
          // back to an EMPTY list rather than throwing, the test saw "no books"
          // instead of a validation error.
          orderType: "STANDARD",
          documentPageCount: 180,
          currentStage: "REVIEW",
          coverImageUrl: null,
          latestProcessingError: null,
          rejectionReason: null,
          pageCount: 180,
          wordCount: 52000,
          estimatedPages: 176,
          fontSize: 12,
          pageSize: "A5",
          previewPdfUrlPresent: true,
          finalPdfUrlPresent: false,
          createdAt: "2026-03-01T08:00:00.000Z",
          updatedAt: "2026-03-10T08:00:00.000Z",
          workspaceUrl: "/dashboard/books/cm1111111111111111111111111",
          trackingUrl: "/dashboard/orders/cm2222222222222222222222222",
          rollout: {
            environment: "staging",
            allowInFlightAccess: true,
            isGrandfathered: false,
            blockedBy: null,
            workspace: { enabled: true, access: "enabled" },
            manuscriptPipeline: { enabled: true, access: "enabled" },
            billingGate: { enabled: true, access: "enabled" },
            finalPdf: { enabled: true, access: "enabled" },
          },
          processing: {
            isActive: false,
            currentStep: null,
            jobStatus: null,
            trigger: null,
            startedAt: null,
            attempt: null,
            maxAttempts: null,
          },
        },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    };

    expect(normalizeUserBooksListPayload(payload)).toEqual(payload);
  });

  it("supports nested payloads", () => {
    const normalized = normalizeUserBooksListPayload(
      {
        data: {
          items: [],
          pagination: {
            page: 2,
            pageSize: 5,
            totalItems: 0,
            totalPages: 0,
            hasPreviousPage: true,
            hasNextPage: false,
          },
        },
      },
      { requestedPage: 2, requestedPageSize: 5 }
    );

    expect(normalized.pagination.page).toBe(2);
    expect(normalized.pagination.pageSize).toBe(5);
    expect(normalized.items).toEqual([]);
  });

  it("throws rather than reporting an empty list when the payload does not match", () => {
    // This previously returned an EMPTY list, so a server response that drifted
    // from the schema rendered as "you have no books" — on the very thing the
    // customer paid for. A silent empty state reads as a legitimate answer, so
    // nobody investigates. Throwing puts the query into its error state, which
    // shows a retry and reaches Sentry.
    expect(() =>
      normalizeUserBooksListPayload(
        { data: { unexpected: true } },
        { requestedPage: 3, requestedPageSize: 15 }
      )
    ).toThrow("Unable to load your books right now");
  });

  it("still accepts a genuinely empty list", () => {
    // The distinction that makes failing loudly safe: `items: []` satisfies the
    // schema, so a user with no books is never mistaken for a contract break.
    const empty = {
      items: [],
      pagination: {
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    };

    expect(normalizeUserBooksListPayload(empty)).toEqual(empty);
  });
});
