import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@/test-utils";
import { ReprintSameModal } from "./reprint-same-modal";

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

function installMatchMediaMock() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width") ? window.innerWidth < 768 : false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

const DASHBOARD_TRANSLATIONS: Record<string, string> = {
  reprint_same: "Reprint",
  reprint_same_modal_title: "Reprint Your Book",
  reprint_same_modal_description: "Review the print details and live reprint price before payment.",
  reprint_same_close_aria: "Close reprint modal",
  reprint_same_loading_title: "Loading your reprint settings",
  reprint_same_loading_description:
    "We are pulling the original print settings and live pricing for this delivered book.",
  reprint_same_load_error_title: "Unable to load reprint settings",
  reprint_same_load_error_description:
    "We couldn't load this reprint configuration right now. Try again in a moment.",
  reprint_same_retry: "Try Again",
  retry: "Try Again",
  loading: "Loading...",
  reprint_same_unavailable_title: "Reprint is unavailable",
  reprint_same_unavailable_final_pdf:
    "This book does not have a final print-ready PDF available yet, so the reprint flow cannot start.",
  reprint_same_unavailable_page_count:
    "The final page count for this book is not available yet, so we cannot calculate a reliable reprint price.",
  reprint_same_unavailable_book_size: "The original book size is not supported for reprint yet.",
  reprint_same_unavailable_payment_provider:
    "Reprint payment is temporarily unavailable because no supported payment provider is active right now.",
  reprint_same_unavailable_generic: "This book cannot be reprinted right now.",
  reprint_same_contact_support_prefix: "Need help with this reprint?",
  reprint_same_contact_support: "Contact support",
  reprint_same_source_book_label: "Source Book",
  reprint_same_page_count: "{count} pages in the final PDF",
  reprint_same_page_count_unavailable: "Final page count unavailable",
  copies: "Number of Copies",
  reprint_same_decrease_copies: "Decrease copies",
  // Provider buttons read these keys, not the reprint_same_* namespace.
  reprint_pay_cta: "Pay & Reprint",
  reprint_pay_with_paystack: "Pay with Paystack",
  reprint_pay_with_stripe: "Pay with Stripe",
  reprint_pay_bank_transfer: "Pay by bank transfer",
  reprint_same_increase_copies: "Increase copies",
  reprint_same_min_copies: "Minimum {count} copies",
  reprint_same_live_price_label: "Live Reprint Price",
  reprint_same_rate_per_page: "{amount} per page",
  reprint_same_live_formula: "{copies} copies x {pages} pages x {rate} per page",
  reprint_same_providers_label: "Available payment methods",
  reprint_same_price_preview_note:
    "This is a live client-side preview. The final price is confirmed by the server at payment time.",
  reprint_same_payment_title: "Pay inline",
  reprint_same_payment_description:
    "Choose a payment provider below to pay for this reprint without leaving the dashboard flow.",
  reprint_same_payment_authenticated_note:
    "We'll use your signed-in account email for this payment.",
  reprint_same_payment_gateways_loading: "Loading available payment providers",
  reprint_same_payment_gateways_error: "We couldn't load the inline payment providers right now.",
  reprint_same_payment_retry: "Retry payment methods",
  reprint_same_payment_button: "Pay with {provider}",
  reprint_same_payment_processing: "Redirecting...",
  reprint_same_payment_error: "Unable to start reprint payment right now.",
  book_progress_meta_value_unavailable: "Unavailable",
  offline_banner: "You're offline — some features require an internet connection",
};

const CHECKOUT_TRANSLATIONS: Record<string, string> = {
  configuration_book_size: "Book Size",
  configuration_book_size_a4: "A4",
  configuration_book_size_a5: "A5",
  configuration_book_size_a6: "A6",
  configuration_paper_color: "Paper Color",
  configuration_paper_white: "White",
  configuration_paper_cream: "Cream",
  configuration_lamination: "Lamination",
  configuration_lamination_matt: "Matt",
  configuration_lamination_matt_desc: "Soft, non-reflective finish",
  configuration_lamination_gloss: "Gloss",
  configuration_lamination_gloss_desc: "High-shine reflective finish",
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
    (namespace: "dashboard" | "checkout" | "common") =>
    (key: string, values?: Record<string, unknown>) => {
      const table = namespace === "checkout" ? CHECKOUT_TRANSLATIONS : DASHBOARD_TRANSLATIONS;
      const template = table[key] ?? key;
      return interpolate(template, values);
    },
  useLocale: () => "en",
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

const usePaymentGatewaysMock = jest.fn();
const payReprintMock = jest.fn();
const redirectToUrlMock = jest.fn();
const useOnlineStatusMock = jest.fn();

jest.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

jest.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    user: {
      id: "test-user-id",
      email: "author@example.com",
      firstName: "Alice",
      lastName: "Smith",
      role: "USER",
      displayName: "Alice Smith",
      initials: "AS",
    },
  }),
}));

jest.mock("@/hooks/usePayments", () => ({
  usePaymentGateways: (...args: unknown[]) => usePaymentGatewaysMock(...args),
  payReprint: (...args: unknown[]) => payReprintMock(...args),
  // The modal calls this to tell a bank-transfer response apart from an online
  // one. Omitting it made the call throw inside handleOnlinePayment's try, so
  // the flow landed on the error step and never reached the redirect — which
  // looked like a redirect bug rather than a missing mock.
  isReprintBankTransferResponse: (response: Record<string, unknown>) =>
    "bankTransfer" in response && response.bankTransfer === true,
}));

jest.mock("@/lib/browser-navigation", () => ({
  redirectToUrl: (...args: unknown[]) => redirectToUrlMock(...args),
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
  // Components in this tree navigate via the locale-aware router. The mock
  // previously supplied only Link, so any descendant calling useRouter() threw
  // "useRouter is not a function" before the component under test could render.
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
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
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion,
  };
});

const reprintConfig: NonNullable<ComponentProps<typeof ReprintSameModal>["config"]> = {
  bookId: "cm1111111111111111111111111",
  canReprintSame: true,
  disableReason: null,
  hasActiveReprint: false,
  finalPdfUrlPresent: true,
  pageCount: 128,
  costPerCopy: 2220,
  bookTitle: "My Book",
  bookSize: "A5",
  paperColor: "white",
  lamination: "gloss",
};

describe("ReprintSameModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setViewportWidth(375);
    installMatchMediaMock();
    window.history.replaceState(
      {},
      "",
      "/en/dashboard/books/cm1111111111111111111111111?reprint=same"
    );
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
        {
          id: "gateway_stripe",
          provider: "STRIPE",
          name: "Stripe",
          isEnabled: true,
          isTestMode: false,
          bankDetails: null,
          instructions: null,
          priority: 1,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    payReprintMock.mockResolvedValue({
      authorizationUrl: "https://checkout.example.com/reprint",
      reference: "rp_ref_123",
      provider: "PAYSTACK",
    });
    useOnlineStatusMock.mockReturnValue(true);
  });

  it("uses the mobile sheet layout at 375px", async () => {
    render(
      <ReprintSameModal
        open
        onOpenChange={jest.fn()}
        bookTitle="The Last Story"
        config={reprintConfig}
        isLoading={false}
        isError={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reprint-same-modal-shell")).toHaveAttribute(
        "data-motion-layout",
        "mobile-sheet"
      )
    );
  });

  it("uses the centered desktop modal layout from 1280px", async () => {
    setViewportWidth(1280);

    render(
      <ReprintSameModal
        open
        onOpenChange={jest.fn()}
        bookTitle="The Last Story"
        config={reprintConfig}
        isLoading={false}
        isError={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("reprint-same-modal-shell")).toHaveAttribute(
        "data-motion-layout",
        "desktop-modal"
      )
    );
  });

  it("enforces the minimum copies and updates the live price as the copy count changes", async () => {
    const user = userEvent.setup();

    render(
      <ReprintSameModal
        open
        onOpenChange={jest.fn()}
        bookTitle="The Last Story"
        config={reprintConfig}
        isLoading={false}
        isError={false}
      />
    );

    // Copies are the ONLY variable. Reprint reproduces the exact same document
    // at its original size, so there is no size/paper/lamination picker any
    // more (CLAUDE.md constraint #29) — those are shown as read-only facts.
    // Total is simply costPerCopy x copies: 2,220 x 25 = 55,500.
    expect(screen.getByText(/55,500/)).toBeInTheDocument();

    // The original print settings are displayed, not selectable.
    expect(screen.queryByRole("radio", { name: "A4" })).not.toBeInTheDocument();
    expect(screen.getByText(/A5/)).toBeInTheDocument();

    // 25 is the floor, so decreasing from it is a no-op.
    await user.click(screen.getByRole("button", { name: "Decrease copies" }));

    expect(screen.getByRole("textbox", { name: "Number of Copies" })).toHaveDisplayValue("25");
    expect(screen.getByText(/55,500/)).toBeInTheDocument();

    const copiesInput = screen.getByRole("textbox", { name: "Number of Copies" });
    fireEvent.change(copiesInput, { target: { value: "30" } });
    fireEvent.blur(copiesInput);

    await waitFor(() => expect(copiesInput).toHaveDisplayValue("30"));
    // 2,220 x 30 = 66,600.
    expect(screen.getByText(/66,600/)).toBeInTheDocument();
  });

  it("shows the unavailable support state when same-file reprint cannot start", () => {
    render(
      <ReprintSameModal
        open
        onOpenChange={jest.fn()}
        bookTitle="The Last Story"
        config={{
          ...reprintConfig,
          canReprintSame: false,
          disableReason: "FINAL_PDF_MISSING",
          finalPdfUrlPresent: false,
        }}
        isLoading={false}
        isError={false}
      />
    );

    expect(screen.getByText("Reprint is unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This book does not have a final print-ready PDF available yet, so the reprint flow cannot start."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "/contact"
    );
  });

  it("uses the shared dashboard error state and retries when config loading fails", async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    render(
      <ReprintSameModal
        open
        onOpenChange={jest.fn()}
        bookTitle="The Last Story"
        config={null}
        isLoading={false}
        isError
        errorMessage="Reprint config unavailable"
        onRetry={onRetry}
      />
    );

    expect(screen.getByText("Unable to load reprint settings")).toBeInTheDocument();
    expect(screen.getByText("Reprint config unavailable")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("reprint-same-modal-shell")
        .querySelector("[data-dashboard-error-state='true']")
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("starts an authenticated inline reprint payment for the chosen copy count", async () => {
    const user = userEvent.setup();

    render(
      <ReprintSameModal
        open
        onOpenChange={jest.fn()}
        bookTitle="The Last Story"
        config={reprintConfig}
        isLoading={false}
        isError={false}
      />
    );

    const copiesInput = screen.getByRole("textbox", { name: "Number of Copies" });
    fireEvent.change(copiesInput, { target: { value: "30" } });
    fireEvent.blur(copiesInput);

    // The modal opens on the details step. Provider buttons only exist after
    // advancing to payment_method, so the CTA comes first.
    await user.click(screen.getByRole("button", { name: "Pay & Reprint" }));
    await user.click(await screen.findByRole("button", { name: "Pay with Paystack" }));

    // The request carries only what the user can actually choose. Size, paper
    // and lamination are inherited from the original book server-side, so
    // sending them would invite a client/server disagreement about what is
    // being reprinted.
    await waitFor(() =>
      expect(payReprintMock).toHaveBeenCalledWith({
        sourceBookId: "cm1111111111111111111111111",
        copies: 30,
        provider: "PAYSTACK",
        callbackUrl: window.location.href,
      })
    );
    // The redirect happens after payReprint resolves, so it needs its own wait
    // rather than being asserted synchronously off the previous one.
    await waitFor(() =>
      expect(redirectToUrlMock).toHaveBeenCalledWith("https://checkout.example.com/reprint")
    );
  });

  it("disables reprint payment actions offline", async () => {
    const user = userEvent.setup();
    useOnlineStatusMock.mockReturnValue(false);

    render(
      <ReprintSameModal
        open
        onOpenChange={jest.fn()}
        bookTitle="The Last Story"
        config={reprintConfig}
        isLoading={false}
        isError={false}
      />
    );

    // Offline is gated at the details-step CTA, which is where the user is when
    // the connection drops — they never reach provider selection. This matches
    // CLAUDE.md Section 23.5: disable the action, do not queue it offline.
    const payCta = screen.getByRole("button", { name: "Pay & Reprint" });

    expect(payCta).toBeDisabled();
    expect(
      screen.getByText("You're offline — some features require an internet connection")
    ).toBeInTheDocument();

    await user.click(payCta);

    // Still on details: no provider selection, and nothing dispatched.
    expect(screen.queryByRole("button", { name: "Pay with Paystack" })).not.toBeInTheDocument();
    expect(payReprintMock).not.toHaveBeenCalled();
    expect(redirectToUrlMock).not.toHaveBeenCalled();
  });
});
