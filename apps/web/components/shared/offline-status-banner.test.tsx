import { render, screen } from "@testing-library/react";
import { getOfflineBannerMotionProps, OfflineStatusBanner } from "./offline-status-banner";

const useOnlineStatusMock = jest.fn();
const useReducedMotionMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    if (key === "offline_banner") {
      return "You're offline — some features require an internet connection";
    }

    return key;
  },
}));

jest.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => useReducedMotionMock(),
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

describe("OfflineStatusBanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnlineStatusMock.mockReturnValue(true);
    useReducedMotionMock.mockReturnValue(false);
  });

  it("renders the banner immediately when offline", () => {
    useOnlineStatusMock.mockReturnValue(false);

    render(<OfflineStatusBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline — some features require an internet connection"
    );
  });

  it("hides the banner automatically when the connection returns", () => {
    useOnlineStatusMock.mockReturnValue(false);
    const { rerender } = render(<OfflineStatusBanner />);

    expect(screen.getByRole("status")).toBeInTheDocument();

    useOnlineStatusMock.mockReturnValue(true);
    rerender(<OfflineStatusBanner />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("getOfflineBannerMotionProps", () => {
  it("disables movement when reduced motion is preferred", () => {
    expect(getOfflineBannerMotionProps(true)).toEqual({
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    });
  });
});
