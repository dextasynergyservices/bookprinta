import { act, renderHook, waitFor } from "@testing-library/react";
import { ADMIN_IDLE_TIMEOUT_MS, useAdminIdleLogout } from "./use-admin-idle-logout";
import { AUTH_SESSION_QUERY_KEY } from "./use-auth-session";

const useAuthSessionMock = jest.fn();
const routerReplaceMock = jest.fn();
const cancelQueriesMock = jest.fn().mockResolvedValue(undefined);
const removeQueriesMock = jest.fn();
const setQueryDataMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    cancelQueries: cancelQueriesMock,
    removeQueries: removeQueriesMock,
    setQueryData: setQueryDataMock,
  }),
}));

jest.mock("./use-auth-session", () => ({
  AUTH_SESSION_QUERY_KEY: ["auth", "session"],
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

describe("useAdminIdleLogout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "admin-1",
        role: "ADMIN",
      },
      isAuthenticated: true,
      isLoggingOut: false,
      logout: jest.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("logs out idle admins after one hour, clears session state, and redirects", async () => {
    const onIdleTimeout = jest.fn();
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "admin-1",
        role: "ADMIN",
      },
      isAuthenticated: true,
      isLoggingOut: false,
      logout: logoutMock,
    });

    const addEventListenerSpy = jest.spyOn(window, "addEventListener");

    renderHook(() => useAdminIdleLogout({ onIdleTimeout }));

    expect(addEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("touchstart", expect.any(Function));

    await act(async () => {
      jest.advanceTimersByTime(ADMIN_IDLE_TIMEOUT_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onIdleTimeout).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(cancelQueriesMock).toHaveBeenCalledWith({
        queryKey: AUTH_SESSION_QUERY_KEY,
      });
    });
    expect(setQueryDataMock).toHaveBeenCalledWith(AUTH_SESSION_QUERY_KEY, null);
    expect(removeQueriesMock).toHaveBeenCalledWith({
      queryKey: ["admin", "notifications"],
    });
    expect(routerReplaceMock).toHaveBeenCalledWith("/login");

    addEventListenerSpy.mockRestore();
  });

  it("resets the idle timer on user activity", async () => {
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "admin-1",
        role: "ADMIN",
      },
      isAuthenticated: true,
      isLoggingOut: false,
      logout: logoutMock,
    });

    renderHook(() => useAdminIdleLogout());

    await act(async () => {
      jest.advanceTimersByTime(ADMIN_IDLE_TIMEOUT_MS - 1_000);
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove"));
    });

    await act(async () => {
      jest.advanceTimersByTime(ADMIN_IDLE_TIMEOUT_MS - 1_000);
      await Promise.resolve();
    });

    expect(logoutMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });
  });

  it("stays inactive for non-admin sessions", async () => {
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "user-1",
        role: "USER",
      },
      isAuthenticated: true,
      isLoggingOut: false,
      logout: logoutMock,
    });

    renderHook(() => useAdminIdleLogout());

    await act(async () => {
      jest.advanceTimersByTime(ADMIN_IDLE_TIMEOUT_MS);
      await Promise.resolve();
    });

    expect(logoutMock).not.toHaveBeenCalled();
    expect(routerReplaceMock).not.toHaveBeenCalled();
    expect(setQueryDataMock).not.toHaveBeenCalled();
  });
});
