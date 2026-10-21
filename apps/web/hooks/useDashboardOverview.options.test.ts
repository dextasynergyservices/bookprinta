import { renderHook } from "@testing-library/react";
import {
  DASHBOARD_POLL_INTERVAL_MS,
  DASHBOARD_QUERY_GC_TIME_MS,
  DASHBOARD_QUERY_RETRY_COUNT,
  DASHBOARD_STATUS_STALE_TIME_MS,
} from "@/lib/dashboard/query-defaults";
import { dashboardOverviewQueryKey, useDashboardOverview } from "./useDashboardOverview";

const useQueryMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled: boolean;
  staleTime: number;
  gcTime: number;
  retry: number;
  // Status-aware: TanStack Query calls this per refetch so the dashboard can
  // drop to a heartbeat rate when SSE is live or the book is in a
  // slow-changing state, instead of polling every 30s regardless.
  refetchInterval: (query: { state: { data: unknown } }) => number;
  refetchOnWindowFocus: boolean;
};

describe("useDashboardOverview query options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("uses the shared dashboard status polling policy", () => {
    renderHook(() => useDashboardOverview({ enabled: false }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(dashboardOverviewQueryKey);
    expect(options.enabled).toBe(false);
    expect(options.staleTime).toBe(DASHBOARD_STATUS_STALE_TIME_MS);
    expect(options.gcTime).toBe(DASHBOARD_QUERY_GC_TIME_MS);
    expect(options.retry).toBe(DASHBOARD_QUERY_RETRY_COUNT);
    // Asserts the resolved interval rather than identity: refetchInterval
    // became a function when status-aware polling was introduced, so a
    // `toBe(number)` check compared a function to a number and failed. With
    // no data loaded yet it must fall back to the standard poll interval.
    expect(options.refetchInterval({ state: { data: undefined } })).toBe(
      DASHBOARD_POLL_INTERVAL_MS
    );
    expect(options.refetchOnWindowFocus).toBe(true);
  });
});
