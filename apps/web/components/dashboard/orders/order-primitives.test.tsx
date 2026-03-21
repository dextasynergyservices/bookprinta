import { render, screen } from "@testing-library/react";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderMetaText, OrderReferenceText } from "./order-typography";
import { ReprintBadge } from "./reprint-badge";

describe("OrderStatusBadge", () => {
  it("renders active tone with blue palette", () => {
    render(<OrderStatusBadge orderStatus="PROCESSING" />);

    const badge = screen.getByText("Processing");
    expect(badge).toHaveAttribute("data-tone", "active");
    expect(badge.className).toContain("text-[#007eff]");
  });

  it("renders delivered tone from book status", () => {
    render(<OrderStatusBadge orderStatus="IN_PRODUCTION" bookStatus="DELIVERED" />);

    const badge = screen.getByText("Delivered");
    expect(badge).toHaveAttribute("data-tone", "delivered");
    expect(badge).toHaveAttribute("data-status-source", "book");
    expect(badge.className).toContain("text-[#22c55e]");
  });

  it("renders pending tone from order status", () => {
    render(<OrderStatusBadge orderStatus="PENDING_PAYMENT" />);

    const badge = screen.getByText("Pending Payment");
    expect(badge).toHaveAttribute("data-tone", "pending");
    expect(badge.className).toContain("text-[#facc15]");
  });

  it("renders issue tone with red palette", () => {
    render(<OrderStatusBadge orderStatus="ACTION_REQUIRED" bookStatus="DELIVERED" />);

    const badge = screen.getByText("Action Required");
    expect(badge).toHaveAttribute("data-tone", "issue");
    expect(badge.className).toContain("text-[#ef4444]");
  });

  it("allows custom translated label override", () => {
    render(<OrderStatusBadge orderStatus="PAID" label="Paid (translated)" />);
    expect(screen.getByText("Paid (translated)")).toBeInTheDocument();
  });
});

describe("ReprintBadge", () => {
  it("renders for reprint order types", () => {
    const { rerender } = render(<ReprintBadge orderType="REPRINT_SAME" label="REPRINT" />);
    expect(screen.getByText("REPRINT")).toBeInTheDocument();

    rerender(<ReprintBadge orderType="REPRINT_REVISED" label="REPRINT" />);
    expect(screen.getByText("REPRINT")).toBeInTheDocument();
  });

  it("does not render for standard orders", () => {
    const { container } = render(<ReprintBadge orderType="STANDARD" label="REPRINT" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("order typography primitives", () => {
  it("uses Space Grotesk mapping for order references", () => {
    render(<OrderReferenceText>#BP-2026-0001</OrderReferenceText>);
    const text = screen.getByText("#BP-2026-0001");

    expect(text.className).toContain("font-display");
    expect(text.className).toContain("font-bold");
  });

  it("uses DM Sans mapping for metadata text", () => {
    render(<OrderMetaText>Mar 3, 2026</OrderMetaText>);
    const text = screen.getByText("Mar 3, 2026");

    expect(text.className).toContain("font-sans");
    expect(text.className).toContain("text-xs");
  });
});
