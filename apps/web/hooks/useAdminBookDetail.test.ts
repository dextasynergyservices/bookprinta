import { fetchAdminBookDetail } from "./useAdminBookDetail";
import { adminBooksQueryKeys } from "./useAdminBooks";

const throwApiErrorMock = jest.fn();

jest.mock("./useAdminBooks", () => ({
  adminBooksQueryKeys: {
    all: ["admin", "books"],
    detail: (bookId: string) => ["admin", "books", "detail", bookId],
  },
}));

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

describe("useAdminBookDetail data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchAdminBookDetail requests /admin/books/:id with credentials", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING",
        productionStatus: "FORMATTING_REVIEW",
        displayStatus: "FORMATTING_REVIEW",
        statusSource: "production",
        title: "The Lagos Chronicle",
        coverImageUrl: null,
        latestProcessingError: null,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null,
        pageCount: 184,
        wordCount: 42100,
        estimatedPages: 188,
        fontFamily: "Miller Text",
        fontSize: 12,
        pageSize: "A5",
        currentHtmlUrl: "https://example.com/current.html",
        previewPdfUrl: "https://example.com/preview.pdf",
        finalPdfUrl: "https://example.com/final.pdf",
        uploadedAt: "2026-03-10T09:30:00.000Z",
        version: 3,
        createdAt: "2026-03-10T09:30:00.000Z",
        updatedAt: "2026-03-11T14:45:00.000Z",
        rollout: {
          environment: "development",
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
        timeline: [],
        author: {
          id: "user_1",
          fullName: "Ada Okafor",
          email: "ada@example.com",
          preferredLanguage: "en",
        },
        order: {
          id: "cm2222222222222222222222222",
          orderNumber: "BP-2026-0001",
          status: "PROCESSING",
          detailUrl: "/admin/orders/cm2222222222222222222222222",
        },
        files: [],
        statusControl: {
          currentStatus: "FORMATTING_REVIEW",
          statusSource: "production",
          expectedVersion: 3,
          nextAllowedStatuses: ["PREVIEW_READY"],
          canRejectManuscript: true,
          canUploadHtmlFallback: true,
        },
      }),
    } as unknown as Response);

    const result = await fetchAdminBookDetail({
      bookId: "cm1111111111111111111111111",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/api/v1/admin/books/cm1111111111111111111111111"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    expect(result.id).toBe("cm1111111111111111111111111");
    expect(result.displayStatus).toBe("FORMATTING_REVIEW");
  });

  it("delegates non-ok responses to throwApiError", async () => {
    const expectedError = new Error("Unable to load admin book details");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn().mockResolvedValue({ message: "Not found" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchAdminBookDetail({ bookId: "cm1111111111111111111111111" })).rejects.toThrow(
      expectedError
    );
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });

  it("returns a friendly error for network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(fetchAdminBookDetail({ bookId: "cm1111111111111111111111111" })).rejects.toThrow(
      "Unable to load admin book details right now."
    );
  });

  it("keeps the admin book detail query key stable", () => {
    expect(adminBooksQueryKeys.detail("cm1111111111111111111111111")).toEqual([
      "admin",
      "books",
      "detail",
      "cm1111111111111111111111111",
    ]);
  });
});
