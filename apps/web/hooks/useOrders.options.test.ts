import { keepPreviousData } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import {
  DASHBOARD_HISTORY_STALE_TIME_MS,
  DASHBOARD_QUERY_GC_TIME_MS,
  DASHBOARD_QUERY_RETRY_COUNT,
} from "@/lib/dashboard/query-defaults";
import { ordersQueryKeys, useOrders } from "./useOrders";

const useQueryMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol.for("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled: boolean;
  placeholderData: unknown;
  staleTime: number;
  gcTime: number;
  retry: number;
};

describe("useOrders query options", () => {
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

  it("uses the shared dashboard history policy for paginated orders", () => {
    renderHook(() => useOrders({ page: 3, pageSize: 20, enabled: false }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(ordersQueryKeys.list(3, 20));
    expect(options.enabled).toBe(false);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DASHBOARD_HISTORY_STALE_TIME_MS);
    expect(options.gcTime).toBe(DASHBOARD_QUERY_GC_TIME_MS);
    expect(options.retry).toBe(DASHBOARD_QUERY_RETRY_COUNT);
  });
});
