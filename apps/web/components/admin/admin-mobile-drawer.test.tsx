import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminMobileDrawer, getAdminDrawerMotionProps } from "./admin-mobile-drawer";

const useReducedMotionMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    if (key === "close_menu_aria") return "Close admin menu";
    if (key === "navigation_aria") return "Admin navigation";
    return key;
  },
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => useReducedMotionMock(),
}));

jest.mock("./admin-sidebar", () => ({
  AdminSidebar: ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav>
      <a href="/admin/orders" onClick={onNavigate}>
        Orders
      </a>
      <button type="button">Secondary action</button>
    </nav>
  ),
}));

describe("AdminMobileDrawer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useReducedMotionMock.mockReturnValue(false);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("locks body scroll, focuses the close button, and restores focus when closed", async () => {
    const onClose = jest.fn();
    const opener = document.createElement("button");
    opener.textContent = "Open admin menu";
    document.body.appendChild(opener);
    opener.focus();

    const { rerender, unmount } = render(
      <AdminMobileDrawer isOpen onClose={onClose} userRole="ADMIN" />
    );

    expect(document.body.style.overflow).toBe("hidden");

    jest.runAllTimers();

    const closeButton = screen.getAllByRole("button", { name: "Close admin menu" })[1];
    expect(closeButton).toHaveFocus();

    rerender(<AdminMobileDrawer isOpen={false} onClose={onClose} userRole="ADMIN" />);

    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
    });
    expect(opener).toHaveFocus();

    unmount();
    opener.remove();
  });

  it("closes on Escape and overlay click", () => {
    const onClose = jest.fn();

    render(<AdminMobileDrawer isOpen onClose={onClose} userRole="ADMIN" />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Close admin menu" })[0]);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps focus trapped inside the drawer", () => {
    const onClose = jest.fn();

    render(<AdminMobileDrawer isOpen onClose={onClose} userRole="ADMIN" />);
    jest.runAllTimers();

    const closeButton = screen.getAllByRole("button", { name: "Close admin menu" })[1];
    const secondaryAction = screen.getByRole("button", { name: "Secondary action" });

    secondaryAction.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(secondaryAction).toHaveFocus();
  });
});

describe("getAdminDrawerMotionProps", () => {
  it("disables movement when reduced motion is preferred", () => {
    expect(getAdminDrawerMotionProps(true)).toEqual({
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: { x: 0 },
        animate: { x: 0 },
        exit: { x: 0 },
        transition: { duration: 0 },
      },
    });
  });
});
