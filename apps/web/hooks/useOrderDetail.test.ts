import { fetchOrderDetail } from "./useOrderDetail";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

describe("useOrderDetail data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchOrderDetail requests /orders/:id with credentials and normalizes response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "ord_1",
        orderNumber: "BP-2026-0001",
        package: {
          name: "Premium Print",
        },
        initialAmount: "120000",
        totalAmount: "125000",
        currency: "NGN",
        trackingNumber: "TRK-101",
        shippingProvider: "DHL",
        createdAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-03-02T11:00:00.000Z",
        addons: [
          {
            id: "addon_1",
            name: "Rush Delivery",
            price: "3000",
            wordCount: "8000",
          },
        ],
        payments: [
          {
            id: "cmf0pay000000000000000001",
            provider: "PAYSTACK",
            status: "SUCCESS",
            type: "ORDER_PAYMENT",
            amount: "125000",
            currency: "NGN",
            providerRef: "PSK_REF_001",
            createdAt: "2026-03-01T10:00:00.000Z",
          },
        ],
      }),
    } as unknown as Response);

    const result = await fetchOrderDetail({ orderId: "ord_1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/orders/ord_1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    expect(result.orderId).toBe("ord_1");
    expect(result.orderNumber).toBe("BP-2026-0001");
    expect(result.packageName).toBe("Premium Print");
    expect(result.packageAmount).toBe(120000);
    expect(result.totalAmount).toBe(125000);
    expect(result.latestPaymentStatus).toBe("SUCCESS");
    expect(result.latestPaymentProvider).toBe("PAYSTACK");
    expect(result.latestPaymentReference).toBe("PSK_REF_001");
    expect(result.addons).toEqual([
      {
        id: "addon_1",
        name: "Rush Delivery",
        price: 3000,
        wordCount: 8000,
      },
    ]);
  });

  it("delegates non-ok responses to throwApiError", async () => {
    const expectedError = new Error("Unable to load order details");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchOrderDetail({ orderId: "ord_1" })).rejects.toThrow(expectedError);
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });
});
