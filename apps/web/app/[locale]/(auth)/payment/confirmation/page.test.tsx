import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import PaymentConfirmedPage from "./page";

const replaceMock = jest.fn();
let currentSearchParams = new URLSearchParams();
const originalFetch = global.fetch;

jest.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    switch (key) {
      case "payment_confirmed_title":
        return "Payment Confirmed!";
      case "payment_confirmed_subtitle":
        return "Your payment has been received and your order is being processed.";
      case "payment_confirmed_complete_signup":
        return "Complete Signup";
      case "payment_confirmation_resend_success":
        return "Signup link sent. Check your email.";
      case "payment_confirmed_delivery_failed_title":
        return "We couldn't deliver your signup link automatically";
      case "payment_confirmed_delivery_failed_note":
        return "Your payment is safe. Use the direct signup button below or resend the link to your email.";
      case "payment_confirmed_delivery_failed_retry_note":
        return `We tried ${values?.count} times to send your signup link. Use the direct signup button below or resend the link to your email.`;
      case "payment_confirmed_delivery_whatsapp_title":
        return "We sent your signup link on WhatsApp";
      case "payment_confirmed_delivery_whatsapp_note":
        return "Email delivery didn't complete, but a WhatsApp fallback was sent. You can still continue with the direct signup button below.";
      case "payment_confirmed_attempted_email":
        return `We tried to send it to ${values?.email}`;
      case "payment_confirmed_direct_signup_note":
        return "You can continue right now using the secure signup button below.";
      case "payment_confirmed_sent_to":
        return `A signup link has been sent to ${values?.email}`;
      case "payment_confirmed_order_ref":
        return "Order Reference";
      case "payment_confirmed_package":
        return "Package";
      case "payment_confirmed_amount":
        return "Amount Paid";
      case "payment_confirmed_addons":
        return "Extra Services";
      case "payment_confirmed_check_email":
        return "Check Your Email";
      case "payment_confirmed_check_email_note":
        return "Click the signup link in your email to set your password and activate your account.";
      case "payment_confirmation_resend_title":
        return "Didn't get your signup link?";
      case "payment_confirmation_resend_subtitle":
        return "Use the same email used for payment.";
      case "payment_return_verifying":
        return "Please wait while we verify your payment and prepare your signup link.";
      case "payment_return_waiting_webhook":
        return "Payment confirmed. Finalizing your account setup now...";
      case "payment_return_waiting_pending":
        return "Your payment is still being confirmed.";
      case "payment_return_waiting_email":
        return "Payment is successful. We're still finalizing your signup redirect.";
      case "addons_back_to_pricing":
        return "Back to Pricing";
      case "payment_confirmation_home_cta":
        return "Back Home";
      default:
        return key;
    }
  },
}));

jest.mock("@/lib/i18n/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/checkout/ResendSignupLinkForm", () => ({
  ResendSignupLinkForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button type="button" onClick={onSuccess}>
      Mock resend success
    </button>
  ),
}));

describe("PaymentConfirmedPage", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams();
    replaceMock.mockReset();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("surfaces failed signup-link delivery and keeps the direct signup CTA available", () => {
    currentSearchParams = new URLSearchParams([
      ["provider", "PAYSTACK"],
      ["reference", "ps_ref_failed"],
      ["email", "author@example.com"],
      ["ref", "BP-2026-0042"],
      ["package", "Legacy"],
      ["amount", "₦50,000"],
      ["signupUrl", "https://bookprinta.com/en/signup/finish?token=ready_token"],
      ["signupDeliveryStatus", "FAILED"],
      ["signupDeliveryEmail", "0"],
      ["signupDeliveryWhatsApp", "0"],
      ["signupDeliveryAttempts", "2"],
      ["signupDeliveryRetryEligible", "1"],
    ]);

    render(<PaymentConfirmedPage />);

    expect(
      screen.getByText("We couldn't deliver your signup link automatically")
    ).toBeInTheDocument();
    expect(screen.getByText("We tried to send it to author@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We tried 2 times to send your signup link. Use the direct signup button below or resend the link to your email."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can continue right now using the secure signup button below.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Complete Signup" })).toHaveAttribute(
      "href",
      "https://bookprinta.com/en/signup/finish?token=ready_token"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the WhatsApp fallback state when email delivery did not complete", () => {
    currentSearchParams = new URLSearchParams([
      ["provider", "PAYSTACK"],
      ["reference", "ps_ref_partial"],
      ["email", "author@example.com"],
      ["signupUrl", "https://bookprinta.com/en/signup/finish?token=ready_token"],
      ["signupDeliveryStatus", "PARTIAL"],
      ["signupDeliveryEmail", "0"],
      ["signupDeliveryWhatsApp", "1"],
      ["signupDeliveryAttempts", "1"],
      ["signupDeliveryRetryEligible", "0"],
    ]);

    render(<PaymentConfirmedPage />);

    expect(screen.getByText("We sent your signup link on WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("We tried to send it to author@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Email delivery didn't complete, but a WhatsApp fallback was sent. You can still continue with the direct signup button below."
      )
    ).toBeInTheDocument();
  });

  it("keeps the direct signup CTA visible after a resend succeeds", () => {
    currentSearchParams = new URLSearchParams([
      ["provider", "PAYSTACK"],
      ["reference", "ps_ref_failed"],
      ["email", "author@example.com"],
      ["signupUrl", "https://bookprinta.com/en/signup/finish?token=ready_token"],
      ["signupDeliveryStatus", "FAILED"],
      ["signupDeliveryEmail", "0"],
      ["signupDeliveryWhatsApp", "0"],
      ["signupDeliveryAttempts", "1"],
      ["signupDeliveryRetryEligible", "1"],
    ]);

    render(<PaymentConfirmedPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock resend success" }));

    expect(screen.getByText("Signup link sent. Check your email.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Complete Signup" })).toHaveAttribute(
      "href",
      "https://bookprinta.com/en/signup/finish?token=ready_token"
    );
  });
});
