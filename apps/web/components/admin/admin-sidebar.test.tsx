import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { AdminSidebar } from "./admin-sidebar";

const usePathnameMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        panel_label: "BookPrinta Admin",
        panel_tagline: "Operations and oversight",
        workspace_description:
          "The admin shell is in place. Analytics, operations, and management views will plug into this layout next.",
        navigation_aria: "Admin navigation",
        section_overview: "Overview",
        section_operations: "Operations",
        section_content: "Content",
        section_control: "Control",
        analytics: "Analytics",
        orders: "Orders",
        books: "Books",
        payments: "Payments",
        users: "Users",
        quotes: "Quotes",
        packages: "Packages",
        coupons: "Coupons",
        showcase: "Showcase",
        resources: "Resources",
        system_settings: "System Settings",
        audit_logs: "Audit Logs",
        title: "Admin Panel",
      }) satisfies Record<string, string>
    )[key] ?? key,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    priority,
    ...props
  }: HTMLAttributes<HTMLSpanElement> & {
    priority?: boolean;
    src: string;
  }) => <span data-priority={priority ? "true" : undefined} data-src={src} {...props} />,
}));

jest.mock("@/lib/i18n/navigation", () => ({
  usePathname: () => usePathnameMock(),
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("AdminSidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/admin/orders");
  });

  it("renders grouped admin navigation headings for the current role", () => {
    const { container } = render(<AdminSidebar userRole="ADMIN" />);

    expect(container.querySelector('[data-src="/logo-main-white.png"]')).not.toBeNull();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("Control")).toBeInTheDocument();
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  it("marks the current admin route as active", () => {
    render(<AdminSidebar userRole="ADMIN" />);

    const activeLink = screen.getByRole("link", { name: "Orders" });

    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(activeLink.className).toContain("border-l-[#007eff]");
    expect(activeLink.className).toContain("bg-[#1A1A1A]");
  });

  it("shows only the allowed admin navigation items for editor roles", () => {
    usePathnameMock.mockReturnValue("/admin/showcase");

    render(<AdminSidebar userRole="EDITOR" />);

    expect(screen.getByRole("link", { name: "Showcase" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resources" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Orders" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders a compact icon-first layout when collapsed", () => {
    const { container } = render(<AdminSidebar userRole="ADMIN" isCollapsed />);

    expect(container.querySelector('[data-src="/favicon.png"]')).not.toBeNull();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.getByText("Orders")).toHaveClass("sr-only");
  });
});
