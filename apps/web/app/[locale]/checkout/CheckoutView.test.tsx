import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RateLimitError } from "@/lib/api-error";
import { usePricingStore } from "@/stores/usePricingStore";
import { CheckoutView } from "./CheckoutView";

const pushMock = jest.fn();
const refetchMock = jest.fn();
let currentSearchParams = new URLSearchParams([["package", "first-draft"]]);

const mockUsePackages = jest.fn();
const mockUseAddons = jest.fn();
const mockValidateCouponCode = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/lib/i18n/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock("@/hooks/usePackages", () => ({
  usePackages: () => mockUsePackages(),
}));

jest.mock("@/hooks/useAddons", () => ({
  useAddons: () => mockUseAddons(),
}));

jest.mock("@/hooks/usePayments", () => {
  const actual = jest.requireActual("@/hooks/usePayments");
  return {
    ...actual,
    validateCouponCode: (...args: unknown[]) => mockValidateCouponCode(...args),
  };
});

jest.mock("@/components/checkout/AddonCard", () => ({
  AddonCard: () => <div data-testid="addon-card" />,
}));

jest.mock("@/components/checkout/PaymentMethodModal", () => ({
  PaymentMethodModal: () => null,
}));

const PACKAGE = {
  id: "pkg_1",
  name: "First Draft",
  slug: "first-draft",
  description: "Starter package",
  basePrice: 100_000,
  pageLimit: 120,
  includesISBN: false,
  features: { items: [], copies: { A4: 1, A5: 1, A6: 1 } },
  isActive: true,
  sortOrder: 1,
  category: {
    id: "cat_1",
    name: "Author",
    slug: "author",
    description: null,
    copies: 25,
    isActive: true,
    sortOrder: 1,
  },
};

function renderWithProviders() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <CheckoutView />
    </QueryClientProvider>
  );
}

describe("CheckoutView coupon display", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams([["package", "first-draft"]]);

    mockUsePackages.mockReturnValue({
      data: [PACKAGE],
      isLoading: false,
    });
    mockUseAddons.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    });
    mockValidateCouponCode.mockReset();

    const store = usePricingStore.getState();
    store.reset();
    store.setSelectedPackage({
      id: PACKAGE.id,
      name: PACKAGE.name,
      slug: PACKAGE.slug,
      basePrice: PACKAGE.basePrice,
      includesISBN: PACKAGE.includesISBN,
    });
    store.setHasCoverDesign(true);
    store.setHasFormatting(true);
    store.setBookSize("A5");
    store.setPaperColor("white");
    store.setLamination("gloss");
  });

  it("shows discount line in both desktop and mobile summaries and removes it when coupon is cleared", async () => {
    const store = usePricingStore.getState();
    store.applyCoupon("SAVE10", 5_000);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getAllByText("coupon_discount_label").length).toBeGreaterThanOrEqual(2);
    });

    const removeButtons = screen.getAllByLabelText("coupon_remove_aria");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText("coupon_discount_label")).not.toBeInTheDocument();
    });
  });

  it("disables coupon apply with countdown after 429 response", async () => {
    jest.useFakeTimers();
    mockValidateCouponCode.mockRejectedValueOnce(new RateLimitError("Too many attempts", 120));

    try {
      renderWithProviders();

      const couponInput = screen.getAllByLabelText("coupon_input_placeholder")[0];
      fireEvent.change(couponInput, { target: { value: "SAVE10" } });

      const applyButton = screen.getAllByRole("button", { name: "coupon_apply_button" })[0];
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(mockValidateCouponCode).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(screen.getAllByText("rate_limit_wait_seconds").length).toBeGreaterThan(0);
      });
      expect(applyButton).toBeDisabled();
    } finally {
      jest.useRealTimers();
    }
  });
});
