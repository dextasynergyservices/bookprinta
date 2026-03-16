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
  refetchInterval: number;
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
    expect(options.refetchInterval).toBe(DASHBOARD_POLL_INTERVAL_MS);
    expect(options.refetchOnWindowFocus).toBe(true);
  });
});
