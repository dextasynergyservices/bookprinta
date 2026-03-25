import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { DashboardOverviewView } from "./dashboard-overview-view";

const useDashboardOverviewPageDataMock = jest.fn();
const useAuthSessionMock = jest.fn();
const useNotificationsListMock = jest.fn();
const useBookFilesMock = jest.fn();
const useBookPreviewMock = jest.fn();

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === "common") {
      if (key === "retry") return "Try Again";
      if (key === "loading") return "Loading...";
    }

    return key;
  },
}));

jest.mock("next/dynamic", () => () => {
  return function DynamicDashboardOverviewDeferredSections(props: Record<string, unknown>) {
    const { DashboardOverviewDeferredSections } = jest.requireActual(
      "./dashboard-overview-deferred-sections"
    );

    return <DashboardOverviewDeferredSections {...props} />;
  };
});

jest.mock("next/image", () => ({
  __esModule: true,
  // biome-ignore lint/performance/noImgElement: test double for next/image
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));

jest.mock("@/hooks/useDashboardOverviewPageData", () => ({
  useDashboardOverviewPageData: () => useDashboardOverviewPageDataMock(),
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useNotificationsList: (...args: unknown[]) => useNotificationsListMock(...args),
}));

jest.mock("@/hooks/useBookResources", () => ({
  useBookFiles: (...args: unknown[]) => useBookFilesMock(...args),
  useBookPreview: (...args: unknown[]) => useBookPreviewMock(...args),
}));

jest.mock("@/hooks/use-book-reprint-config", () => ({
  useBookReprintConfig: () => ({
    data: null,
    config: null,
    isInitialLoading: false,
    isPending: false,
    isError: false,
  }),
}));

jest.mock("./reprint-same-modal", () => ({
  ReprintSameModal: () => null,
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("DashboardOverviewView", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useAuthSessionMock.mockReturnValue({
      user: {
        displayName: "Amina Yusuf",
      },
    });
    useNotificationsListMock.mockReturnValue({
      items: [],
      isInitialLoading: false,
      isError: false,
    });
    useBookFilesMock.mockReturnValue({
      data: {
        bookId: "cmbook11111111111111111111111",
        files: [],
      },
      isPending: false,
      isError: false,
    });
    useBookPreviewMock.mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
    });
  });

  it("renders the loading skeleton while the overview query is pending", () => {
    useDashboardOverviewPageDataMock.mockReturnValue({
      isInitialLoading: true,
      isError: false,
    });

    render(<DashboardOverviewView />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("overview_editorial_title")).not.toBeInTheDocument();
  });

  it("renders the overview sections from the dashboard contract", () => {
    useDashboardOverviewPageDataMock.mockReturnValue({
      isInitialLoading: false,
      isError: false,
      refetch: jest.fn(),
      activeBook: {
        id: "cmbook11111111111111111111111",
        orderId: "cmorder1111111111111111111111",
        title: "The Lagos Chronicle",
        status: "PREVIEW_READY",
        productionStatus: "REVIEW",
        orderStatus: "PREVIEW_READY",
        currentStage: "REVIEW",
        coverImageUrl: null,
        latestProcessingError: null,
        rejectionReason: null,
        pageCount: 180,
        wordCount: 52000,
        estimatedPages: 176,
        fontSize: 12,
        pageSize: "A5",
        previewPdfUrlPresent: true,
        finalPdfUrlPresent: false,
        createdAt: "2026-03-01T08:00:00.000Z",
        updatedAt: "2026-03-10T08:00:00.000Z",
        workspaceUrl: "/dashboard/books/cmbook11111111111111111111111",
        trackingUrl: "/dashboard/orders/cmorder1111111111111111111111",
        rollout: {
          environment: "staging",
          allowInFlightAccess: true,
          isGrandfathered: false,
          blockedBy: null,
          workspace: { enabled: true, access: "enabled" },
          manuscriptPipeline: { enabled: true, access: "enabled" },
          billingGate: { enabled: true, access: "enabled" },
          finalPdf: { enabled: true, access: "enabled" },
        },
        processing: {
          isActive: false,
          currentStep: null,
          jobStatus: null,
          trigger: null,
          startedAt: null,
          attempt: null,
          maxAttempts: null,
        },
      },
      recentOrders: [
        {
          id: "cmorder1111111111111111111111",
          orderNumber: "BP-2026-0001",
          orderType: "STANDARD",
          status: "PREVIEW_READY",
          createdAt: "2026-03-01T08:00:00.000Z",
          totalAmount: 125000,
          currency: "NGN",
          package: {
            id: "cmpackage1111111111111111111",
            name: "Author Launch",
            slug: "author-launch",
          },
          book: {
            id: "cmbook11111111111111111111111",
            status: "PREVIEW_READY",
          },
          trackingUrl: "/dashboard/orders/cmorder1111111111111111111111",
        },
      ],
      notifications: {
        unreadCount: 4,
        hasProductionDelayBanner: true,
      },
      profile: {
        isProfileComplete: false,
        preferredLanguage: "en",
      },
      pendingActions: {
        total: 2,
        items: [
          {
            type: "REVIEW_PREVIEW",
            priority: "high",
            href: "/dashboard/books/cmbook11111111111111111111111",
            bookId: "cmbook11111111111111111111111",
            orderId: "cmorder1111111111111111111111",
            bookTitle: "The Lagos Chronicle",
            bookStatus: "PREVIEW_READY",
            orderStatus: "PREVIEW_READY",
          },
          {
            type: "COMPLETE_PROFILE",
            priority: "medium",
            href: "/dashboard/profile",
            bookId: null,
            orderId: null,
            bookTitle: null,
            bookStatus: null,
            orderStatus: null,
          },
        ],
      },
    });

    render(<DashboardOverviewView />);

    expect(screen.getByText("overview_editorial_title")).toBeInTheDocument();
    expect(screen.getByText("overview_next_action_eyebrow")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "The Lagos Chronicle",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Author Launch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my_books/ })).toHaveAttribute(
      "href",
      "/dashboard/books"
    );
    expect(
      screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/dashboard/profile")
    ).toBe(true);
  });

  it("renders empty states when there is no active book or recent orders", () => {
    useDashboardOverviewPageDataMock.mockReturnValue({
      isInitialLoading: false,
      isError: false,
      refetch: jest.fn(),
      activeBook: null,
      recentOrders: [],
      notifications: {
        unreadCount: 0,
        hasProductionDelayBanner: false,
      },
      profile: {
        isProfileComplete: true,
        preferredLanguage: "en",
      },
      pendingActions: {
        total: 0,
        items: [],
      },
    });

    render(<DashboardOverviewView />);

    expect(screen.getByText("overview_next_action_idle_title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /overview_next_action_idle_cta/ })).toHaveAttribute(
      "href",
      "/pricing"
    );
    expect(screen.getByText("overview_active_book_empty_title")).toBeInTheDocument();
    expect(screen.getByText("orders_empty_title")).toBeInTheDocument();
    expect(screen.getByText("overview_notifications_no_actions")).toBeInTheDocument();
  });

  it("shows the error state and retries the query", () => {
    const refetch = jest.fn();
    useDashboardOverviewPageDataMock.mockReturnValue({
      isInitialLoading: false,
      isError: true,
      refetch,
    });

    render(<DashboardOverviewView />);

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
