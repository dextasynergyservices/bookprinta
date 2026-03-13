import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PricingCards } from "./PricingCards";

const pushMock = jest.fn();
const mockUsePackageCategories = jest.fn();
let currentSearchParams = new URLSearchParams();

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
  usePackageCategories: () => mockUsePackageCategories(),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => true,
}));

jest.mock("@/components/marketing/ConfigurationModal", () => ({
  ConfigurationModal: ({ open, onContinue }: { open: boolean; onContinue: () => void }) =>
    open ? (
      <button type="button" onClick={onContinue}>
        configuration_continue
      </button>
    ) : null,
}));

jest.mock("@gsap/react", () => ({
  useGSAP: () => undefined,
}));

jest.mock("gsap", () => ({
  __esModule: true,
  default: {
    registerPlugin: jest.fn(),
    from: jest.fn(),
  },
}));

jest.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {},
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

const CATEGORIES = [
  {
    id: "cat_author",
    name: "Author",
    slug: "author",
    description: "For author-led publishing",
    copies: 25,
    isActive: true,
    sortOrder: 1,
    packages: [
      {
        id: "pkg_first_draft",
        name: "First Draft",
        slug: "first-draft",
        description: "Starter package",
        basePrice: 100_000,
        pageLimit: 120,
        includesISBN: false,
        isActive: true,
        sortOrder: 1,
        features: {
          items: ["Formatting support"],
          copies: {
            A4: 25,
            A5: 25,
            A6: 25,
          },
        },
      },
    ],
  },
];

describe("PricingCards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams([
      ["orderType", "REPRINT_REVISED"],
      ["sourceBookId", "cmbook1"],
    ]);
    mockUsePackageCategories.mockReturnValue({
      data: CATEGORIES,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it("preserves revise-and-reprint query params when continuing to checkout", () => {
    render(<PricingCards />);

    fireEvent.click(screen.getByRole("button", { name: "select_package" }));
    fireEvent.click(screen.getByRole("button", { name: "configuration_continue" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/checkout?package=first-draft&category=author&orderType=REPRINT_REVISED&sourceBookId=cmbook1"
    );
  });
});
