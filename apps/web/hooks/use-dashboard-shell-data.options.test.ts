import { renderHook } from "@testing-library/react";
import { DASHBOARD_POLL_INTERVAL_MS } from "@/lib/dashboard/query-defaults";
import {
  DASHBOARD_UNREAD_COUNT_QUERY_KEY,
  dashboardNotificationsQueryKeys,
  useNotificationsList,
  useNotificationUnreadCount,
} from "./use-dashboard-shell-data";

const useQueryMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol.for("keepPreviousData"),
  useQuery: (options: unknown) => useQueryMock(options),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

describe("use-dashboard-shell-data query options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("keeps unread count polling active every 30 seconds", () => {
    renderHook(() => useNotificationUnreadCount());

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(DASHBOARD_UNREAD_COUNT_QUERY_KEY);
    expect(options.refetchInterval).toBe(DASHBOARD_POLL_INTERVAL_MS);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("fetches notifications lazily until the panel opens", () => {
    renderHook(() => useNotificationsList({ page: 2, pageSize: 5, isOpen: false }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(dashboardNotificationsQueryKeys.list(2, 5));
    expect(options.enabled).toBe(false);
    expect(options.refetchInterval).toBe(false);
  });

  it("polls the open notifications panel every 30 seconds", () => {
    renderHook(() => useNotificationsList({ page: 1, pageSize: 20, isOpen: true }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(dashboardNotificationsQueryKeys.list(1, 20));
    expect(options.enabled).toBe(true);
    expect(options.refetchInterval).toBe(DASHBOARD_POLL_INTERVAL_MS);
    expect(options.refetchOnWindowFocus).toBe(true);
  });
});
