import { render, screen } from "@testing-library/react";
import { HomePageContent } from "./page";

const mockSetRequestLocale = jest.fn();
const mockFetchPackageCategories = jest.fn();
const mockFetchFeaturedShowcasePreview = jest.fn();

jest.mock("next-intl/server", () => ({
  setRequestLocale: (...args: unknown[]) => mockSetRequestLocale(...args),
}));

jest.mock("@tanstack/react-query", () => ({
  QueryClient: class {
    async prefetchQuery({ queryFn }: { queryFn: () => Promise<unknown> }) {
      return queryFn();
    }
  },
  dehydrate: () => ({}),
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/marketing/hero", () => ({
  HeroSection: () => <div data-testid="hero-section">Hero</div>,
}));

jest.mock("@/components/marketing/showcase/ScrollProgress", () => ({
  ScrollProgress: () => <div data-testid="scroll-progress">ScrollProgress</div>,
}));

jest.mock("@/components/marketing/home", () => ({
  CtaSection: () => <div>CTA</div>,
  FaqPreview: () => <div>FAQ</div>,
  HowItWorks: () => <div>How It Works</div>,
  PricingPreview: () => <div data-testid="pricing-preview">Pricing Preview</div>,
  ShowcasePreview: ({ entries }: { entries: Array<{ id: string; bookTitle: string }> }) => (
    <div data-testid="showcase-preview">{entries.map((entry) => entry.bookTitle).join(", ")}</div>
  ),
  Testimonials: () => <div>Testimonials</div>,
}));

jest.mock("@/lib/api/packages", () => ({
  PACKAGE_CATEGORIES_QUERY_KEY: ["package-categories"],
  fetchPackageCategories: (...args: unknown[]) => mockFetchPackageCategories(...args),
}));

jest.mock("@/lib/api/showcase", () => ({
  fetchFeaturedShowcasePreview: (...args: unknown[]) => mockFetchFeaturedShowcasePreview(...args),
}));

describe("Marketing homepage server fetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("prefetches pricing and featured showcase data on the server before render", async () => {
    mockFetchPackageCategories.mockResolvedValue([
      { id: "cat-1", name: "Author Launch", slug: "author-launch", packages: [] },
    ]);
    mockFetchFeaturedShowcasePreview.mockResolvedValue([
      { id: "showcase-1", bookTitle: "Lagos After Rain" },
      { id: "showcase-2", bookTitle: "Building With Discipline" },
    ]);

    const page = await HomePageContent({ params: Promise.resolve({ locale: "en" }) });
    render(page);

    expect(mockSetRequestLocale).toHaveBeenCalledWith("en");
    expect(mockFetchPackageCategories).toHaveBeenCalledWith({ revalidate: 30 });
    expect(mockFetchFeaturedShowcasePreview).toHaveBeenCalledWith({ limit: 4, revalidate: 30 });
    expect(screen.getByTestId("pricing-preview")).toBeInTheDocument();
    expect(screen.getByTestId("showcase-preview")).toHaveTextContent(
      "Lagos After Rain, Building With Discipline"
    );
  });

  it("logs server-side prefetch failures and still renders the homepage shell", async () => {
    const pricingError = new Error("pricing unavailable");
    const showcaseError = new Error("showcase unavailable");
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    mockFetchPackageCategories.mockRejectedValue(pricingError);
    mockFetchFeaturedShowcasePreview.mockRejectedValue(showcaseError);

    const page = await HomePageContent({ params: Promise.resolve({ locale: "en" }) });
    render(page);

    expect(screen.getByTestId("pricing-preview")).toBeInTheDocument();
    expect(screen.getByTestId("showcase-preview")).toBeEmptyDOMElement();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[home-ssr] featured showcase prefetch failed",
      showcaseError
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[home-ssr] pricing prefetch failed",
      pricingError
    );
  });
});
