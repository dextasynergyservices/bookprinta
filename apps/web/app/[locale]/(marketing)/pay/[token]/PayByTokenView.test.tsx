import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { PayByTokenView } from "./PayByTokenView";

const useSearchParamsMock = jest.fn();
const usePaymentGatewaysMock = jest.fn();
const useOnlineStatusMock = jest.fn();
const resolveQuotePaymentTokenMock = jest.fn();
const payQuoteByTokenMock = jest.fn();
const verifyQuotePaymentReferenceMock = jest.fn();
const submitBankTransferMock = jest.fn();

const translations: Record<string, string> = {
  eyebrow: "Secure payment",
  loading_title: "Loading your payment link",
  error_title: "Unable to load this payment link",
  valid_title: "Complete your quote payment",
  valid_subtitle: "Use one of the options below to complete payment.",
  invalid_title: "This payment link is invalid",
  invalid_subtitle: "Please contact support for a new payment link.",
  paid_title: "This quote has already been paid",
  expired_title: "This payment link has expired",
  revoked_title: "This payment link has been revoked",
  loading_body: "Fetching quote payment details",
  resolve_error: "Unable to resolve this payment link right now.",
  contact_support: "Contact support",
  go_pricing: "See pricing",
  paystack: "Pay with Paystack",
  stripe: "Pay with Stripe",
  bank_transfer: "Bank transfer",
  processing: "Processing...",
  quote_summary: "Quote summary",
  title_label: "Title",
  author_label: "Author",
  size_label: "Size",
  quantity_label: "Quantity",
  amount_label: "Amount",
  cancelled_error: "Payment was cancelled. Please try again.",
  awaiting_approval: "Bank transfer submitted. We are verifying your payment.",
  verifying_payment: "Verifying your payment...",
  awaiting_webhook: "Payment received. Waiting for confirmation...",
  awaiting_confirmation: "Still confirming your payment. Please wait...",
  awaiting_email: "Verification is taking longer than expected. Check your email shortly.",
  offline_banner: "You're offline — some features require an internet connection",
};

jest.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

jest.mock("next-intl", () => ({
  useTranslations: (_namespace?: string) => (key: string) => translations[key] ?? key,
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

jest.mock("@/hooks/usePayments", () => ({
  usePaymentGateways: () => usePaymentGatewaysMock(),
  submitBankTransfer: (...args: unknown[]) => submitBankTransferMock(...args),
}));

jest.mock("@/lib/api/quote-payment", () => ({
  resolveQuotePaymentToken: (...args: unknown[]) => resolveQuotePaymentTokenMock(...args),
  payQuoteByToken: (...args: unknown[]) => payQuoteByTokenMock(...args),
  verifyQuotePaymentReference: (...args: unknown[]) => verifyQuotePaymentReferenceMock(...args),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("PayByTokenView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    useOnlineStatusMock.mockReturnValue(true);
    usePaymentGatewaysMock.mockReturnValue({
      data: [
        {
          id: "gateway_paystack",
          provider: "PAYSTACK",
          name: "Paystack",
          isEnabled: true,
        },
        {
          id: "gateway_bank",
          provider: "BANK_TRANSFER",
          name: "Bank Transfer",
          isEnabled: true,
          bankDetails: {
            accounts: [
              {
                accountName: "BookPrinta",
                accountNumber: "0123456789",
                bank: "Demo Bank",
              },
            ],
          },
        },
      ],
    });
    resolveQuotePaymentTokenMock.mockResolvedValue({
      tokenStatus: "VALID",
      quote: {
        id: "cmquote-valid",
        workingTitle: "Fresh Draft",
        fullName: "Ada Writer",
        email: "ada@example.com",
        bookPrintSize: "A5",
        quantity: 100,
        finalPrice: 180000,
        status: "PAYMENT_LINK_SENT",
        paymentLinkExpiresAt: "2026-03-30T10:00:00.000Z",
      },
      message: "Use one of the options below to complete payment.",
    });
    verifyQuotePaymentReferenceMock.mockResolvedValue({
      status: "PENDING",
      reference: "ref_test",
      amount: null,
      currency: "NGN",
      verified: false,
      awaitingWebhook: false,
      signupUrl: null,
    });
    payQuoteByTokenMock.mockResolvedValue({
      quoteId: "cmquote-pay-1",
      orderId: "cmorder-pay-1",
      status: "PENDING_PAYMENT",
      redirectTo: "https://pay.example/checkout",
      skipFormatting: true,
    });
    submitBankTransferMock.mockResolvedValue({
      id: "cmpayment-bank-1",
      status: "AWAITING_APPROVAL",
      message: "Submitted",
    });
  });

  it("shows expired-link state and hides active payment actions", async () => {
    resolveQuotePaymentTokenMock.mockResolvedValue({
      tokenStatus: "EXPIRED",
      quote: {
        id: "cmquote-expired",
        workingTitle: "Old Draft",
        fullName: "Ada Writer",
        email: "ada@example.com",
        bookPrintSize: "A5",
        quantity: 100,
        finalPrice: 180000,
        status: "PAYMENT_LINK_SENT",
        paymentLinkExpiresAt: "2026-03-01T10:00:00.000Z",
      },
      message: "This payment link has expired. Contact BookPrinta support for a new link.",
    });

    render(<PayByTokenView token="expired_token" />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "This payment link has expired" })
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "/contact"
    );
    expect(screen.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("button", { name: "Pay with Paystack" })).not.toBeInTheDocument();
  });

  it("disables quote payment actions offline", async () => {
    const user = userEvent.setup();
    useOnlineStatusMock.mockReturnValue(false);

    render(<PayByTokenView token="offline_token" />);

    const paystackButton = await screen.findByRole("button", { name: "Pay with Paystack" });
    const bankButton = screen.getByRole("button", { name: "Bank transfer" });

    expect(paystackButton).toBeDisabled();
    expect(bankButton).toBeDisabled();
    expect(
      screen.getByText("You're offline — some features require an internet connection")
    ).toBeInTheDocument();

    await user.click(paystackButton);

    expect(payQuoteByTokenMock).not.toHaveBeenCalled();
    expect(submitBankTransferMock).not.toHaveBeenCalled();
  });
});
