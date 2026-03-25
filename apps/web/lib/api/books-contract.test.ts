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

  it("supports nested payloads and falls back to an empty response when invalid", () => {
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

    expect(
      normalizeUserBooksListPayload(
        { data: { unexpected: true } },
        { requestedPage: 3, requestedPageSize: 15 }
      )
    ).toEqual({
      items: [],
      pagination: {
        page: 3,
        pageSize: 15,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: true,
        hasNextPage: false,
      },
    });
  });
});
