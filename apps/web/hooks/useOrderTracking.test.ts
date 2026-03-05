import { fetchOrderTracking, orderTrackingQueryKeys } from "./useOrderTracking";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

describe("useOrderTracking data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchOrderTracking requests /orders/:id/tracking with credentials and normalizes response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        bookId: "book_1",
        currentOrderStatus: "IN_PRODUCTION",
        currentBookStatus: "PRINTING",
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

    const result = await fetchOrderTracking({ orderId: "ord_1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/orders/ord_1/tracking");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    expect(result.orderId).toBe("ord_1");
    expect(result.orderNumber).toBe("BP-2026-0001");
    expect(result.bookId).toBe("book_1");
    expect(result.currentStage).toBe("PRINTING");
    expect(result.timeline.find((entry) => entry.stage === "PRINTING")?.state).toBe("current");
  });

  it("delegates non-ok responses to throwApiError", async () => {
    const expectedError = new Error("Unable to load your order tracking");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchOrderTracking({ orderId: "ord_1" })).rejects.toThrow(expectedError);
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });

  it("returns friendly message for network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(fetchOrderTracking({ orderId: "ord_1" })).rejects.toThrow(
      "Unable to load your order tracking right now"
    );
  });

  it("exposes stable query keys", () => {
    expect(orderTrackingQueryKeys.all).toEqual(["order-tracking"]);
    expect(orderTrackingQueryKeys.detail("ord_1")).toEqual(["order-tracking", "detail", "ord_1"]);
  });
});
