import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardShell } from "./dashboard-shell";

const useNotificationBannerStateMock = jest.fn();
const useReviewStateMock = jest.fn();
const useCreateReviewMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    typeof values?.count === "number" ? `${key}-${values.count}` : key,
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useNotificationBannerState: () => useNotificationBannerStateMock(),
  useReviewState: () => useReviewStateMock(),
  useCreateReview: () => useCreateReviewMock(),
}));

jest.mock("@/hooks/use-lenis", () => ({
  useLenis: () => ({ lenis: null }),
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => true,
}));

jest.mock("./dashboard-header", () => ({
  DashboardHeader: ({
    onOpenReviewDialog,
  }: {
    onOpenReviewDialog?: (target: { bookId: string; bookTitle: string | null }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onOpenReviewDialog?.({
          bookId: "cm1111111111111111111111111",
          bookTitle: "The Lagos Chronicle",
        })
      }
    >
      open-review-dialog
    </button>
  ),
}));

jest.mock("./dashboard-sidebar", () => ({
  DashboardSidebar: () => <div>sidebar</div>,
}));

jest.mock("./dashboard-mobile-drawer", () => ({
  DashboardMobileDrawer: () => null,
}));

jest.mock("./dashboard-content-frame", () => ({
  DashboardContentFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("DashboardShell", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useNotificationBannerStateMock.mockReturnValue({
      hasProductionDelayBanner: true,
    });
    useReviewStateMock.mockReturnValue({
      pendingBooks: [{ bookId: "cm1111111111111111111111111", status: "PRINTED" }],
      reviewedBooks: [],
      isLoading: false,
    });
    useCreateReviewMock.mockReturnValue({
      submitReview: jest.fn(),
      isPending: false,
    });
  });

  it("shows the production delay banner and opens the review dialog from shell state", () => {
    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    expect(screen.getByText("production_delay_banner")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "open-review-dialog" }));

    expect(screen.getByText("review_dialog_title")).toBeInTheDocument();
    expect(screen.getByText("The Lagos Chronicle")).toBeInTheDocument();
  });
});
