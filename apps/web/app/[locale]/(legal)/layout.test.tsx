import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(async (namespace: string) => {
    if (namespace === "common") {
      return (key: string) => {
        if (key === "skip_to_main_content") return "Skip to main content";
        throw new Error(`Unexpected common key: ${key}`);
      };
    }

    if (namespace === "legal") {
      return (key: string) => {
        if (key === "home_link_aria") return "BookPrinta home";
        if (key === "back_to_home") return "Back to Home";
        throw new Error(`Unexpected legal key: ${key}`);
      };
    }

    throw new Error(`Unexpected namespace: ${namespace}`);
  }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    className,
  }: {
    src: string;
    className?: string;
  } & Record<string, unknown>) => (
    <span aria-hidden="true" className={className} data-next-image={src} />
  ),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const LegalLayout = require("./layout").default as typeof import("./layout").default;

describe("LegalLayout", () => {
  it("keeps the home and back links routed through the locale-aware navigation helper", async () => {
    const ui = await LegalLayout({
      children: <div>legal content</div>,
    });

    const { container } = render(ui);

    expect(screen.getByRole("link", { name: "BookPrinta home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByText("legal content")).toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content"
    );
    expect(container.querySelector("footer")).toBeNull();
  });
});
