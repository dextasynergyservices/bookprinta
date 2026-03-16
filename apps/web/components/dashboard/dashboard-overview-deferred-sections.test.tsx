import type { OrdersListItem, UserBookListItem } from "@bookprinta/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DashboardOverviewDeferredSections } from "./dashboard-overview-deferred-sections";

const useNotificationsListMock = jest.fn();
const useBookFilesMock = jest.fn();
const useBookPreviewMock = jest.fn();

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  // biome-ignore lint/performance/noImgElement: test double for next/image
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
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

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useNotificationsList: (...args: unknown[]) => useNotificationsListMock(...args),
}));

jest.mock("@/hooks/useBookResources", () => ({
  useBookFiles: (...args: unknown[]) => useBookFilesMock(...args),
  useBookPreview: (...args: unknown[]) => useBookPreviewMock(...args),
}));

function createActiveBook(
  overrides: Partial<{
    title: UserBookListItem["title"];
    status: UserBookListItem["status"];
    productionStatus: UserBookListItem["productionStatus"];
    orderStatus: UserBookListItem["orderStatus"];
    currentStage: UserBookListItem["currentStage"];
    coverImageUrl: string | null;
    pageCount: number | null;
    estimatedPages: number | null;
    previewPdfUrlPresent: boolean;
    finalPdfUrlPresent: boolean;
    updatedAt: string;
    workspaceUrl: string;
    trackingUrl: string;
    processing: UserBookListItem["processing"];
  }> = {}
): UserBookListItem {
  const baseProcessing: UserBookListItem["processing"] = {
    isActive: false,
    currentStep: null,
    jobStatus: null,
    trigger: null,
    startedAt: null,
    attempt: null,
    maxAttempts: null,
  };

  return {
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
    workspaceUrl: "/dashboard/books?bookId=cmbook11111111111111111111111",
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
    ...overrides,
    processing: {
      ...baseProcessing,
      ...overrides.processing,
    },
  };
}

function createRecentOrder(
  overrides: Partial<{
    orderType: OrdersListItem["orderType"];
    status: OrdersListItem["status"];
    bookStatus: NonNullable<OrdersListItem["book"]>["status"];
    orderNumber: string;
    trackingUrl: string;
  }> = {}
): OrdersListItem {
  const baseBook: NonNullable<OrdersListItem["book"]> = {
    id: "cmbook11111111111111111111111",
    status: "PREVIEW_READY",
  };

  return {
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
    trackingUrl: "/dashboard/orders/cmorder1111111111111111111111",
    ...overrides,
    book: {
      ...baseBook,
      ...(overrides.bookStatus ? { status: overrides.bookStatus } : {}),
    },
  };
}

describe("DashboardOverviewDeferredSections", () => {
  beforeEach(() => {
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

  it("renders profile-incomplete and first-time-user states", () => {
    render(
      <DashboardOverviewDeferredSections
        activeBook={null}
        recentOrders={[]}
        notifications={{
          unreadCount: 0,
          hasProductionDelayBanner: false,
        }}
        profile={{
          isProfileComplete: false,
          preferredLanguage: "en",
        }}
        pendingActions={{
          total: 1,
          items: [
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
        }}
      />
    );

    expect(screen.getByText("overview_active_book_empty_title")).toBeInTheDocument();
    expect(screen.getByText("orders_empty_title")).toBeInTheDocument();
    expect(screen.getByText("overview_activity_feed_empty")).toBeInTheDocument();
    expect(screen.getByText("overview_profile_incomplete_title")).toBeInTheDocument();
    expect(screen.getByText("overview_reprint_ready_empty")).toBeInTheDocument();
    expect(screen.getByText("overview_support_title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /complete_profile_cta/ })).toHaveAttribute(
      "href",
      "/dashboard/profile"
    );
  });

  it("renders active production workspace states, documents, and recent activity", () => {
    useNotificationsListMock.mockReturnValue({
      items: [
        {
          id: "cmnotif1111111111111111111111",
          type: "ORDER_STATUS",
          isRead: false,
          createdAt: "2026-03-10T08:00:00.000Z",
          data: {
            titleKey: "notifications.order_status.title",
            messageKey: "notifications.order_status.message",
            params: {
              status: "Preview Ready",
            },
            action: {
              kind: "navigate",
              href: "/dashboard/orders/cmorder1111111111111111111111",
            },
          },
        },
      ],
      isInitialLoading: false,
      isError: false,
    });
    useBookPreviewMock.mockReturnValue({
      data: {
        bookId: "cmbook11111111111111111111111",
        previewPdfUrl: "https://cdn.example.com/preview.pdf",
        status: "PREVIEW_READY",
        watermarked: true,
      },
      isPending: false,
      isError: false,
    });
    useBookFilesMock.mockReturnValue({
      data: {
        bookId: "cmbook11111111111111111111111",
        files: [
          {
            id: "cmfile11111111111111111111111",
            fileType: "FINAL_PDF",
            url: "https://cdn.example.com/final.pdf",
            fileName: "final.pdf",
            fileSize: 1024,
            mimeType: "application/pdf",
            version: 2,
            createdBy: null,
            createdAt: "2026-03-10T08:00:00.000Z",
          },
        ],
      },
      isPending: false,
      isError: false,
    });

    render(
      <DashboardOverviewDeferredSections
        activeBook={createActiveBook({
          status: "FORMATTING",
          productionStatus: "FORMATTING",
          orderStatus: "PROCESSING",
          currentStage: "FORMATTING",
          pageCount: null,
          previewPdfUrlPresent: false,
          processing: {
            isActive: true,
            currentStep: "AI_FORMATTING",
            jobStatus: "processing",
            trigger: "upload",
            startedAt: "2026-03-10T08:00:00.000Z",
            attempt: 1,
            maxAttempts: 3,
          },
        })}
        recentOrders={[]}
        notifications={{
          unreadCount: 3,
          hasProductionDelayBanner: false,
        }}
        profile={{
          isProfileComplete: true,
          preferredLanguage: "en",
        }}
        pendingActions={{
          total: 0,
          items: [],
        }}
      />
    );

    expect(screen.getAllByText("book_progress_workspace_badge_processing")).toHaveLength(2);
    expect(screen.getByText("book_progress_workspace_heading_processing")).toBeInTheDocument();
    expect(screen.getAllByText("book_progress_meta_state_processing").length).toBeGreaterThan(0);
    expect(screen.getByText("overview_workspace_handoff_processing")).toBeInTheDocument();
    expect(screen.getByText("overview_documents_title")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "notifications.order_status.title. notifications.order_status.message",
      })
    ).toHaveAttribute("href", "/dashboard/orders/cmorder1111111111111111111111");
    expect(
      screen
        .getAllByRole("link", { name: "overview_documents_open" })
        .map((link) => link.getAttribute("href"))
    ).toEqual(
      expect.arrayContaining([
        "https://cdn.example.com/preview.pdf",
        "https://cdn.example.com/final.pdf",
      ])
    );
    expect(
      screen.getByRole("button", { name: "order_journey_download_invoice" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "book_progress_cta_open_workspace: The Lagos Chronicle",
      })
    ).toHaveAttribute("href", "/dashboard/books?bookId=cmbook11111111111111111111111");
  });

  it("renders delivered reprint and review-ready dashboard signals", () => {
    render(
      <DashboardOverviewDeferredSections
        activeBook={null}
        recentOrders={[
          createRecentOrder({
            orderType: "REPRINT_SAME",
            status: "COMPLETED",
            bookStatus: "DELIVERED",
            orderNumber: "BP-2026-0099",
            trackingUrl: "/dashboard/orders/cmorderreprint1111111111111111",
          }),
        ]}
        notifications={{
          unreadCount: 1,
          hasProductionDelayBanner: false,
        }}
        profile={{
          isProfileComplete: true,
          preferredLanguage: "en",
        }}
        pendingActions={{
          total: 1,
          items: [
            {
              type: "REVIEW_BOOK",
              priority: "medium",
              href: "/dashboard/reviews",
              bookId: "cmbook11111111111111111111111",
              orderId: null,
              bookTitle: "The Lagos Chronicle",
              bookStatus: "DELIVERED",
              orderStatus: null,
            },
          ],
        }}
      />
    );

    expect(screen.getByText("orders_reprint_badge")).toBeInTheDocument();
    expect(screen.getByText("overview_reprint_ready_title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "reprint_same" })).toHaveAttribute(
      "href",
      "/dashboard/books?bookId=cmbook11111111111111111111111&reprint=same"
    );
    expect(screen.getByRole("link", { name: "revise_reprint" })).toHaveAttribute(
      "href",
      "/pricing?orderType=REPRINT_REVISED&sourceBookId=cmbook11111111111111111111111"
    );
    expect(screen.getByRole("link", { name: /overview_action_review_book_title/ })).toHaveAttribute(
      "href",
      "/dashboard/reviews"
    );
    expect(
      screen.getByRole("link", {
        name: "orders_action_track: BP-2026-0099",
      })
    ).toHaveAttribute("href", "/dashboard/orders/cmorderreprint1111111111111111");
  });

  it("opens refund policy as an in-dashboard modal from the support card", async () => {
    const user = userEvent.setup();

    render(
      <DashboardOverviewDeferredSections
        activeBook={null}
        recentOrders={[]}
        notifications={{
          unreadCount: 0,
          hasProductionDelayBanner: false,
        }}
        profile={{
          isProfileComplete: true,
          preferredLanguage: "en",
        }}
        pendingActions={{
          total: 0,
          items: [],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "order_tracking_refund_policy_link" }));

    expect(screen.getByText("order_tracking_refund_policy_modal_title")).toBeInTheDocument();
    expect(
      screen.getByText("order_tracking_refund_policy_rule_before_processing")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "order_tracking_refund_policy_modal_contact" })
    ).toHaveAttribute("href", "https://wa.me/2348103208297");
  });

  it("renders shaped skeletons for nested overview activity loading states", () => {
    useNotificationsListMock.mockReturnValue({
      items: [],
      isInitialLoading: true,
      isFetching: true,
      isError: false,
      refetch: jest.fn(),
    });
    useBookFilesMock.mockReturnValue({
      data: {
        bookId: "cmbook11111111111111111111111",
        files: [],
      },
      isPending: true,
      isError: false,
    });
    useBookPreviewMock.mockReturnValue({
      data: null,
      isPending: true,
      isError: false,
    });

    const { container } = render(
      <DashboardOverviewDeferredSections
        activeBook={createActiveBook()}
        recentOrders={[]}
        notifications={{
          unreadCount: 2,
          hasProductionDelayBanner: false,
        }}
        profile={{
          isProfileComplete: true,
          preferredLanguage: "en",
        }}
        pendingActions={{
          total: 0,
          items: [],
        }}
      />
    );

    expect(
      container.querySelectorAll('[data-dashboard-skeleton="notification-item"]').length
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
