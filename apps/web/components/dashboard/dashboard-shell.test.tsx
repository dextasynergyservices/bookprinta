import type { MyProfileResponse } from "@bookprinta/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DashboardShell } from "./dashboard-shell";

const useNotificationBannerStateMock = jest.fn();
const useReviewStateMock = jest.fn();
const useCreateReviewMock = jest.fn();
const useMyProfileMock = jest.fn();
const submitReviewMock = jest.fn();
const REVIEW_DIALOG_DISMISSED_STORAGE_KEY_PREFIX = "dashboard_review_dialog_dismissed:";
const COMPLETE_PROFILE_BANNER_DISMISSED_STORAGE_KEY = "dashboard_complete_profile_banner_dismissed";

function createReviewBook(
  overrides: Partial<{
    bookId: string;
    title: string | null;
    coverImageUrl: string | null;
    lifecycleStatus: string;
    reviewStatus: "PENDING" | "REVIEWED";
    review: {
      rating: number;
      comment: string | null;
      isPublic: boolean;
      createdAt: string;
    } | null;
  }> = {}
) {
  return {
    bookId: "cm1111111111111111111111111",
    title: "The Lagos Chronicle",
    coverImageUrl: null,
    lifecycleStatus: "DELIVERED",
    reviewStatus: "PENDING" as const,
    review: null,
    ...overrides,
  };
}

function createReviewState(books = [createReviewBook()]): {
  books: ReturnType<typeof createReviewBook>[];
  pendingBooks: ReturnType<typeof createReviewBook>[];
  isLoading: boolean;
} {
  return {
    books,
    pendingBooks: books.filter((book) => book.reviewStatus === "PENDING"),
    isLoading: false,
  };
}

let currentReviewState = createReviewState();
let currentProfile: MyProfileResponse = {
  bio: "Hello",
  profileImageUrl: null,
  whatsAppNumber: "+2348012345678",
  websiteUrl: "https://author.example.com",
  purchaseLinks: [],
  socialLinks: [],
  isProfileComplete: false,
  preferredLanguage: "en" as const,
  notificationPreferences: {
    email: true,
    whatsApp: true,
    inApp: true,
  },
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    typeof values?.count === "number" ? `${key}-${values.count}` : key,
}));

jest.mock("@/hooks/use-dashboard-shell-data", () => ({
  useNotificationBannerState: () => useNotificationBannerStateMock(),
  useReviewState: () => useReviewStateMock(),
  useCreateReview: () => useCreateReviewMock(),
}));

jest.mock("@/hooks/use-user-profile", () => ({
  useMyProfile: () => useMyProfileMock(),
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
      open-review-dialog-header
    </button>
  ),
}));

jest.mock("./dashboard-sidebar", () => ({
  DashboardSidebar: ({
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
      open-review-dialog-sidebar
    </button>
  ),
}));

jest.mock("./dashboard-mobile-drawer", () => ({
  DashboardMobileDrawer: () => null,
}));

jest.mock("./dashboard-content-frame", () => ({
  DashboardContentFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
    window.localStorage.clear();
    window.sessionStorage.clear();

    useNotificationBannerStateMock.mockReturnValue({
      hasProductionDelayBanner: true,
    });
    currentReviewState = createReviewState();
    useReviewStateMock.mockImplementation(() => currentReviewState);
    currentProfile = {
      bio: "Hello",
      profileImageUrl: null,
      whatsAppNumber: "+2348012345678",
      websiteUrl: "https://author.example.com",
      purchaseLinks: [],
      socialLinks: [],
      isProfileComplete: false,
      preferredLanguage: "en",
      notificationPreferences: {
        email: true,
        whatsApp: true,
        inApp: true,
      },
    };
    useMyProfileMock.mockImplementation(() => ({
      profile: currentProfile,
    }));
    useCreateReviewMock.mockReturnValue({
      submitReview: submitReviewMock,
      isPending: false,
    });
    submitReviewMock.mockImplementation(async () => {
      currentReviewState = createReviewState([
        createReviewBook({
          reviewStatus: "REVIEWED",
          review: {
            rating: 4,
            comment: "Excellent support.",
            isPublic: false,
            createdAt: "2026-03-07T12:00:00.000Z",
          },
        }),
      ]);

      return {
        book: currentReviewState.books[0],
      };
    });
  });

  it("shows the production delay banner, complete profile banner, and auto-opens the first pending review from shell state", () => {
    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    expect(screen.getByText("production_delay_banner")).toBeInTheDocument();
    expect(screen.getByText("complete_profile_banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "complete_profile_cta" })).toHaveAttribute(
      "href",
      "/dashboard/profile"
    );
    expect(screen.getByText("review_dialog_title")).toBeInTheDocument();
    expect(screen.getByText("The Lagos Chronicle")).toBeInTheDocument();
  });

  it("hides the production delay banner when notification banner state is inactive", () => {
    useNotificationBannerStateMock.mockReturnValue({
      hasProductionDelayBanner: false,
    });

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    expect(screen.queryByText("production_delay_banner")).not.toBeInTheDocument();
  });

  it("hides the complete profile banner when the backend profile is already complete", () => {
    currentProfile = {
      ...currentProfile,
      profileImageUrl: "https://res.cloudinary.com/bookprinta/image/upload/profile.png",
      purchaseLinks: [{ label: "Amazon", url: "https://amazon.com/example-book" }],
      isProfileComplete: true,
    };

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    expect(screen.queryByText("complete_profile_banner")).not.toBeInTheDocument();
  });

  it("stores complete-profile banner dismissal for the current session and does not re-show it", async () => {
    const view = render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "complete_profile_dismiss" }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem(COMPLETE_PROFILE_BANNER_DISMISSED_STORAGE_KEY)).toBe(
        "1"
      );
    });

    expect(screen.queryByText("complete_profile_banner")).not.toBeInTheDocument();

    view.unmount();

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    await waitFor(() => {
      expect(screen.queryByText("complete_profile_banner")).not.toBeInTheDocument();
    });
  });

  it("shows the complete profile banner again in a new session when the profile is still incomplete", async () => {
    window.sessionStorage.setItem(COMPLETE_PROFILE_BANNER_DISMISSED_STORAGE_KEY, "1");
    const view = render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    await waitFor(() => {
      expect(screen.queryByText("complete_profile_banner")).not.toBeInTheDocument();
    });

    view.unmount();
    window.sessionStorage.clear();

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    await waitFor(() => {
      expect(screen.getByText("complete_profile_banner")).toBeInTheDocument();
    });
  });

  it("stores dismissal by bookId for the current session and does not auto-reopen it", async () => {
    const dismissalKey = `${REVIEW_DIALOG_DISMISSED_STORAGE_KEY_PREFIX}cm1111111111111111111111111`;
    const view = render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "review_dialog_close" }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem(dismissalKey)).toBe("1");
    });

    view.unmount();

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    await waitFor(() => {
      expect(screen.queryByText("review_dialog_title")).not.toBeInTheDocument();
    });
  });

  it("reappears on a new session when the review was dismissed but not submitted", async () => {
    const dismissalKey = `${REVIEW_DIALOG_DISMISSED_STORAGE_KEY_PREFIX}cm1111111111111111111111111`;
    const view = render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "review_dialog_close" }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem(dismissalKey)).toBe("1");
    });

    view.unmount();
    window.sessionStorage.clear();

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    await waitFor(() => {
      expect(screen.getByText("review_dialog_title")).toBeInTheDocument();
    });
  });

  it("allows manual opening from the shared shell handler after auto-dismissal", async () => {
    window.sessionStorage.setItem(
      `${REVIEW_DIALOG_DISMISSED_STORAGE_KEY_PREFIX}cm1111111111111111111111111`,
      "1"
    );

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    await waitFor(() => {
      expect(screen.queryByText("review_dialog_title")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "open-review-dialog-header" }));

    expect(screen.getByText("review_dialog_title")).toBeInTheDocument();
    expect(screen.getByText("The Lagos Chronicle")).toBeInTheDocument();
  });

  it("clears session dismissal after a successful review submission", async () => {
    const dismissalKey = `${REVIEW_DIALOG_DISMISSED_STORAGE_KEY_PREFIX}cm1111111111111111111111111`;
    window.sessionStorage.setItem(dismissalKey, "1");

    render(
      <DashboardShell>
        <div>dashboard-content</div>
      </DashboardShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "open-review-dialog-sidebar" }));
    fireEvent.click(screen.getByRole("radio", { name: "review_dialog_rating_option-4" }));
    fireEvent.click(screen.getByRole("button", { name: "review_submit" }));

    await waitFor(() => {
      expect(submitReviewMock).toHaveBeenCalledWith({
        bookId: "cm1111111111111111111111111",
        rating: 4,
        comment: "",
      });
    });

    await waitFor(() => {
      expect(window.sessionStorage.getItem(dismissalKey)).toBeNull();
    });
  });

  it("does not enter a render loop when review state returns fresh derived arrays", () => {
    useReviewStateMock.mockImplementation(() => createReviewState([createReviewBook()]));

    expect(() =>
      render(
        <DashboardShell>
          <div>dashboard-content</div>
        </DashboardShell>
      )
    ).not.toThrow();

    expect(screen.getByText("review_dialog_title")).toBeInTheDocument();
  });
});
