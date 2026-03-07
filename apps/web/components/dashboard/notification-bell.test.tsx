import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotificationBell } from "./notification-bell";

const useNotificationUnreadCountMock = jest.fn();
const useNotificationsListMock = jest.fn();
const useMarkNotificationReadMock = jest.fn();
const useMarkAllNotificationsReadMock = jest.fn();
const useReducedMotionMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    typeof values?.count === "number" ? `${values.count} unread notifications` : key,
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useNotificationUnreadCount: () => useNotificationUnreadCountMock(),
  useNotificationsList: (options: unknown) => useNotificationsListMock(options),
  useMarkNotificationRead: () => useMarkNotificationReadMock(),
  useMarkAllNotificationsRead: () => useMarkAllNotificationsReadMock(),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => useReducedMotionMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

describe("NotificationBell", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query.includes("min-width: 1024px"),
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    useNotificationUnreadCountMock.mockReturnValue({
      unreadCount: 3,
      hasUnread: true,
      isLoading: false,
      isError: false,
      isFallback: false,
    });
    useReducedMotionMock.mockReturnValue(true);
    useNotificationsListMock.mockReturnValue({
      items: [],
      isInitialLoading: false,
      isError: false,
    });
    useMarkNotificationReadMock.mockReturnValue({
      markAsRead: jest.fn(),
    });
    useMarkAllNotificationsReadMock.mockReturnValue({
      markAllAsRead: jest.fn(),
      isPending: false,
    });
  });

  it("opens the notification panel and closes it on Escape", async () => {
    render(<NotificationBell />);

    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "header_notifications_aria" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("notifications_empty")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes the notification panel on outside click", async () => {
    render(<NotificationBell />);

    fireEvent.click(screen.getByRole("button", { name: "header_notifications_aria" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("increments the badge bounce sequence when unread count increases", async () => {
    useReducedMotionMock.mockReturnValue(false);
    useNotificationUnreadCountMock.mockReturnValue({
      unreadCount: 1,
      hasUnread: true,
      isLoading: false,
      isError: false,
      isFallback: false,
    });

    const { rerender } = render(<NotificationBell />);

    const initialBadge = screen.getByText("1");
    expect(initialBadge).toHaveAttribute("data-bounce-seq", "0");

    useNotificationUnreadCountMock.mockReturnValue({
      unreadCount: 4,
      hasUnread: true,
      isLoading: false,
      isError: false,
      isFallback: false,
    });

    rerender(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByText("4")).toHaveAttribute("data-bounce-seq", "1");
    });
  });
});
