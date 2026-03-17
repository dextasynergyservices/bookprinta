import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { AdminHeader } from "./admin-header";

const useAdminNotificationBellStateMock = jest.fn();
const useAuthSessionMock = jest.fn();
const usePathnameMock = jest.fn();
const routerReplaceMock = jest.fn();
const useReducedMotionMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        title: "Admin Panel",
        panel_label: "BookPrinta Admin",
        notifications_aria: "Open admin notifications",
        role_admin: "ADMIN",
        role_super_admin: "SUPER ADMIN",
        role_editor: "EDITOR",
        role_manager: "MANAGER",
        logout: "Log out",
        logout_loading: "Logging out...",
        logout_success: "Logged out successfully.",
        logout_error: "Unable to log out right now.",
        open_menu_aria: "Open admin menu",
        books: "Books",
      }) satisfies Record<string, string>
    )[key] ?? key,
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/hooks/use-admin-notifications", () => ({
  useAdminNotificationBellState: () => useAdminNotificationBellStateMock(),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => useReducedMotionMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

jest.mock("@/components/shared/language-switcher", () => ({
  LanguageSwitcher: () => <button type="button">Language switcher</button>,
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("AdminHeader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/admin/books");
    useReducedMotionMock.mockReturnValue(true);
    useAdminNotificationBellStateMock.mockReturnValue({
      unreadCount: 3,
      hasUnread: true,
      isLoading: false,
      isError: false,
      isFallback: false,
      badgeAnimationKey: 0,
    });
  });

  it("renders the admin title area, user identity, and actions", () => {
    const onOpenMobileMenu = jest.fn();
    const onNotificationsClick = jest.fn();

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
      logout: jest.fn(),
      isLoggingOut: false,
    });

    render(
      <AdminHeader
        onOpenMobileMenu={onOpenMobileMenu}
        onNotificationsClick={onNotificationsClick}
      />
    );

    expect(screen.getByText("Books")).toBeInTheDocument();
    expect(screen.getByText("BookPrinta Admin")).toBeInTheDocument();
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    expect(screen.getByText("SUPER ADMIN")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open admin menu" }));
    expect(onOpenMobileMenu).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Open admin notifications (3)",
      })[0]
    );
    expect(onNotificationsClick).toHaveBeenCalledTimes(1);
  });

  it("logs the user out and redirects to login", async () => {
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    window.history.replaceState({}, "", "/admin/books?status=PENDING&sort=createdAt");

    useAuthSessionMock.mockReturnValue({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        role: "ADMIN",
        displayName: "Admin User",
        initials: "AU",
      },
      logout: logoutMock,
      isLoggingOut: false,
    });

    render(<AdminHeader />);

    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]);

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        "/login?returnTo=%2Fadmin%2Fbooks%3Fstatus%3DPENDING%26sort%3DcreatedAt"
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Logged out successfully.");
  });
});
