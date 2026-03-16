import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import PaymentReturnPage from "./page";

const pushMock = jest.fn();
let currentSearchParams = new URLSearchParams();
let currentRouteParams: { provider?: string | string[] } = {};
let fetchMock: jest.Mock;
const originalFetch = global.fetch;

jest.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
  useParams: () => currentRouteParams,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/lib/i18n/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type VerifyPayload = {
  status: string;
  reference: string;
  amount: number | null;
  currency: string | null;
  verified: boolean;
  signupUrl?: string | null;
  awaitingWebhook?: boolean;
  email?: string | null;
  orderNumber?: string | null;
  packageName?: string | null;
  amountPaid?: string | null;
  addons?: string[];
  signupDelivery?: {
    status: "DELIVERED" | "PARTIAL" | "FAILED";
    emailDelivered: boolean;
    whatsappDelivered: boolean;
    attemptCount: number;
    lastAttemptAt?: string | null;
    retryEligible: boolean;
  } | null;
};

function mockVerifyResponse(payload: VerifyPayload) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response);
}

describe("PaymentReturnPage", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams();
    currentRouteParams = { provider: "paystack" };
    pushMock.mockReset();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    { provider: "paystack", key: "reference", value: "ps_ref_123", hint: "PAYSTACK" },
    { provider: "stripe", key: "session_id", value: "cs_test_123", hint: "STRIPE" },
    { provider: "paypal", key: "token", value: "pp_token_123", hint: "PAYPAL" },
  ])("calls verify endpoint with provider hint for %s return params", async ({
    provider,
    key,
    value,
    hint,
  }) => {
    currentRouteParams = { provider };
    currentSearchParams = new URLSearchParams([[key, value]]);
    fetchMock.mockImplementation(() =>
      mockVerifyResponse({
        status: "success",
        reference: value,
        amount: 50000,
        currency: "NGN",
        verified: true,
        signupUrl: null,
        awaitingWebhook: true,
      })
    );

    render(<PaymentReturnPage />);

    expect(await screen.findByText("payment_return_waiting_webhook")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/payments/verify/${encodeURIComponent(value)}?provider=${hint}`),
      { method: "POST" }
    );
  });

  it("handles delayed webhook fallback and eventually redirects when signupUrl becomes ready", async () => {
    currentRouteParams = { provider: "paystack" };
    currentSearchParams = new URLSearchParams([["reference", "ps_delayed_123"]]);
    fetchMock
      .mockImplementationOnce(() =>
        mockVerifyResponse({
          status: "success",
          reference: "ps_delayed_123",
          amount: 50000,
          currency: "NGN",
          verified: true,
          signupUrl: null,
          awaitingWebhook: true,
        })
      )
      .mockImplementationOnce(() =>
        mockVerifyResponse({
          status: "success",
          reference: "ps_delayed_123",
          amount: 50000,
          currency: "NGN",
          verified: true,
          signupUrl: "https://bookprinta.com/en/signup/finish?token=ready_token",
          awaitingWebhook: false,
          email: "author@example.com",
          orderNumber: "BP-2026-0042",
          packageName: "Legacy",
          amountPaid: "₦50,000",
          addons: ["ISBN Registration"],
          signupDelivery: {
            status: "FAILED",
            emailDelivered: false,
            whatsappDelivered: false,
            attemptCount: 2,
            lastAttemptAt: "2026-03-14T12:00:00.000Z",
            retryEligible: true,
          },
        })
      );

    render(<PaymentReturnPage />);

    expect(await screen.findByText("payment_return_waiting_webhook")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 3_500 });
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        expect.stringContaining("/payment/confirmation?provider=PAYSTACK&reference=ps_delayed_123")
      )
    );
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("signupDeliveryStatus=FAILED"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("signupDeliveryAttempts=2"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("email=author%40example.com"));
  });

  it("shows cancelled state and does not call verify when callback has cancelled=true", async () => {
    currentRouteParams = { provider: "paystack" };
    currentSearchParams = new URLSearchParams([
      ["reference", "ps_cancelled_123"],
      ["cancelled", "true"],
    ]);

    render(<PaymentReturnPage />);

    expect(await screen.findByText("payment_return_cancelled_title")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows error state when required reference is missing", async () => {
    currentRouteParams = { provider: "paystack" };
    currentSearchParams = new URLSearchParams();

    render(<PaymentReturnPage />);

    expect(await screen.findByText("payment_return_error_title")).toBeInTheDocument();
    expect(screen.getByText("payment_return_error_reference")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows provider error state when provider is unsupported", async () => {
    currentRouteParams = { provider: "flutterwave" };
    currentSearchParams = new URLSearchParams([["reference", "unknown_ref"]]);

    render(<PaymentReturnPage />);

    expect(await screen.findByText("payment_return_error_title")).toBeInTheDocument();
    expect(screen.getByText("payment_return_error_provider")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
