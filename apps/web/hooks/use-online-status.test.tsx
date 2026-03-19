import { act, render, screen, waitFor } from "@testing-library/react";
import { useOnlineStatus } from "./use-online-status";

function OnlineStatusProbe() {
  const isOnline = useOnlineStatus();

  return <span>{isOnline ? "online" : "offline"}</span>;
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("useOnlineStatus", () => {
  beforeEach(() => {
    setNavigatorOnline(true);
  });

  it("reads the initial browser online state", () => {
    setNavigatorOnline(false);

    render(<OnlineStatusProbe />);

    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("updates when the browser goes offline and back online", async () => {
    render(<OnlineStatusProbe />);

    expect(screen.getByText("online")).toBeInTheDocument();

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => {
      expect(screen.getByText("offline")).toBeInTheDocument();
    });

    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(screen.getByText("online")).toBeInTheDocument();
    });
  });
});
