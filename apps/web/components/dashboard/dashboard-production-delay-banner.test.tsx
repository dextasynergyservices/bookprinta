import { render, screen } from "@testing-library/react";
import { DashboardProductionDelayBanner } from "./dashboard-production-delay-banner";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("DashboardProductionDelayBanner", () => {
  it("renders the production delay copy with sticky warning styling", () => {
    render(<DashboardProductionDelayBanner />);

    const banner = screen.getByLabelText("production_delay_banner_aria");

    expect(screen.getByText("notifications")).toBeInTheDocument();
    expect(screen.getByText("production_delay_banner")).toBeInTheDocument();
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.className).toContain("sticky");
    expect(banner.className).toContain("top-14");
    expect(banner.className).toContain("bg-[#FEF3C7]");
    expect(banner.className).toContain("text-[#92400E]");
    expect(banner.className).toContain("sm:top-16");
    expect(banner.className).toContain("lg:top-20");
  });
});
