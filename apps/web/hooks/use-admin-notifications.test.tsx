import { renderHook, waitFor } from "@testing-library/react";
import {
  ADMIN_NOTIFICATIONS_POLL_INTERVAL_MS,
  ADMIN_UNREAD_COUNT_QUERY_KEY,
  useAdminNotificationBellState,
  useAdminNotificationUnreadCount,
} from "./use-admin-notifications";

const useQueryMock = jest.fn();
const useAuthSessionMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

jest.mock("./use-auth-session", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: "always" | false;
};

describe("use-admin-notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "admin-1",
        role: "ADMIN",
      },
      isAuthenticated: true,
    });
    useQueryMock.mockReturnValue({
      data: {
        unreadCount: 2,
        isFallback: false,
      },
      isLoading: false,
      isError: false,
    });
  });

  it("polls unread admin notifications every 30 seconds for authenticated admins", () => {
    renderHook(() => useAdminNotificationUnreadCount());

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(ADMIN_UNREAD_COUNT_QUERY_KEY);
    expect(options.enabled).toBe(true);
    expect(options.refetchInterval).toBe(ADMIN_NOTIFICATIONS_POLL_INTERVAL_MS);
    expect(options.refetchIntervalInBackground).toBe(true);
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.refetchOnMount).toBe("always");
  });

  it("disables polling when the current user is not an admin", () => {
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "customer-1",
        role: "USER",
      },
      isAuthenticated: true,
    });

    renderHook(() => useAdminNotificationUnreadCount());

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.enabled).toBe(false);
    expect(options.refetchInterval).toBe(false);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchOnMount).toBe(false);
  });

  it("increments the badge animation key only when unread count increases", async () => {
    const { result, rerender } = renderHook(() => useAdminNotificationBellState());

    expect(result.current.badgeAnimationKey).toBe(0);

    useQueryMock.mockReturnValue({
      data: {
        unreadCount: 5,
        isFallback: false,
      },
      isLoading: false,
      isError: false,
    });

    rerender();

    await waitFor(() => {
      expect(result.current.badgeAnimationKey).toBe(1);
    });

    useQueryMock.mockReturnValue({
      data: {
        unreadCount: 3,
        isFallback: false,
      },
      isLoading: false,
      isError: false,
    });

    rerender();

    await waitFor(() => {
      expect(result.current.badgeAnimationKey).toBe(1);
    });
  });
});
