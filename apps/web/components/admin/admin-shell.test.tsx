import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminShell } from "./admin-shell";

const useAuthSessionMock = jest.fn();
const usePathnameMock = jest.fn();
const useAdminNotificationUnreadCountMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        sidebar_expand_aria: "Expand sidebar",
        sidebar_collapse_aria: "Collapse sidebar",
      }) satisfies Record<string, string>
    )[key] ?? key,
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/hooks/use-admin-notifications", () => ({
  useAdminNotificationUnreadCount: () => useAdminNotificationUnreadCountMock(),
}));

jest.mock("@/hooks/use-admin-idle-logout", () => ({
  useAdminIdleLogout: jest.fn(),
}));

jest.mock("@/hooks/use-lenis", () => ({
  useLenis: () => ({ lenis: null }),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => true,
}));

jest.mock("@/lib/i18n/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

jest.mock("./admin-header", () => ({
  AdminHeader: ({
    onNotificationsClick,
    isNotificationsOpen,
    notificationsPanelId,
  }: {
    onNotificationsClick?: () => void;
    isNotificationsOpen?: boolean;
    notificationsPanelId?: string;
  }) => (
    <button
      type="button"
      aria-label="Open admin notifications"
      aria-haspopup="dialog"
      aria-expanded={isNotificationsOpen}
      aria-controls={isNotificationsOpen ? notificationsPanelId : undefined}
      onClick={onNotificationsClick}
    >
      admin-notifications-trigger
    </button>
  ),
}));

jest.mock("@/components/dashboard/notification-panel", () => ({
  NotificationPanel: ({ isOpen, panelId }: { isOpen: boolean; panelId: string }) =>
    isOpen ? (
      <section id={panelId} role="dialog">
        admin-notifications-panel
      </section>
    ) : null,
}));

jest.mock("./admin-sidebar", () => ({
  AdminSidebar: () => <div>admin-sidebar</div>,
}));

jest.mock("./admin-mobile-drawer", () => ({
  AdminMobileDrawer: () => null,
}));

jest.mock("./admin-content-frame", () => ({
  AdminContentFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("AdminShell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/admin/orders");
    useAuthSessionMock.mockReturnValue({
      user: {
        role: "ADMIN",
      },
    });
    useAdminNotificationUnreadCountMock.mockReturnValue({
      unreadCount: 3,
    });
  });

  it("opens the admin notifications panel from the header trigger and closes on outside click", async () => {
    render(
      <AdminShell>
        <div>admin-content</div>
      </AdminShell>
    );

    const trigger = screen.getByRole("button", { name: "Open admin notifications" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toHaveTextContent("admin-notifications-panel");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
