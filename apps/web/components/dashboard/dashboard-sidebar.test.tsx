import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent, ReactNode } from "react";
import { DashboardSidebar } from "./dashboard-sidebar";

const useReviewStateMock = jest.fn();
const usePathnameMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        title: "Dashboard",
        my_books: "My Books",
        orders: "Orders",
        profile: "Profile",
        settings: "Settings",
        reviews: "Reviews",
        reviews_disabled_tooltip: "Your reviews unlock after your first delivered book",
        reviews_eligibility_loading: "Checking review eligibility...",
        reviews_eligibility_unavailable: "Review eligibility is temporarily unavailable",
        sidebar_navigation_aria: "Dashboard navigation",
        sidebar_expand_aria: "Expand dashboard sidebar",
        sidebar_collapse_aria: "Collapse dashboard sidebar",
      }) as Record<string, string>
    )[key] ?? key,
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useReviewState: () => useReviewStateMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children: ReactNode;
    href: string;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
    [key: string]: unknown;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
  usePathname: () => usePathnameMock(),
}));

describe("DashboardSidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/dashboard");
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("locks the reviews link with a tooltip until the user has an eligible delivered book", async () => {
    const user = userEvent.setup();
    useReviewStateMock.mockReturnValue({
      hasAnyEligibleBook: false,
      isLoading: false,
      isError: false,
      isFallback: false,
    });

    render(<DashboardSidebar />);

    const reviewsLink = screen.getByRole("link", { name: "Reviews" });
    expect(reviewsLink).toHaveAttribute("aria-disabled", "true");

    await user.hover(reviewsLink);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Reviews - Your reviews unlock after your first delivered book"
    );
  });

  it("keeps the reviews link enabled for navigation when review eligibility is met", async () => {
    const user = userEvent.setup();
    const onOpenReviewDialog = jest.fn();

    useReviewStateMock.mockReturnValue({
      hasAnyEligibleBook: true,
      isLoading: false,
      isError: false,
      isFallback: false,
    });

    render(<DashboardSidebar onOpenReviewDialog={onOpenReviewDialog} />);

    const reviewsLink = screen.getByRole("link", { name: "Reviews" });
    expect(reviewsLink).not.toHaveAttribute("aria-disabled");
    expect(reviewsLink).toHaveAttribute("href", "/dashboard/reviews");

    await user.click(reviewsLink);

    expect(onOpenReviewDialog).not.toHaveBeenCalled();
  });
});
