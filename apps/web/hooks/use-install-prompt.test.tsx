import { act, render, screen } from "@testing-library/react";
import { useInstallPrompt } from "./use-install-prompt";

// ─── Test component that exposes the hook state ──────────────────
function InstallPromptProbe() {
  const { canShow, isIOS, install, dismiss } = useInstallPrompt();

  return (
    <div>
      <span data-testid="canShow">{String(canShow)}</span>
      <span data-testid="isIOS">{String(isIOS)}</span>
      <button type="button" onClick={install} data-testid="install">
        Install
      </button>
      <button type="button" onClick={dismiss} data-testid="dismiss">
        Dismiss
      </button>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────
function setDisplayMode(standalone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn((query: string) => ({
      matches: query === "(display-mode: standalone)" ? standalone : false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: ua,
  });
}

function fireBeforeInstallPrompt(): { promptMock: jest.Mock } {
  const promptMock = jest.fn().mockResolvedValue({ outcome: "accepted" });
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.defineProperty(event, "prompt", { value: promptMock });
  Object.defineProperty(event, "platforms", { value: ["web"] });
  Object.defineProperty(event, "userChoice", {
    value: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });
  window.dispatchEvent(event);
  return { promptMock };
}

function fireAppInstalled() {
  window.dispatchEvent(new Event("appinstalled"));
}

// ─── Tests ──────────────────────────────────────────────────────
describe("useInstallPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    setDisplayMode(false);
    setUserAgent("Mozilla/5.0 (Linux; Android 13) Chrome/120");
  });

  it("does not show the banner initially (waits for beforeinstallprompt)", () => {
    render(<InstallPromptProbe />);
    expect(screen.getByTestId("canShow")).toHaveTextContent("false");
  });

  it("shows the banner when beforeinstallprompt fires", () => {
    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("true");
    expect(screen.getByTestId("isIOS")).toHaveTextContent("false");
  });

  it("hides the banner and marks installed when user accepts the prompt", async () => {
    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    await act(async () => {
      screen.getByTestId("install").click();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("false");
    expect(localStorage.getItem("bookprinta_pwa_installed")).toBe("true");
  });

  it("hides the banner and marks installed when appinstalled fires", () => {
    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("true");

    act(() => {
      fireAppInstalled();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("false");
    expect(localStorage.getItem("bookprinta_pwa_installed")).toBe("true");
  });

  it("saves a dismissal record and hides the banner on dismiss", () => {
    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    act(() => {
      screen.getByTestId("dismiss").click();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("false");

    const record = JSON.parse(localStorage.getItem("bookprinta_pwa_install_dismissed") as string);
    expect(record.count).toBe(1);
    expect(typeof record.dismissedAt).toBe("number");
  });

  it("increments the dismiss count on repeated dismissals", () => {
    localStorage.setItem(
      "bookprinta_pwa_install_dismissed",
      JSON.stringify({ dismissedAt: 0, count: 2 })
    );

    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });
    act(() => {
      screen.getByTestId("dismiss").click();
    });

    const record = JSON.parse(localStorage.getItem("bookprinta_pwa_install_dismissed") as string);
    expect(record.count).toBe(3);
  });

  it("does not show the banner if still within the 3-day dismiss cooldown", () => {
    localStorage.setItem(
      "bookprinta_pwa_install_dismissed",
      JSON.stringify({ dismissedAt: Date.now() - 1000, count: 1 })
    );

    render(<InstallPromptProbe />);

    // Even if the event fires, effect already bailed.
    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("false");
  });

  it("re-shows the banner after the 3-day cooldown expires", () => {
    const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "bookprinta_pwa_install_dismissed",
      JSON.stringify({ dismissedAt: fourDaysAgo, count: 1 })
    );

    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("true");
  });

  it("never shows the banner if previously installed", () => {
    localStorage.setItem("bookprinta_pwa_installed", "true");

    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("false");
  });

  it("never shows the banner if running in standalone mode", () => {
    setDisplayMode(true);

    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(screen.getByTestId("canShow")).toHaveTextContent("false");
  });

  it("shows iOS instructions on an iOS device", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");

    render(<InstallPromptProbe />);

    expect(screen.getByTestId("canShow")).toHaveTextContent("true");
    expect(screen.getByTestId("isIOS")).toHaveTextContent("true");
  });

  it("clears dismiss record when marking as installed", async () => {
    localStorage.setItem(
      "bookprinta_pwa_install_dismissed",
      JSON.stringify({ dismissedAt: 0, count: 2 })
    );

    render(<InstallPromptProbe />);

    act(() => {
      fireBeforeInstallPrompt();
    });

    await act(async () => {
      screen.getByTestId("install").click();
    });

    expect(localStorage.getItem("bookprinta_pwa_install_dismissed")).toBeNull();
    expect(localStorage.getItem("bookprinta_pwa_installed")).toBe("true");
  });
});
