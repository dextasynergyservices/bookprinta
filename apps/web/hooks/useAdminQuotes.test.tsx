import { renderHook } from "@testing-library/react";
import { adminQuotesQueryKeys, useAdminQuotes } from "./useAdminQuotes";

const useQueryMock = jest.fn();

jest.mock("./use-admin-quotes-filters", () => ({
  ADMIN_QUOTES_LIMIT: 20,
  DEFAULT_ADMIN_QUOTES_SORT_BY: "createdAt",
  DEFAULT_ADMIN_QUOTES_SORT_DIRECTION: "desc",
}));

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
};

describe("useAdminQuotes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: "cm1111111111111111111111111",
            fullName: "Ada Okafor",
            email: "ada@example.com",
            workingTitle: "River of Words",
            bookPrintSize: "A5",
            quantity: 120,
            hasSpecialReqs: false,
            estimatedPriceLow: 150000,
            estimatedPriceHigh: 180000,
            status: "PENDING",
            paymentLink: {
              token: null,
              url: null,
              expiresAt: null,
              isActive: false,
              displayStatus: "NOT_SENT",
            },
            detailUrl: "/admin/quotes/cm1111111111111111111111111",
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:00:00.000Z",
          },
        ],
        nextCursor: "cm2222222222222222222222222",
        hasMore: true,
        totalItems: 42,
        limit: 20,
        sortBy: "createdAt",
        sortDirection: "desc",
        sortableFields: [
          "createdAt",
          "updatedAt",
          "fullName",
          "email",
          "workingTitle",
          "bookPrintSize",
          "quantity",
          "status",
          "finalPrice",
        ],
      },
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
    });
  });

  it("uses the admin quotes list query key with normalized filters", () => {
    const { result } = renderHook(() =>
      useAdminQuotes({
        cursor: " cursor_1 ",
        q: " Ada ",
        status: "PENDING",
      })
    );

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(
      adminQuotesQueryKeys.list({
        cursor: "cursor_1",
        limit: 20,
        status: "PENDING",
        q: "Ada",
        sortBy: "createdAt",
        sortDirection: "desc",
      })
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.isInitialLoading).toBe(false);
  });

  it("returns a safe empty response while the first request is pending", () => {
    useQueryMock.mockReturnValueOnce({
      data: undefined,
      isPending: true,
      isFetching: false,
      isPlaceholderData: false,
    });

    const { result } = renderHook(() => useAdminQuotes({}));

    expect(result.current.data).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
      totalItems: 0,
      limit: 20,
      sortBy: "createdAt",
      sortDirection: "desc",
      sortableFields: [
        "createdAt",
        "updatedAt",
        "fullName",
        "email",
        "workingTitle",
        "bookPrintSize",
        "quantity",
        "status",
        "finalPrice",
      ],
    });
    expect(result.current.isInitialLoading).toBe(true);
  });
});
