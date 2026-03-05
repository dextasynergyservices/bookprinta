import { fetchOrdersPage, ordersQueryKeys } from "./useOrders";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

describe("useOrders data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchOrdersPage requests /orders with credentials and normalizes response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            id: "cm1111111111111111111111111",
            orderNumber: "BP-2026-0001",
            orderType: "STANDARD",
            status: "PAID",
            createdAt: "2026-03-01T10:00:00.000Z",
            totalAmount: "125000",
            currency: "NGN",
            package: {
              name: "Legacy",
            },
            book: {
              status: "PRINTING",
            },
          },
        ],
        pagination: {
          page: 2,
          pageSize: 5,
          totalItems: 11,
          totalPages: 3,
          hasPreviousPage: true,
          hasNextPage: true,
        },
      }),
    } as unknown as Response);

    const result = await fetchOrdersPage({ page: 2, pageSize: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/orders?page=2&limit=5");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    expect(result.items[0]).toMatchObject({
      id: "cm1111111111111111111111111",
      orderNumber: "BP-2026-0001",
      packageName: "Legacy",
      totalAmount: 125000,
      orderStatus: "PAID",
      bookStatus: "PRINTING",
    });
    expect(result.pagination).toMatchObject({
      page: 2,
      pageSize: 5,
      totalItems: 11,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    });
  });

  it("fetchOrdersPage delegates non-ok responses to throwApiError", async () => {
    const expectedError = new Error("Unable to load your orders");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchOrdersPage({ page: 1, pageSize: 10 })).rejects.toThrow(expectedError);
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });

  it("returns friendly message for network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(fetchOrdersPage({ page: 1, pageSize: 10 })).rejects.toThrow(
      "Unable to load your orders right now"
    );
  });

  it("exposes stable paginated query keys", () => {
    expect(ordersQueryKeys.all).toEqual(["orders"]);
    expect(ordersQueryKeys.list(3, 20)).toEqual(["orders", "list", 3, 20]);
    expect(ordersQueryKeys.detail("ord_1")).toEqual(["orders", "detail", "ord_1"]);
    expect(ordersQueryKeys.tracking("ord_1")).toEqual(["orders", "tracking", "ord_1"]);
  });
});
