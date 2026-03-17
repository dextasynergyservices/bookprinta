import { renderHook } from "@testing-library/react";
import { useAdminQuoteDetail } from "./useAdminQuoteDetail";

const useQueryMock = jest.fn();

jest.mock("./useAdminQuotes", () => ({
  adminQuotesQueryKeys: {
    all: ["admin", "quotes"],
    lists: () => ["admin", "quotes", "list"],
    detail: (quoteId: string) => ["admin", "quotes", "detail", quoteId],
  },
}));

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled: boolean;
};

describe("useAdminQuoteDetail query options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("enables the remote query when a quote id is provided", () => {
    const quoteId = "cm1111111111111111111111111";
    renderHook(() => useAdminQuoteDetail({ quoteId }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(["admin", "quotes", "detail", quoteId]);
    expect(options.enabled).toBe(true);
  });

  it("disables the remote query and returns null quote data when the id is missing", () => {
    const { result } = renderHook(() => useAdminQuoteDetail({ quoteId: null }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(["admin", "quotes", "detail", ""]);
    expect(options.enabled).toBe(false);
    expect(result.current.quote).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it("exposes transition-safe loading state when placeholder data is active", () => {
    useQueryMock.mockReturnValueOnce({
      data: {
        id: "cm1111111111111111111111111",
      },
      isPending: false,
      isError: false,
      isFetching: true,
      isPlaceholderData: true,
      error: null,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useAdminQuoteDetail({ quoteId: "cm1111111111111111111111111" })
    );

    expect(result.current.isTransitioning).toBe(true);
  });
});
