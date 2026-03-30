import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Footer } from "./footer";

const footerMessages = {
  say_hello: "Say hello.",
  cta_description: "Have an enquiry? Simply get in touch using the button below.",
  contact_cta: "contact us",
  pages_heading: "Pages",
  resources_heading: "Resources",
  follow_heading: "Follow Us",
  link_home: "Home",
  link_pricing: "Pricing",
  link_showcase: "Showcase",
  link_about: "About",
  link_resources: "Resources",
  link_faq: "FAQ",
  link_contact: "Contact",
  address: "Lagos, Nigeria",
  say_hello_label: "Say hello",
  phone: "+234 XXX XXX XXXX",
  email: "hello@bookprinta.com",
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  cookies: "Cookie Policy",
  refund_policy: "Refund Policy",
  company_number: "© 2026 BookPrinta",
  instagram: "Follow us on Instagram",
  twitter: "Follow us on X",
  linkedin: "Follow us on LinkedIn",
  trust_secure_payments: "Secure payments by",
  trust_quality_prints: "Quality prints by",
} as const;

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    if (namespace !== "footer") {
      throw new Error(`Unexpected namespace: ${namespace}`);
    }

    return (key: keyof typeof footerMessages) => footerMessages[key];
  },
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

jest.mock("@/hooks/usePublicMarketingSettings", () => ({
  usePublicMarketingSettings: () => ({
    settings: null,
  }),
}));

describe("Footer", () => {
  it("keeps the legal footer links pointed at the new localized routes", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(screen.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(screen.getByRole("link", { name: "Cookie Policy" })).toHaveAttribute("href", "/cookies");
    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute(
      "href",
      "/refund-policy"
    );
    expect(screen.queryByRole("link", { name: "Sustainability Policy" })).not.toBeInTheDocument();
  });

  it("renders the footer trust badges for Paystack and DEXTA", () => {
    render(<Footer />);

    expect(screen.getByText("Secure payments by")).toBeInTheDocument();
    expect(screen.getByText("Quality prints by")).toBeInTheDocument();
    expect(screen.getByAltText("Paystack")).toBeInTheDocument();
    expect(screen.getByAltText("DEXTA")).toBeInTheDocument();
  });
});
