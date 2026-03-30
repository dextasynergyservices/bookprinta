import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AllPaymentsSection } from "./AllPaymentsSection";

let renderDesktopRegion = false;
const useAdminPaymentsFiltersMock = jest.fn();
const useAdminPaymentsMock = jest.fn();
const useAdminOrderDetailMock = jest.fn();
const useAdminPaymentRefundMutationMock = jest.fn();
const toastErrorMock = jest.fn();

const translations: Record<string, string> = {
  payments_all_eyebrow: "Payment Ledger",
  payments_all_title: "All Payments",
  payments_all_description:
    "Filter the complete payment ledger, inspect receipts, and launch refunds from the same admin workspace.",
  payments_filters_active: "{count} filters active",
  payments_filters_idle: "No filters active",
  payments_filters_clear: "Clear Filters",
  payments_filters_search_label: "Search",
  payments_filters_search_placeholder: "Search by ref, payer, email, or provider ref",
  payments_filters_status_label: "Status",
  payments_filters_provider_label: "Provider",
  payments_filters_all_statuses: "All statuses",
  payments_filters_all_providers: "All providers",
  payments_filters_date_label: "Date Range",
  payments_filters_date_placeholder: "Pick a date range",
  payments_filters_date_from: "From",
  payments_filters_date_to: "To",
  payments_filters_date_clear: "Clear Date",
  payments_summary_label: "Ledger Snapshot",
  payments_summary_total: "{shown} of {total} payments",
  payments_loading_more: "Loading more payments",
  payments_table_ref: "Ref",
  payments_table_user: "User",
  payments_table_amount: "Amount",
  payments_table_provider: "Provider",
  payments_table_status: "Status",
  payments_table_date: "Date",
  payments_table_actions: "Actions",
  payments_action_view_receipt: "Preview Receipt",
  payments_action_view_order: "View Order",
  payments_action_refund: "Refund",
  payments_action_manual_refund: "Manual Refund",
  payments_action_loading_refund: "Loading Refund",
  payments_action_refund_unavailable: "Refund Unavailable",
  payments_user_email_missing: "Email unavailable",
  payments_empty_title: "No payments match these filters",
  payments_empty_description:
    "Try widening the filters or clearing the search to load more payment history.",
  payments_error_title: "Unable to load payments",
  payments_error_description:
    "The payment ledger could not be loaded right now. Retry to refresh the latest records.",
  payments_pagination_aria: "Payments pagination",
  payments_pagination_page: "Page {page}",
  payments_pagination_page_of: "Page {page} of {totalPages}",
  payments_pagination_previous: "Previous",
  payments_pagination_next: "Next",
  payments_refund_order_error: "Unable to load refund details for this payment.",
  payments_refund_payment_error:
    "This payment could not be matched to the linked order refund details.",
  payments_pending_payer_unknown: "Payer unavailable",
  payments_total_unavailable: "Amount unavailable",
  payments_date_unavailable: "Date unavailable",
  payments_pending_provider_ref_missing: "Pending reference",
  payments_pending_checkout_stale: "Stale pending checkout ({age})",
  common_loading: "Loading...",
  common_retry: "Retry",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === "common") {
      return interpolate(translations[`common_${key}`] ?? key, values);
    }

    return interpolate(translations[key] ?? key, values);
  },
  useLocale: () => "en",
}));

jest.mock("@/components/dashboard/dashboard-content-frame", () => ({
  DashboardResponsiveDataRegion: ({
    mobileCards,
    desktopTable,
  }: {
    mobileCards: ReactNode;
    desktopTable: ReactNode;
  }) => <div>{renderDesktopRegion ? desktopTable : mobileCards}</div>,
  DashboardTableViewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/hooks/use-admin-payments-filters", () => {
  const actual = jest.requireActual("@/hooks/use-admin-payments-filters");

  return {
    ...actual,
    useAdminPaymentsFilters: () => useAdminPaymentsFiltersMock(),
  };
});

jest.mock("@/hooks/useAdminPayments", () => ({
  useAdminPayments: (input: unknown) => useAdminPaymentsMock(input),
}));

jest.mock("@/hooks/useAdminOrderDetail", () => ({
  useAdminOrderDetail: (input: unknown) => useAdminOrderDetailMock(input),
}));

jest.mock("@/hooks/useAdminPaymentActions", () => ({
  useAdminPaymentRefundMutation: () => useAdminPaymentRefundMutationMock(),
}));

jest.mock("../orders/[id]/AdminOrderRefundModal", () => ({
  AdminOrderRefundModal: ({
    open,
    payment,
    onSubmit,
    onOpenChange,
  }: {
    open: boolean;
    payment: { id: string } | null;
    onSubmit: (params: { paymentId: string; input: Record<string, unknown> }) => Promise<unknown>;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        <p>Refund Modal</p>
        <button
          type="button"
          onClick={() =>
            void onSubmit({
              paymentId: payment?.id ?? "",
              input: {
                type: "FULL",
                reason: "Duplicate payment",
                expectedOrderVersion: 4,
                policySnapshot: {
                  calculatedAt: "2026-03-13T10:59:00.000Z",
                  statusSource: "order",
                  stage: "PAID",
                  stageLabel: "Paid",
                  eligible: true,
                  policyDecision: "REFUNDED",
                  allowedRefundTypes: ["FULL"],
                  recommendedRefundType: "FULL",
                  orderTotalAmount: 50000,
                  recommendedAmount: 50000,
                  maxRefundAmount: 50000,
                  policyPercent: 100,
                  policyMessage: "Refund available.",
                },
              },
            })
          }
        >
          Confirm refund
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Close refund
        </button>
      </div>
    ) : null,
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

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function createBaseFilters() {
  return {
    status: "",
    provider: "",
    dateFrom: "",
    dateTo: "",
    q: "",
    cursor: "",
    sortBy: "createdAt" as const,
    sortDirection: "desc" as const,
    currentPage: 1,
    activeFilterCount: 0,
    hasActiveFilters: false,
    trail: [] as Array<string | null>,
    setStatus: jest.fn(),
    setProvider: jest.fn(),
    setSearch: jest.fn(),
    setDateRange: jest.fn(),
    clearFilters: jest.fn(),
    setSort: jest.fn(),
    goToNextCursor: jest.fn(),
    goToPreviousCursor: jest.fn(),
  };
}

function createPaymentsState() {
  const items = [
    {
      id: "pay_1",
      orderReference: "BP-REF-001",
      orderNumber: "BP-1001",
      orderId: "ord_1",
      userId: "user_1",
      customer: {
        id: "user_1",
        fullName: "Ada Okafor",
        email: "ada@example.com",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
      },
      provider: "PAYSTACK",
      type: "INITIAL",
      status: "SUCCESS",
      amount: 50000,
      currency: "NGN",
      providerRef: "ps_123",
      receiptUrl: "https://example.com/receipt.jpg",
      payerName: "Ada Okafor",
      payerEmail: "ada@example.com",
      payerPhone: "+2348012345678",
      adminNote: null,
      hasAdminNote: false,
      approvedAt: "2026-03-10T10:02:00.000Z",
      approvedBy: "admin_1",
      processedAt: "2026-03-10T10:02:00.000Z",
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:02:00.000Z",
      pendingCheckout: null,
      refundability: {
        isRefundable: true,
        processingMode: "gateway",
        reason: null,
        policySnapshot: null,
        orderVersion: 4,
        bookVersion: null,
      },
    },
  ];

  return {
    data: {
      items,
      nextCursor: "cursor_2",
      hasMore: true,
      totalItems: 2,
      limit: 20,
      sortBy: "createdAt" as const,
      sortDirection: "desc" as const,
      sortableFields: [
        "orderReference",
        "customerName",
        "customerEmail",
        "amount",
        "provider",
        "status",
        "createdAt",
      ],
    },
    items,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isFetching: false,
    isInitialLoading: false,
    isPageTransitioning: false,
  };
}

const refundOrderDetail = {
  id: "ord_1",
  orderNumber: "BP-1001",
  orderType: "NEW",
  orderStatus: "PAID",
  bookStatus: null,
  displayStatus: "PAID",
  statusSource: "order",
  orderVersion: 4,
  createdAt: "2026-03-10T10:00:00.000Z",
  updatedAt: "2026-03-10T10:02:00.000Z",
  customer: {
    id: "user_1",
    fullName: "Ada Okafor",
    email: "ada@example.com",
    phoneNumber: "+2348012345678",
    preferredLanguage: "en",
  },
  package: {
    id: "pkg_1",
    name: "Signature Memoir",
    slug: "signature-memoir",
  },
  shippingAddress: null,
  book: null,
  copies: 100,
  bookSize: "A5",
  paperColor: "Cream",
  lamination: "Matte",
  initialAmount: 50000,
  extraAmount: 0,
  discountAmount: 0,
  totalAmount: 50000,
  refundAmount: 0,
  refundReason: null,
  refundedAt: null,
  refundedBy: null,
  currency: "NGN",
  trackingNumber: null,
  shippingProvider: null,
  addons: [],
  payments: [
    {
      id: "pay_1",
      provider: "PAYSTACK",
      status: "SUCCESS",
      type: "INITIAL",
      amount: 50000,
      currency: "NGN",
      providerRef: "ps_123",
      receiptUrl: "https://example.com/receipt.jpg",
      payerName: "Ada Okafor",
      payerEmail: "ada@example.com",
      payerPhone: "+2348012345678",
      adminNote: null,
      approvedAt: "2026-03-10T10:02:00.000Z",
      approvedBy: "admin_1",
      processedAt: "2026-03-10T10:02:00.000Z",
      isRefundable: true,
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:02:00.000Z",
    },
  ],
  timeline: [],
  refundPolicy: {
    calculatedAt: "2026-03-13T10:59:00.000Z",
    statusSource: "order",
    stage: "PAID",
    stageLabel: "Paid",
    eligible: true,
    policyDecision: "REFUNDED",
    allowedRefundTypes: ["FULL"],
    recommendedRefundType: "FULL",
    orderTotalAmount: 50000,
    recommendedAmount: 50000,
    maxRefundAmount: 50000,
    policyPercent: 100,
    policyMessage: "Refund available.",
  },
  statusControl: {
    currentStatus: "PAID",
    expectedVersion: 4,
    nextAllowedStatuses: [],
  },
};

describe("AllPaymentsSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderDesktopRegion = false;
    useAdminPaymentsFiltersMock.mockReturnValue(createBaseFilters());
    useAdminPaymentsMock.mockReturnValue(createPaymentsState());
    useAdminOrderDetailMock.mockImplementation(({ orderId }: { orderId?: string | null }) => ({
      data: orderId ? refundOrderDetail : null,
      order: orderId ? refundOrderDetail : null,
      isInitialLoading: false,
      isError: false,
      error: null,
      isFetching: false,
    }));
    useAdminPaymentRefundMutationMock.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({
        paymentId: "pay_1",
      }),
      isPending: false,
    });
  });

  it("renders payment rows and wires status/provider filter controls", async () => {
    const user = userEvent.setup();
    const filters = createBaseFilters();
    filters.hasActiveFilters = true;
    filters.activeFilterCount = 2;
    renderDesktopRegion = true;
    useAdminPaymentsFiltersMock.mockReturnValue(filters);

    render(<AllPaymentsSection onViewReceipt={jest.fn()} />);

    expect(screen.getByText("All Payments")).toBeInTheDocument();
    expect(screen.getByText("BP-REF-001")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Date" })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    expect(screen.getByRole("columnheader", { name: "Ref" })).toHaveAttribute("aria-sort", "none");

    await user.selectOptions(screen.getByLabelText("Status"), "SUCCESS");
    expect(filters.setStatus).toHaveBeenCalledWith("SUCCESS");

    await user.selectOptions(screen.getByLabelText("Provider"), "PAYSTACK");
    expect(filters.setProvider).toHaveBeenCalledWith("PAYSTACK");

    await user.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(filters.clearFilters).toHaveBeenCalled();
  });

  it("passes receipt preview data to the shared lightbox handler", async () => {
    const user = userEvent.setup();
    const onViewReceipt = jest.fn();

    render(<AllPaymentsSection onViewReceipt={onViewReceipt} />);

    await user.click(screen.getByRole("button", { name: "Preview Receipt" }));

    expect(onViewReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptUrl: "https://example.com/receipt.jpg",
        payerName: "Ada Okafor",
        orderReference: "BP-REF-001",
      })
    );
  });

  it("shows a stale pending checkout badge when admin reporting marks a payment as stale", () => {
    useAdminPaymentsMock.mockReturnValue({
      ...createPaymentsState(),
      items: [
        {
          ...createPaymentsState().items[0],
          id: "pay_stale_1",
          orderReference: "BP-REF-STALE",
          orderNumber: null,
          orderId: null,
          status: "PENDING",
          processedAt: null,
          createdAt: "2026-03-10T10:00:00.000Z",
          pendingCheckout: {
            ageMinutes: 185,
            staleAfterMinutes: 120,
            isStale: true,
          },
        },
      ],
      data: {
        ...createPaymentsState().data,
        items: [
          {
            ...createPaymentsState().items[0],
            id: "pay_stale_1",
            orderReference: "BP-REF-STALE",
            orderNumber: null,
            orderId: null,
            status: "PENDING",
            processedAt: null,
            createdAt: "2026-03-10T10:00:00.000Z",
            pendingCheckout: {
              ageMinutes: 185,
              staleAfterMinutes: 120,
              isStale: true,
            },
          },
        ],
      },
    });

    render(<AllPaymentsSection onViewReceipt={jest.fn()} />);

    expect(screen.getByText("Stale pending checkout (3h 05m)")).toBeInTheDocument();
  });

  it("reuses the admin order refund modal and submits refunds with the linked order id", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({
      paymentId: "pay_1",
    });

    useAdminPaymentRefundMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<AllPaymentsSection onViewReceipt={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Refund" }));
    expect(await screen.findByText("Refund Modal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm refund" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        paymentId: "pay_1",
        orderId: "ord_1",
        input: expect.objectContaining({
          type: "FULL",
          reason: "Duplicate payment",
        }),
      })
    );
  });
});
