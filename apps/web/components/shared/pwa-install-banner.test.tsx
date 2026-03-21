import { fireEvent, render, screen } from "@testing-library/react";
import { getInstallBannerMotionProps, PwaInstallBanner } from "./pwa-install-banner";

// ─── Mocks ──────────────────────────────────────────────────────
const installMock = jest.fn();
const dismissMock = jest.fn();
let hookState = { canShow: false, isIOS: false, install: installMock, dismiss: dismissMock };

jest.mock("@/hooks/use-install-prompt", () => ({
  useInstallPrompt: () => hookState,
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      pwa_install_title: "Install BookPrinta",
      pwa_install_body: "Add BookPrinta to your home screen for a faster, app-like experience.",
      pwa_install_button: "Install",
      pwa_install_later: "Not now",
      pwa_install_dismiss: "Dismiss install banner",
      pwa_install_ios_instructions: 'Tap the Share button, then "Add to Home Screen"',
    };
    return map[key] ?? key;
  },
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/a11y/useAltText: test mock
    // biome-ignore lint/performance/noImgElement: test mock for next/image
    <img {...props} />
  ),
}));

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial,
      animate,
      exit,
      transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => (
      <div
        data-initial={JSON.stringify(initial)}
        data-animate={JSON.stringify(animate)}
        data-exit={JSON.stringify(exit)}
        data-transition={JSON.stringify(transition)}
        {...props}
      >
        {children}
      </div>
    ),
  },
}));

// ─── Tests ──────────────────────────────────────────────────────
describe("PwaInstallBanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hookState = { canShow: false, isIOS: false, install: installMock, dismiss: dismissMock };
  });

  it("renders nothing when canShow is false", () => {
    render(<PwaInstallBanner />);
    expect(screen.queryByText("Install BookPrinta")).not.toBeInTheDocument();
  });

  it("renders the banner with title, body, and install button when canShow is true", () => {
    hookState = { ...hookState, canShow: true };

    render(<PwaInstallBanner />);

    expect(screen.getByText("Install BookPrinta")).toBeInTheDocument();
    expect(
      screen.getByText("Add BookPrinta to your home screen for a faster, app-like experience.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("shows iOS instructions instead of the install button when isIOS is true", () => {
    hookState = { ...hookState, canShow: true, isIOS: true };

    render(<PwaInstallBanner />);

    expect(screen.getByText('Tap the Share button, then "Add to Home Screen"')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("calls install when the install button is clicked", () => {
    hookState = { ...hookState, canShow: true };

    render(<PwaInstallBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    expect(installMock).toHaveBeenCalledTimes(1);
  });

  it('calls dismiss when "Not now" is clicked', () => {
    hookState = { ...hookState, canShow: true };

    render(<PwaInstallBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it("calls dismiss when the X button is clicked", () => {
    hookState = { ...hookState, canShow: true };

    render(<PwaInstallBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss install banner" }));

    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it("renders the BookPrinta app icon", () => {
    hookState = { ...hookState, canShow: true };

    render(<PwaInstallBanner />);

    const icon = screen.getByAltText("BookPrinta");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("src", "/icons/icon-192.png");
  });
});

describe("getInstallBannerMotionProps", () => {
  it("disables movement when reduced motion is preferred", () => {
    expect(getInstallBannerMotionProps(true)).toEqual({
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    });
  });

  it("uses a slide-up animation with standard motion", () => {
    const props = getInstallBannerMotionProps(false);
    expect(props.initial).toEqual({ opacity: 0, y: 60 });
    expect(props.animate).toEqual({ opacity: 1, y: 0 });
    expect(props.exit).toEqual({ opacity: 0, y: 60 });
    expect(props.transition.duration).toBe(0.3);
  });
});
