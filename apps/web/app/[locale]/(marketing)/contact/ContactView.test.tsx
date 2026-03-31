import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ContactView } from "./ContactView";

const publicMarketingSettingsMock = {
  settings: {
    contact: {
      heading: "Contact BookPrinta",
      supportEmail: "support@bookprinta.com",
      supportPhone: "+2348000000000",
      whatsappNumber: "+2348000000000",
      officeAddress: "Lagos, Nigeria",
    },
    businessProfile: {
      socialLinks: [
        { label: "Facebook", url: "https://facebook.com/bookprinta-ng" },
        { label: "TikTok", url: "https://tiktok.com/@bookprinta" },
      ],
    },
  },
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("framer-motion", () => {
  const React = require("react") as typeof import("react");

  const motion = new Proxy(
    {},
    {
      get: () =>
        React.forwardRef(function MotionMock(props: Record<string, unknown>, _ref: unknown) {
          const {
            initial: _initial,
            animate: _animate,
            transition: _transition,
            whileInView: _whileInView,
            viewport: _viewport,
            variants: _variants,
            custom: _custom,
            ...rest
          } = props;

          return <div {...rest} />;
        }),
    }
  );

  return {
    motion,
    useScroll: () => ({ scrollYProgress: 0 }),
    useTransform: () => 0,
  };
});

jest.mock("gsap", () => ({
  __esModule: true,
  default: {
    registerPlugin: jest.fn(),
    set: jest.fn(),
    to: jest.fn(),
  },
}));

jest.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {
    create: jest.fn(() => ({ kill: jest.fn() })),
  },
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    alt: _alt,
    fill: _fill,
    priority: _priority,
    sizes: _sizes,
  }: { alt: string } & Record<string, unknown>) => <div data-testid="mock-next-image" />,
}));

jest.mock("@/components/marketing/contact/ContactForm", () => ({
  ContactForm: () => <div>Contact form</div>,
}));

jest.mock("@/components/marketing/showcase/ScrollProgress", () => ({
  ScrollProgress: () => null,
}));

jest.mock("@/hooks/use-lenis", () => ({
  useLenis: () => ({ lenis: null }),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => true,
}));

jest.mock("@/hooks/usePublicMarketingSettings", () => ({
  usePublicMarketingSettings: () => publicMarketingSettingsMock,
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

describe("ContactView", () => {
  it("renders admin-managed social links from public marketing settings", () => {
    render(<ContactView />);

    expect(screen.getByRole("link", { name: "Facebook" })).toHaveAttribute(
      "href",
      "https://facebook.com/bookprinta-ng"
    );
    expect(screen.getByRole("link", { name: "TikTok" })).toHaveAttribute(
      "href",
      "https://tiktok.com/@bookprinta"
    );
    expect(screen.queryByRole("link", { name: "Instagram" })).not.toBeInTheDocument();
  });
});
