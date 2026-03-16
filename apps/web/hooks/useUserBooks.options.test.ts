import { keepPreviousData } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import {
  DASHBOARD_POLL_INTERVAL_MS,
  DASHBOARD_QUERY_GC_TIME_MS,
  DASHBOARD_QUERY_RETRY_COUNT,
  DASHBOARD_STATUS_STALE_TIME_MS,
} from "@/lib/dashboard/query-defaults";
import { userBooksQueryKeys, useUserBooks } from "./useUserBooks";

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
  refetchInterval: number;
  refetchOnWindowFocus: boolean;
};

describe("useUserBooks query options", () => {
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

  it("uses the shared dashboard status polling policy for paginated books", () => {
    renderHook(() => useUserBooks({ page: 2, pageSize: 5, enabled: false }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(userBooksQueryKeys.list(2, 5));
    expect(options.enabled).toBe(false);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DASHBOARD_STATUS_STALE_TIME_MS);
    expect(options.gcTime).toBe(DASHBOARD_QUERY_GC_TIME_MS);
    expect(options.retry).toBe(DASHBOARD_QUERY_RETRY_COUNT);
    expect(options.refetchInterval).toBe(DASHBOARD_POLL_INTERVAL_MS);
    expect(options.refetchOnWindowFocus).toBe(true);
  });
});
