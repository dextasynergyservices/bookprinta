import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
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
  reprint_same: "Reprint Same",
  reprint_same_modal_title: "Reprint with the same final PDF",
  reprint_same_modal_description:
    "Reuse your delivered final PDF, adjust the print settings, and review the live reprint price before payment.",
  reprint_same_close_aria: "Close reprint modal",
  reprint_same_loading_title: "Loading your reprint settings",
  reprint_same_loading_description:
    "We are pulling the original print settings and live pricing for this delivered book.",
  reprint_same_load_error_title: "Unable to load reprint settings",
  reprint_same_load_error_description:
    "We couldn't load this reprint configuration right now. Try again in a moment.",
  reprint_same_retry: "Try Again",
  reprint_same_unavailable_title: "Reprint Same is unavailable",
  reprint_same_unavailable_final_pdf:
    "This book does not have a final print-ready PDF available yet, so the same-file reprint flow cannot start.",
  reprint_same_unavailable_page_count:
    "The final page count for this book is not available yet, so we cannot calculate a reliable reprint price.",
  reprint_same_unavailable_book_size:
    "The original book size is not supported for same-file reprint yet.",
  reprint_same_unavailable_payment_provider:
    "Inline reprint payment is temporarily unavailable because no supported payment provider is active right now.",
  reprint_same_unavailable_generic: "This book cannot use the same-file reprint flow right now.",
  reprint_same_contact_support_prefix: "Need help with this reprint?",
  reprint_same_contact_support: "Contact support",
  reprint_same_source_book_label: "Source Book",
  reprint_same_page_count: "{count} pages in the final PDF",
  reprint_same_page_count_unavailable: "Final page count unavailable",
  copies: "Number of Copies",
  reprint_same_decrease_copies: "Decrease copies",
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
    (namespace: "dashboard" | "checkout") => (key: string, values?: Record<string, unknown>) => {
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

jest.mock("@/hooks/usePayments", () => ({
  usePaymentGateways: (...args: unknown[]) => usePaymentGatewaysMock(...args),
  payReprint: (...args: unknown[]) => payReprintMock(...args),
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
  finalPdfUrlPresent: true,
  pageCount: 128,
  minCopies: 25,
  defaultBookSize: "A5",
  defaultPaperColor: "white",
  defaultLamination: "gloss",
  allowedBookSizes: ["A4", "A5", "A6"],
  allowedPaperColors: ["white", "cream"],
  allowedLaminations: ["matt", "gloss"],
  costPerPageBySize: {
    A4: 20,
    A5: 10,
    A6: 5,
  },
  enabledPaymentProviders: ["PAYSTACK", "STRIPE"],
};

describe("ReprintSameModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setViewportWidth(375);
    installMatchMediaMock();
    window.history.replaceState(
      {},
      "",
      "/en/dashboard/books?bookId=cm1111111111111111111111111&reprint=same"
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

  it("enforces the minimum copies and updates the live price as settings change", async () => {
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

    expect(screen.getByText(/32,000/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Decrease copies" }));

    expect(screen.getByRole("textbox", { name: "Number of Copies" })).toHaveDisplayValue("25");
    expect(screen.getByText(/32,000/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "A4" }));

    expect(screen.getByText(/64,000/)).toBeInTheDocument();

    const copiesInput = screen.getByRole("textbox", { name: "Number of Copies" });
    fireEvent.change(copiesInput, { target: { value: "30" } });
    fireEvent.blur(copiesInput);

    await waitFor(() => expect(copiesInput).toHaveDisplayValue("30"));
    expect(screen.getByText(/76,800/)).toBeInTheDocument();
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

    expect(screen.getByText("Reprint Same is unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This book does not have a final print-ready PDF available yet, so the same-file reprint flow cannot start."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "/contact"
    );
  });

  it("starts an authenticated inline reprint payment with the selected settings", async () => {
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

    await user.click(screen.getByRole("radio", { name: "A4" }));

    const copiesInput = screen.getByRole("textbox", { name: "Number of Copies" });
    fireEvent.change(copiesInput, { target: { value: "30" } });
    fireEvent.blur(copiesInput);

    await user.click(screen.getByRole("button", { name: "Pay with Paystack" }));

    await waitFor(() =>
      expect(payReprintMock).toHaveBeenCalledWith({
        sourceBookId: "cm1111111111111111111111111",
        copies: 30,
        bookSize: "A4",
        paperColor: "white",
        lamination: "gloss",
        provider: "PAYSTACK",
        callbackUrl: window.location.href,
      })
    );
    expect(redirectToUrlMock).toHaveBeenCalledWith("https://checkout.example.com/reprint");
  });
});
