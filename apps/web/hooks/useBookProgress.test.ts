import { bookProgressQueryKeys, fetchBookProgress } from "./useBookProgress";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

describe("useBookProgress data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchBookProgress requests /books/:id with credentials and normalizes response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "PRINTING",
        rejectionReason: null,
        timeline: [
          {
            status: "PAYMENT_RECEIVED",
            state: "completed",
            reachedAt: "2026-03-01T08:00:00.000Z",
          },
          {
            status: "PRINTING",
            state: "current",
            reachedAt: "2026-03-03T10:00:00.000Z",
          },
        ],
      }),
    } as unknown as Response);

    const result = await fetchBookProgress({ bookId: "cm1111111111111111111111111" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/books/cm1111111111111111111111111");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    expect(result.bookId).toBe("cm1111111111111111111111111");
    expect(result.currentStatus).toBe("PRINTING");
    expect(result.currentStage).toBe("PRINTING");
    expect(result.timeline.find((entry) => entry.stage === "PRINTING")?.state).toBe("current");
  });

  it("adapts order-tracking payload shape and keeps UI contract stable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        orderId: "cm2222222222222222222222222",
        currentBookStatus: "PREVIEW_READY",
        rejectionReason: null,
        timeline: [
          {
            status: "DESIGNED",
            state: "completed",
            reachedAt: "2026-03-02T08:00:00.000Z",
          },
          {
            status: "PREVIEW_READY",
            state: "current",
            reachedAt: "2026-03-03T10:00:00.000Z",
          },
        ],
      }),
    } as unknown as Response);

    const result = await fetchBookProgress({ bookId: "cm1111111111111111111111111" });

    expect(result.sourceEndpoint).toBe("orders_tracking");
    expect(result.bookId).toBe("cm1111111111111111111111111");
    expect(result.currentStage).toBe("REVIEW");
    expect(result.timeline.find((entry) => entry.stage === "REVIEW")?.state).toBe("current");
  });

  it("delegates non-ok responses to throwApiError", async () => {
    const expectedError = new Error("Unable to load your book progress");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchBookProgress({ bookId: "cm1111111111111111111111111" })).rejects.toThrow(
      expectedError
    );
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });

  it("returns friendly message for network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(fetchBookProgress({ bookId: "cm1111111111111111111111111" })).rejects.toThrow(
      "Unable to load your book progress right now"
    );
  });

  it("exposes stable query keys", () => {
    expect(bookProgressQueryKeys.all).toEqual(["book-progress"]);
    expect(bookProgressQueryKeys.detail("cm1111111111111111111111111")).toEqual([
      "book-progress",
      "detail",
      "cm1111111111111111111111111",
    ]);
  });
});
