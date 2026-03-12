import { render, screen, waitFor } from "@testing-library/react";
import { AdminAuthGate } from "./admin-auth-gate";

const useAuthSessionMock = jest.fn();
const usePathnameMock = jest.fn();
const routerReplaceMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    if (key === "loading") return "Loading admin workspace...";
    return key;
  },
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

describe("AdminAuthGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/admin/payments");
  });

  it("shows the loading state while auth is unresolved", () => {
    useAuthSessionMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(
      <AdminAuthGate>
        <div>Protected admin content</div>
      </AdminAuthGate>
    );

    expect(screen.getByText("Loading admin workspace...")).toBeInTheDocument();
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument();
  });

  it("retries the session once and then redirects unauthenticated users to login", async () => {
    const refetchMock = jest.fn();

    useAuthSessionMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    render(
      <AdminAuthGate>
        <div>Protected admin content</div>
      </AdminAuthGate>
    );

    await waitFor(() => {
      expect(refetchMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/login?next=%2Fadmin%2Fpayments");
    });
  });

  it("redirects authenticated non-admin users to login with next", async () => {
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "user-1",
        email: "author@example.com",
        firstName: "Author",
        lastName: null,
        role: "USER",
        displayName: "Author",
        initials: "AU",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(
      <AdminAuthGate>
        <div>Protected admin content</div>
      </AdminAuthGate>
    );

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/login?next=%2Fadmin%2Fpayments");
    });
  });

  it("redirects admins without section access to their default allowed route", async () => {
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "editor-1",
        email: "editor@example.com",
        firstName: "Editor",
        lastName: "User",
        role: "EDITOR",
        displayName: "Editor User",
        initials: "EU",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(
      <AdminAuthGate>
        <div>Protected admin content</div>
      </AdminAuthGate>
    );

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/showcase");
    });
  });

  it("renders children for admins with access to the current route", () => {
    usePathnameMock.mockReturnValue("/admin/resources");
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "editor-1",
        email: "editor@example.com",
        firstName: "Editor",
        lastName: "User",
        role: "EDITOR",
        displayName: "Editor User",
        initials: "EU",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(
      <AdminAuthGate>
        <div>Protected admin content</div>
      </AdminAuthGate>
    );

    expect(screen.getByText("Protected admin content")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("renders children for unknown admin paths so route-level 404 handling can take over", () => {
    usePathnameMock.mockReturnValue("/admin/unknown");
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "super-admin-1",
        email: "super@example.com",
        firstName: "Super",
        lastName: "Admin",
        role: "SUPER_ADMIN",
        displayName: "Super Admin",
        initials: "SA",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(
      <AdminAuthGate>
        <div>Protected admin content</div>
      </AdminAuthGate>
    );

    expect(screen.getByText("Protected admin content")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});
