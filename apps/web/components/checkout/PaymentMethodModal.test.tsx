import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PaymentMethodModal } from "./PaymentMethodModal";

const pushMock = jest.fn();
const initializePaymentMock = jest.fn();
const submitBankTransferMock = jest.fn();
const usePaymentGatewaysMock = jest.fn();
const useAuthSessionMock = jest.fn();
const toastErrorMock = jest.fn();
const toastSuccessMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values?.packageName) {
      return `${key}:${String(values.packageName)}`;
    }

    return key;
  },
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/hooks/usePayments", () => ({
  initializePayment: (...args: unknown[]) => initializePaymentMock(...args),
  submitBankTransfer: (...args: unknown[]) => submitBankTransferMock(...args),
  usePaymentGateways: (...args: unknown[]) => usePaymentGatewaysMock(...args),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

jest.mock("framer-motion", () => {
  const React = require("react") as typeof import("react");
  const MOTION_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "whileHover",
    "whileTap",
    "whileInView",
    "viewport",
    "layout",
    "layoutId",
  ]);

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(function MotionPrimitive(
          { children, ...props }: React.HTMLAttributes<HTMLElement>,
          ref
        ) {
          const domProps = Object.fromEntries(
            Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key))
          );

          return React.createElement(tag, { ...domProps, ref }, children);
        }),
    }
  );

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion,
  };
});

function renderWithProviders() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <PaymentMethodModal
        open
        onOpenChange={jest.fn()}
        amount={125_000}
        packageName="First Draft"
        paymentMetadata={{
          hasCover: true,
          hasFormatting: true,
          tier: "first-draft",
          packageId: "pkg_1",
          packageSlug: "first-draft",
          packageName: "First Draft",
          includesISBN: false,
          bookSize: "A5",
          paperColor: "white",
          lamination: "gloss",
          formattingWordCount: 0,
          couponCode: null,
          discountAmount: 0,
          basePrice: 100_000,
          addonTotal: 25_000,
          totalPrice: 125_000,
          addons: [],
          addonBreakdown: [],
          orderType: "REPRINT_REVISED",
          sourceBookId: "cmbook1",
        }}
      />
    </QueryClientProvider>
  );
}

describe("PaymentMethodModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initializePaymentMock.mockRejectedValue(new Error("Unable to initialize"));
    submitBankTransferMock.mockResolvedValue({});
    usePaymentGatewaysMock.mockReturnValue({
      data: [
        {
          id: "gateway_paystack",
          provider: "PAYSTACK",
          name: "Paystack",
          isEnabled: true,
          isTestMode: false,
          bankDetails: null,
          instructions: null,
          priority: 0,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "user_1",
        email: "author@example.com",
        firstName: "Ada",
        lastName: "Writer",
        role: "USER",
        displayName: "Ada Writer",
        initials: "AW",
      },
      isAuthenticated: true,
    });
  });

  it("uses the signed-in account email for authenticated revise-and-reprint checkout", async () => {
    renderWithProviders();

    fireEvent.click(screen.getByRole("button", { name: /payment_modal_option_online/i }));
    fireEvent.click(screen.getByRole("button", { name: "Paystack" }));

    const fullNameInput = screen.getByLabelText("payment_modal_form_full_name");
    const emailInput = screen.getByLabelText("payment_modal_form_email");
    const phoneInput = screen.getByLabelText("payment_modal_form_phone");

    await waitFor(() => {
      expect(emailInput).toHaveValue("author@example.com");
    });

    expect(emailInput).toHaveAttribute("readonly");
    expect(fullNameInput).toHaveValue("Ada Writer");

    fireEvent.change(phoneInput, { target: { value: "+2348012345678" } });
    fireEvent.click(screen.getByRole("button", { name: "payment_modal_pay_now" }));

    await waitFor(() => {
      expect(initializePaymentMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          provider: "PAYSTACK",
          email: "author@example.com",
          amount: 125_000,
          metadata: expect.objectContaining({
            orderType: "REPRINT_REVISED",
            sourceBookId: "cmbook1",
            email: "author@example.com",
            payerEmail: "author@example.com",
          }),
        })
      );
    });
  });
});
