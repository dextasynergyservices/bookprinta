import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  getServiceWorkerUpdatePromptMotionProps,
  ServiceWorkerUpdatePrompt,
} from "./service-worker-update-prompt";

const useReducedMotionMock = jest.fn();
const reloadForServiceWorkerUpdateMock = jest.fn();
let currentPathname = "/about";
const getRegistrationMock = jest.fn();
let serwistMock: ReturnType<typeof createSerwistMock>;

type SerwistListener = (event: Record<string, unknown>) => void;

function createSerwistMock() {
  const listeners = new Map<string, Set<SerwistListener>>();

  return {
    addEventListener: jest.fn((type: string, listener: SerwistListener) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }

      listeners.get(type)?.add(listener);
    }),
    removeEventListener: jest.fn((type: string, listener: SerwistListener) => {
      listeners.get(type)?.delete(listener);
    }),
    messageSkipWaiting: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    emit(type: string, event: Record<string, unknown> = {}) {
      listeners.get(type)?.forEach((listener) => {
        listener(event);
      });
    },
  };
}

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    switch (key) {
      case "sw_update_title":
        return "Update available";
      case "sw_update_body":
        return "A new version of BookPrinta is ready. Reload when you're ready to apply it.";
      case "sw_update_reload":
        return "Reload";
      case "sw_update_reloading":
        return "Reloading...";
      case "sw_update_later":
        return "Later";
      default:
        return key;
    }
  },
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => useReducedMotionMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  usePathname: () => currentPathname,
}));

jest.mock("@/lib/pwa/reload-for-update", () => ({
  reloadForServiceWorkerUpdate: () => reloadForServiceWorkerUpdateMock(),
}));

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    section: ({
      children,
      initial,
      animate,
      exit,
      transition,
      ...props
    }: React.HTMLAttributes<HTMLElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => (
      <section
        data-initial={JSON.stringify(initial)}
        data-animate={JSON.stringify(animate)}
        data-exit={JSON.stringify(exit)}
        data-transition={JSON.stringify(transition)}
        {...props}
      >
        {children}
      </section>
    ),
  },
}));

describe("ServiceWorkerUpdatePrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentPathname = "/about";
    useReducedMotionMock.mockReturnValue(false);
    getRegistrationMock.mockResolvedValue({ waiting: null });

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: getRegistrationMock,
      },
    });

    serwistMock = createSerwistMock();
    window.serwist = serwistMock;
  });

  afterEach(() => {
    delete window.serwist;
  });

  it("shows the prompt when a waiting worker is detected", async () => {
    render(<ServiceWorkerUpdatePrompt />);

    act(() => {
      serwistMock.emit("waiting", { sw: {} });
    });

    expect(await screen.findByText("Update available")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A new version of BookPrinta is ready. Reload when you're ready to apply it."
      )
    ).toBeInTheDocument();
  });

  it("recovers a waiting update that already exists at registration time", async () => {
    getRegistrationMock.mockResolvedValue({ waiting: { scriptURL: "/sw.js" } });

    render(<ServiceWorkerUpdatePrompt />);

    expect(await screen.findByText("Update available")).toBeInTheDocument();
  });

  it("defers the prompt while the user is on a sensitive flow and shows it afterwards", async () => {
    currentPathname = "/checkout";
    const { rerender } = render(<ServiceWorkerUpdatePrompt />);

    act(() => {
      serwistMock.emit("waiting", { sw: {} });
    });

    expect(screen.queryByText("Update available")).not.toBeInTheDocument();

    currentPathname = "/about";
    rerender(<ServiceWorkerUpdatePrompt />);

    expect(await screen.findByText("Update available")).toBeInTheDocument();
  });

  it("activates the waiting worker only after user confirmation and reloads when it controls the page", async () => {
    render(<ServiceWorkerUpdatePrompt />);

    act(() => {
      serwistMock.emit("waiting", { sw: {} });
    });

    const reloadButton = await screen.findByRole("button", { name: "Reload" });
    fireEvent.click(reloadButton);

    expect(serwistMock.messageSkipWaiting).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Reloading..." })).toBeDisabled();

    act(() => {
      serwistMock.emit("controlling", { sw: {} });
    });

    expect(reloadForServiceWorkerUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("lets the user dismiss the prompt for the current session", async () => {
    render(<ServiceWorkerUpdatePrompt />);

    act(() => {
      serwistMock.emit("waiting", { sw: {} });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Later" }));

    await waitFor(() => {
      expect(screen.queryByText("Update available")).not.toBeInTheDocument();
    });
  });
});

describe("getServiceWorkerUpdatePromptMotionProps", () => {
  it("removes movement when reduced motion is preferred", () => {
    expect(getServiceWorkerUpdatePromptMotionProps(true)).toEqual({
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    });
  });
});
