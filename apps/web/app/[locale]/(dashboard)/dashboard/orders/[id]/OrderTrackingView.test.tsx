import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { OrderTrackingView } from "./OrderTrackingView";

const useOrderTrackingMock = jest.fn();
const useOrderDetailMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();
const fetchMock = jest.fn();

const TRANSLATIONS: Record<string, string> = {
  order_journey_title: "Order Journey",
  order_journey_subtitle: "Track milestones from confirmation to delivery.",
  order_journey_aria: "Order journey tracker",
  order_journey_stage_order_created: "Order Created",
  order_journey_stage_payment_confirmed: "Payment Confirmed",
  order_journey_stage_in_production: "In Production",
  order_journey_stage_shipped: "Shipped",
  order_journey_stage_delivered: "Delivered",
  order_journey_download_invoice: "Download PDF Invoice",
  order_journey_download_invoice_loading: "Preparing PDF...",
  order_journey_invoice_ready: "Invoice download started",
  order_journey_invoice_error: "Unable to download invoice right now",
  order_journey_share: "Share Journey",
  order_journey_share_title: "BookPrinta Order Journey",
  order_journey_share_text: "Track order {reference} on BookPrinta.",
  order_journey_share_copied: "Tracking link copied",
  order_journey_share_failed: "Unable to share order journey",
  order_journey_copy_ref: "Copy Order Ref",
  order_journey_ref_copied: "Order reference copied",
  order_journey_ref_copy_failed: "Unable to copy order reference",
  order_journey_contact_support: "Contact Support",
  order_tracking_back_to_orders: "Back to Orders",
  order_tracking_ref: "Order Ref: {reference}",
  order_tracking_loading_title: "Loading order tracking...",
  order_tracking_loading_description: "Fetching the latest tracking updates.",
  order_tracking_error_title: "Unable to load order tracking",
  order_tracking_error_description: "Could not load",
  order_tracking_retry: "Retry",
  order_tracking_last_updated: "Last updated: {updatedAt}",
  order_tracking_last_updated_unavailable: "Unknown",
  order_tracking_payment_status: "Payment Status",
  order_tracking_payment_provider: "Payment Provider",
  order_tracking_payment_provider_unavailable: "Payment provider unavailable",
  order_tracking_payment_reference: "Payment Reference",
  order_tracking_payment_reference_unavailable: "Payment reference unavailable",
  order_tracking_total_paid: "Total Paid",
  order_tracking_shipping_provider: "Shipping Provider",
  order_tracking_shipping_unavailable: "Shipping provider unavailable",
  order_tracking_number: "Tracking Number",
  order_tracking_number_unavailable: "Tracking number unavailable",
  order_tracking_eta: "Estimated Delivery",
  order_tracking_eta_pending: "ETA available after shipping",
  order_tracking_eta_shipping: "Estimated 2-5 business days",
  order_tracking_eta_delivered: "Delivered",
  order_tracking_compliance_title: "Policy & Support",
  order_tracking_support_sla:
    "Support SLA: Mon-Fri, 09:00-18:00 WAT. Response target is within 24 hours.",
  order_tracking_terms_notice:
    "All international payments are charged in NGN. Your bank may apply its own exchange rates and fees.",
  order_tracking_refund_policy_text:
    "Refund requests are reviewed based on service stage and approved policy terms.",
  order_tracking_refund_policy_link: "Read refund policy",
  order_tracking_refund_policy_modal_title: "Refund Policy",
  order_tracking_refund_policy_modal_subtitle:
    "Review refund eligibility by production stage before submitting your request.",
  order_tracking_refund_policy_modal_intro:
    "Refund eligibility depends on where your order is in production.",
  order_tracking_refund_policy_stage_header: "Stage",
  order_tracking_refund_policy_amount_header: "Refund",
  order_tracking_refund_policy_rule_before_processing:
    "Before processing starts (PAID or AWAITING_UPLOAD)",
  order_tracking_refund_policy_rule_before_processing_amount: "100%",
  order_tracking_refund_policy_rule_ai_processing:
    "After AI processing starts (AI_PROCESSING through FORMATTED)",
  order_tracking_refund_policy_rule_ai_processing_amount: "70%",
  order_tracking_refund_policy_rule_after_approval:
    "After approval (APPROVED through IN_PRODUCTION)",
  order_tracking_refund_policy_rule_after_approval_amount: "0%",
  order_tracking_refund_policy_rule_after_printing: "After printing (PRINTED through DELIVERED)",
  order_tracking_refund_policy_rule_after_printing_amount: "0%",
  order_tracking_refund_policy_modal_support:
    "Need help with a refund request? Contact support with your order reference.",
  order_tracking_refund_policy_modal_contact: "Contact Support",
  order_tracking_refund_policy_modal_close: "Close",
  updated: "Last updated: March 5, 2026",
  orders_unknown_status: "Unknown status",
  orders_unknown_total: "Unknown total",
  loading: "Loading...",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations:
    (_namespace: "dashboard" | "common") => (key: string, values?: Record<string, unknown>) => {
      const template = TRANSLATIONS[key] ?? key;
      return interpolate(template, values);
    },
  useLocale: () => "en",
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

jest.mock("@/hooks/useOrderTracking", () => ({
  useOrderTracking: (...args: unknown[]) => useOrderTrackingMock(...args),
}));

jest.mock("@/hooks/useOrderDetail", () => ({
  useOrderDetail: (...args: unknown[]) => useOrderDetailMock(...args),
}));

jest.mock("@/components/dashboard/order-journey-tracker", () => ({
  OrderJourneyTracker: () => <div data-testid="order-journey-tracker" />,
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

describe("OrderTrackingView route integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    useOrderDetailMock.mockReturnValue({
      createdAt: "2026-03-01T08:00:00.000Z",
      updatedAt: "2026-03-03T08:00:00.000Z",
      latestPaymentCreatedAt: "2026-03-01T10:00:00.000Z",
      latestPaymentStatus: "SUCCESS",
      latestPaymentProvider: "PAYSTACK",
      latestPaymentReference: "PSK_REF_001",
      totalAmount: 125000,
      currency: "NGN",
      shippingProvider: "DHL",
      trackingNumber: "TRK-101",
      packageName: "Premium Print",
      packageAmount: 120000,
      addons: [],
    });
    URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  it("renders loading state while tracking is loading", () => {
    useOrderTrackingMock.mockReturnValue({
      data: {
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        updatedAt: "2026-03-04T09:00:00.000Z",
        currentStage: "PAYMENT_RECEIVED",
        currentOrderStatus: "PAID",
        currentBookStatus: "AWAITING_UPLOAD",
        timeline: [],
      },
      isInitialLoading: true,
      isError: false,
      isFetching: true,
      refetch: jest.fn(),
      error: null,
    });

    render(<OrderTrackingView orderId="ord_1" />);
    expect(screen.getByText("Loading order tracking...")).toBeInTheDocument();
  });

  it("renders error state and retries on click", async () => {
    const refetch = jest.fn();
    const user = userEvent.setup();

    useOrderTrackingMock.mockReturnValue({
      data: {
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        updatedAt: "2026-03-04T09:00:00.000Z",
        currentStage: "PAYMENT_RECEIVED",
        currentOrderStatus: "PAID",
        currentBookStatus: "AWAITING_UPLOAD",
        timeline: [],
      },
      isInitialLoading: false,
      isError: true,
      isFetching: false,
      refetch,
      error: new Error("Order not found"),
    });

    render(<OrderTrackingView orderId="ord_1" />);
    expect(screen.getByText("Unable to load order tracking")).toBeInTheDocument();
    expect(screen.getByText("Order not found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders order journey, metadata panel and professional CTAs", () => {
    useOrderTrackingMock.mockReturnValue({
      data: {
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        updatedAt: "2026-03-04T09:00:00.000Z",
        currentStage: "SHIPPING",
        currentOrderStatus: "IN_PRODUCTION",
        currentBookStatus: "SHIPPING",
        shippingProvider: "DHL",
        trackingNumber: "TRK-101",
        timeline: [
          {
            stage: "SHIPPING",
            state: "current",
            reachedAt: "2026-03-03T08:00:00.000Z",
            sourceStatus: "SHIPPING",
          },
        ],
      },
      shippingProvider: "DHL",
      trackingNumber: "TRK-101",
      orderNumber: "BP-2026-0001",
      orderId: "ord_1",
      currentStage: "SHIPPING",
      currentOrderStatus: "IN_PRODUCTION",
      currentBookStatus: "SHIPPING",
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<OrderTrackingView orderId="ord_1" />);

    expect(screen.getByText("Order Journey")).toBeInTheDocument();
    expect(screen.getByText("Order Ref: BP-2026-0001")).toBeInTheDocument();
    expect(screen.getByTestId("order-journey-tracker")).toBeInTheDocument();
    expect(screen.getByText("Payment Provider")).toBeInTheDocument();
    expect(screen.getByText("Payment Reference")).toBeInTheDocument();
    expect(screen.getByText("Policy & Support")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read refund policy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF Invoice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share Journey" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Order Ref" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact Support" })).toHaveAttribute(
      "href",
      "https://wa.me/2348103208297"
    );
  });

  it("downloads invoice via backend PDF endpoint", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue('attachment; filename="invoice.pdf"'),
      },
      blob: jest.fn().mockResolvedValue(new Blob(["pdf-data"])),
    } as unknown as Response);

    useOrderTrackingMock.mockReturnValue({
      data: {
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        updatedAt: "2026-03-04T09:00:00.000Z",
        currentStage: "SHIPPING",
        currentOrderStatus: "IN_PRODUCTION",
        currentBookStatus: "SHIPPING",
        shippingProvider: "DHL",
        trackingNumber: "TRK-101",
        timeline: [],
      },
      shippingProvider: "DHL",
      trackingNumber: "TRK-101",
      orderNumber: "BP-2026-0001",
      orderId: "ord_1",
      currentStage: "SHIPPING",
      currentOrderStatus: "IN_PRODUCTION",
      currentBookStatus: "SHIPPING",
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<OrderTrackingView orderId="ord_1" />);
    await user.click(screen.getByRole("button", { name: "Download PDF Invoice" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/orders/ord_1/invoice");
    expect(toastSuccessMock).toHaveBeenCalledWith("Invoice download started");
  });

  it("falls back to archived invoice URL when PDF stream fails", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          archivedUrl: "https://cdn.example.com/invoice.pdf",
          fileName: "invoice.pdf",
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('attachment; filename="invoice.pdf"'),
        },
        blob: jest.fn().mockResolvedValue(new Blob(["pdf-data"])),
      } as unknown as Response);

    useOrderTrackingMock.mockReturnValue({
      data: {
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        updatedAt: "2026-03-04T09:00:00.000Z",
        currentStage: "SHIPPING",
        currentOrderStatus: "IN_PRODUCTION",
        currentBookStatus: "SHIPPING",
        shippingProvider: "DHL",
        trackingNumber: "TRK-101",
        timeline: [],
      },
      shippingProvider: "DHL",
      trackingNumber: "TRK-101",
      orderNumber: "BP-2026-0001",
      orderId: "ord_1",
      currentStage: "SHIPPING",
      currentOrderStatus: "IN_PRODUCTION",
      currentBookStatus: "SHIPPING",
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<OrderTrackingView orderId="ord_1" />);
    await user.click(screen.getByRole("button", { name: "Download PDF Invoice" }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/orders/ord_1/invoice");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/v1/orders/ord_1/invoice/archive");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/api/v1/orders/ord_1/invoice");
    expect(toastSuccessMock).toHaveBeenCalledWith("Invoice download started");
  });

  it("opens refund policy as an in-dashboard modal", async () => {
    const user = userEvent.setup();
    useOrderTrackingMock.mockReturnValue({
      data: {
        orderId: "ord_1",
        orderNumber: "BP-2026-0001",
        updatedAt: "2026-03-04T09:00:00.000Z",
        currentStage: "SHIPPING",
        currentOrderStatus: "IN_PRODUCTION",
        currentBookStatus: "SHIPPING",
        shippingProvider: "DHL",
        trackingNumber: "TRK-101",
        timeline: [],
      },
      shippingProvider: "DHL",
      trackingNumber: "TRK-101",
      orderNumber: "BP-2026-0001",
      orderId: "ord_1",
      currentStage: "SHIPPING",
      currentOrderStatus: "IN_PRODUCTION",
      currentBookStatus: "SHIPPING",
      isInitialLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      error: null,
    });

    render(<OrderTrackingView orderId="ord_1" />);
    await user.click(screen.getByRole("button", { name: "Read refund policy" }));

    expect(screen.getByText("Refund Policy")).toBeInTheDocument();
    expect(
      screen.getByText("Before processing starts (PAID or AWAITING_UPLOAD)")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact Support" })).toHaveAttribute(
      "href",
      "https://wa.me/2348103208297"
    );
  });
});
