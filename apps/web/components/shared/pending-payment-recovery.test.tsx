import { render, waitFor } from "@testing-library/react";
import {
  PENDING_CHECKOUT_MAX_AGE_MS,
  readPendingCheckout,
  rememberPendingCheckout,
} from "@/lib/payments/pending-checkout";
import { PendingPaymentRecovery } from "./pending-payment-recovery";

const verifyPaymentMock = jest.fn();
const toastSuccess = jest.fn();
let pathname = "/";

jest.mock("@/hooks/usePayments", () => ({
  verifyPayment: (...args: unknown[]) => verifyPaymentMock(...args),
}));
jest.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/lib/i18n/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: jest.fn() }),
}));

describe("pending checkout store", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a pending checkout", () => {
    rememberPendingCheckout({
      reference: "bp_1",
      provider: "paystack",
      confirmPath: "/payment/confirmation",
    });
    expect(readPendingCheckout()).toMatchObject({ reference: "bp_1", provider: "paystack" });
  });

  it("expires entries older than a day (the cron has reconciled them)", () => {
    rememberPendingCheckout({ reference: "bp_1", provider: "paystack", confirmPath: "/x" });
    expect(readPendingCheckout(Date.now() + PENDING_CHECKOUT_MAX_AGE_MS + 1)).toBeNull();
    expect(window.localStorage.getItem("bp_pending_checkout")).toBeNull();
  });
});

describe("PendingPaymentRecovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    verifyPaymentMock.mockReset();
    toastSuccess.mockReset();
    pathname = "/";
  });

  it("does nothing (no request) when there is no pending checkout", () => {
    render(<PendingPaymentRecovery />);
    expect(verifyPaymentMock).not.toHaveBeenCalled();
  });

  it("finishes a paid checkout on the next visit and tells the customer", async () => {
    rememberPendingCheckout({
      reference: "bp_1",
      provider: "paystack",
      confirmPath: "/payment/confirmation",
    });
    verifyPaymentMock.mockResolvedValue({ verified: true, status: "success" });

    render(<PendingPaymentRecovery />);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(verifyPaymentMock).toHaveBeenCalledWith("bp_1", "paystack");
    expect(readPendingCheckout()).toBeNull();
  });

  it("forgets an abandoned payment", async () => {
    rememberPendingCheckout({
      reference: "bp_1",
      provider: "paystack",
      confirmPath: "/payment/confirmation",
    });
    verifyPaymentMock.mockResolvedValue({ verified: false, status: "abandoned" });

    render(<PendingPaymentRecovery />);

    await waitFor(() => expect(readPendingCheckout()).toBeNull());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("keeps a still-pending payment for the next visit", async () => {
    rememberPendingCheckout({
      reference: "bp_1",
      provider: "paystack",
      confirmPath: "/payment/confirmation",
    });
    verifyPaymentMock.mockResolvedValue({ verified: false, status: "pending" });

    render(<PendingPaymentRecovery />);

    await waitFor(() => expect(verifyPaymentMock).toHaveBeenCalled());
    expect(readPendingCheckout()).not.toBeNull();
  });

  it("leaves verification to the confirmation page when the customer is on it", () => {
    rememberPendingCheckout({
      reference: "bp_1",
      provider: "paystack",
      confirmPath: "/payment/confirmation",
    });
    pathname = "/payment/confirmation";

    render(<PendingPaymentRecovery />);

    expect(verifyPaymentMock).not.toHaveBeenCalled();
    expect(readPendingCheckout()).toBeNull();
  });
});
