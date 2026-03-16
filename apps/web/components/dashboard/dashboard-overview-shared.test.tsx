import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QuickLinkCard, RecentOrderCard } from "./dashboard-overview-shared";

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

describe("dashboard overview shared cards", () => {
  it("renders a quick link card with a descriptive accessible label", () => {
    render(
      <QuickLinkCard
        href="/dashboard/books"
        title="My Books"
        description="Open the production workspace"
        icon={<span>Icon</span>}
        cta="Open"
        tone="blue"
        ariaLabel="My Books. Open the production workspace"
      />
    );

    expect(
      screen.getByRole("link", {
        name: "My Books. Open the production workspace",
      })
    ).toHaveAttribute("href", "/dashboard/books");
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders recent order cards with delivered and reprint signals", () => {
    const { container } = render(
      <RecentOrderCard
        order={{
          id: "cmorder1111111111111111111111",
          orderNumber: "BP-2026-0042",
          orderType: "REPRINT_SAME",
          status: "COMPLETED",
          createdAt: "2026-03-01T08:00:00.000Z",
          totalAmount: 125000,
          currency: "NGN",
          package: {
            id: "cmpackage1111111111111111111",
            name: "Author Launch",
            slug: "author-launch",
          },
          book: {
            id: "cmbook11111111111111111111111",
            status: "DELIVERED",
          },
          trackingUrl: "/dashboard/orders/cmorder1111111111111111111111",
        }}
        locale="en"
        tDashboard={(key) => key}
      />
    );

    expect(screen.getByText("orders_reprint_badge")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "orders_action_track: BP-2026-0042",
      })
    ).toHaveAttribute("href", "/dashboard/orders/cmorder1111111111111111111111");
    expect(container.querySelector('[data-order-type="REPRINT_SAME"]')).not.toBeNull();
    expect(container.querySelector('[data-tone="delivered"]')).not.toBeNull();
  });
});
