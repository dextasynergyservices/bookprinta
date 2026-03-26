import {
  isReprintOrderType,
  normalizeOrdersListPayload,
  resolveOrderLifecycle,
} from "./orders-contract";

describe("normalizeOrdersListPayload", () => {
  it("normalizes nested data/items payload shape", () => {
    const payload = {
      data: {
        items: [
          {
            id: "ord_1",
            orderNumber: "BP-2026-0001",
            orderType: "STANDARD",
            status: "PAID",
            createdAt: "2026-03-01T08:30:00.000Z",
            totalAmount: "125000",
            currency: "NGN",
            package: { name: "Legacy" },
            book: { id: "book_1", status: "PRINTING" },
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          hasNextPage: false,
        },
      },
    };

    const normalized = normalizeOrdersListPayload(payload, {
      requestedPage: 1,
      requestedPageSize: 10,
    });

    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toEqual({
      id: "ord_1",
      orderNumber: "BP-2026-0001",
      packageName: "Legacy",
      orderType: "STANDARD",
      orderStatus: "PAID",
      bookId: "book_1",
      bookStatus: "PRINTING",
      createdAt: "2026-03-01T08:30:00.000Z",
      totalAmount: 125000,
      currency: "NGN",
    });
    expect(normalized.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      nextCursor: null,
    });
  });

  it("supports flat payloads and resilient key variants", () => {
    const payload = {
      orders: [
        {
          orderId: "ord_2",
          reference: "BP-2026-0002",
          tier: "First Draft",
          orderType: "REPRINT",
          orderStatus: "PROCESSING",
          bookStatus: "SHIPPING",
          orderDate: "2026-03-02T10:00:00.000Z",
          amountPaid: "98000.50",
        },
      ],
      page: 2,
      pageSize: 20,
      totalItems: 41,
      hasNextPage: true,
    };

    const normalized = normalizeOrdersListPayload(payload);

    expect(normalized.items[0]).toMatchObject({
      id: "ord_2",
      orderNumber: "BP-2026-0002",
      packageName: "First Draft",
      orderType: "REPRINT",
      orderStatus: "PROCESSING",
      bookId: null,
      bookStatus: "SHIPPING",
      totalAmount: 98000.5,
      currency: "NGN",
    });
    expect(normalized.pagination.page).toBe(2);
    expect(normalized.pagination.pageSize).toBe(20);
    expect(normalized.pagination.totalItems).toBe(41);
    expect(normalized.pagination.hasNextPage).toBe(true);
  });
});

describe("resolveOrderLifecycle", () => {
  it("uses book status as truth source for delivered mapping", () => {
    const lifecycle = resolveOrderLifecycle({
      orderStatus: "IN_PRODUCTION",
      bookStatus: "DELIVERED",
    });

    expect(lifecycle).toEqual({
      source: "book",
      sourceStatus: "DELIVERED",
      tone: "delivered",
    });
  });

  it("falls back to order status when book status is absent", () => {
    const lifecycle = resolveOrderLifecycle({
      orderStatus: "COMPLETED",
      bookStatus: null,
    });

    expect(lifecycle).toEqual({
      source: "order",
      sourceStatus: "COMPLETED",
      tone: "delivered",
    });
  });

  it("prioritizes order-level issue statuses", () => {
    const lifecycle = resolveOrderLifecycle({
      orderStatus: "ACTION_REQUIRED",
      bookStatus: "SHIPPING",
    });

    expect(lifecycle).toEqual({
      source: "order",
      sourceStatus: "ACTION_REQUIRED",
      tone: "issue",
    });
  });
});

describe("isReprintOrderType", () => {
  it("detects both reprint order variants", () => {
    expect(isReprintOrderType("REPRINT")).toBe(true);
    expect(isReprintOrderType("standard")).toBe(false);
  });
});
