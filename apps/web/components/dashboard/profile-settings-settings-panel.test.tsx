import type { MyProfileResponse } from "@bookprinta/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSettingsSettingsPanel } from "./profile-settings-settings-panel";

const useMyProfileMock = jest.fn();
const changePasswordMock = jest.fn();
const updateLanguageMock = jest.fn();
const updateNotificationPreferencesMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

const TRANSLATIONS: Record<string, string> = {
  settings: "Settings",
  settings_load_error_title: "Unable to load your settings",
  settings_load_error_description:
    "We couldn't load your account settings right now. Please try again.",
  settings_retry: "Retry",
  retry: "Try Again",
  settings_password_title: "Change Password",
  settings_password_description: "Update your password for future sign-ins.",
  settings_password_current_label: "Current Password",
  settings_password_current_placeholder: "Enter your current password",
  settings_password_new_label: "New Password",
  settings_password_new_placeholder: "Enter your new password",
  settings_password_confirm_label: "Confirm New Password",
  settings_password_confirm_placeholder: "Re-enter your new password",
  settings_password_submit: "Update Password",
  settings_password_submitting: "Updating password...",
  settings_password_current_required: "Enter your current password.",
  settings_password_new_required: "Enter a new password.",
  settings_password_confirm_required: "Confirm your new password.",
  settings_password_strength_error:
    "Use at least 8 characters with uppercase, lowercase, a number, and a symbol.",
  settings_password_mismatch: "Your new password and confirmation must match.",
  settings_password_success: "Your password has been updated.",
  settings_password_error: "Unable to update your password right now.",
  settings_language_title: "Language Preference",
  settings_language_description:
    "Choose the language you want for your dashboard and future emails.",
  settings_language_current_label: "Current language",
  settings_language_saving: "Saving...",
  settings_language_success: "Language preference updated.",
  settings_language_error: "Unable to update your language preference right now.",
  settings_language_name_en: "English",
  settings_language_name_fr: "French",
  settings_language_name_es: "Spanish",
  settings_notifications_title: "Notification Preferences",
  settings_notifications_description: "Choose how you want to hear from BookPrinta.",
  settings_notifications_critical_note:
    "Some critical notifications, including signup links and receipts, are always sent.",
  settings_notifications_email_label: "Email notifications",
  settings_notifications_email_description:
    "Receive order updates and important account alerts by email.",
  settings_notifications_whatsapp_label: "WhatsApp notifications",
  settings_notifications_whatsapp_description:
    "Receive quick order updates and reminders on WhatsApp.",
  settings_notifications_in_app_label: "In-app notifications",
  settings_notifications_in_app_description: "Show alerts inside your dashboard.",
  settings_notifications_save: "Save Notification Preferences",
  settings_notifications_saving: "Saving preferences...",
  settings_notifications_success: "Notification preferences updated.",
  settings_notifications_error: "Unable to update your notification preferences right now.",
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => TRANSLATIONS[key] ?? key,
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

jest.mock("framer-motion", () => {
  const React = require("react") as typeof import("react");
  const MOTION_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "whileHover",
    "whileTap",
    "whileInView",
    "viewport",
    "layout",
  ]);

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(function MotionPrimitive(
          { children, ...props }: React.HTMLAttributes<HTMLElement>,
          ref
        ) {
          const domProps = Object.fromEntries(
            Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key))
          );

          return React.createElement(tag, { ...domProps, ref }, children);
        }),
    }
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion,
  };
});

jest.mock("@/hooks/use-user-profile", () => ({
  useMyProfile: () => useMyProfileMock(),
  useChangeMyPassword: () => ({
    changePassword: (...args: unknown[]) => changePasswordMock(...args),
    isPending: false,
  }),
  useUpdateMyLanguage: () => ({
    updateLanguage: (...args: unknown[]) => updateLanguageMock(...args),
    isPending: false,
  }),
  useUpdateMyNotificationPreferences: () => ({
    updateNotificationPreferences: (...args: unknown[]) =>
      updateNotificationPreferencesMock(...args),
    isPending: false,
  }),
}));

jest.mock("../shared/language-switcher", () => ({
  LanguageSwitcher: ({
    onLocaleChange,
    selectedLocale,
  }: {
    onLocaleChange?: (locale: string) => Promise<void> | void;
    selectedLocale?: string;
  }) => (
    <button
      type="button"
      data-selected-locale={selectedLocale}
      onClick={() => {
        void onLocaleChange?.("fr");
      }}
    >
      Change language
    </button>
  ),
}));

const baseProfile: MyProfileResponse = {
  bio: "Hello",
  profileImageUrl: null,
  whatsAppNumber: "+2348012345678",
  websiteUrl: "https://author.example.com",
  purchaseLinks: [{ label: "Amazon", url: "https://amazon.com/example-book" }],
  socialLinks: [],
  isProfileComplete: false,
  preferredLanguage: "en",
  notificationPreferences: {
    email: true,
    whatsApp: false,
    inApp: true,
  },
};

describe("ProfileSettingsSettingsPanel", () => {
  let currentProfile: MyProfileResponse = baseProfile;

  beforeEach(() => {
    jest.clearAllMocks();
    setViewportWidth(375);
    currentProfile = baseProfile;
    useMyProfileMock.mockImplementation(() => ({
      profile: currentProfile,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    }));
    changePasswordMock.mockResolvedValue({ success: true });
    updateLanguageMock.mockResolvedValue({ preferredLanguage: "fr" });
    updateNotificationPreferencesMock.mockResolvedValue({
      notificationPreferences: {
        email: false,
        whatsApp: false,
        inApp: true,
      },
    });
  });

  it("submits the authenticated password change form", async () => {
    const user = userEvent.setup();

    render(<ProfileSettingsSettingsPanel />);

    await user.type(screen.getByPlaceholderText("Enter your current password"), "OldPass1!");
    await user.type(screen.getByPlaceholderText("Enter your new password"), "StrongPass1!");
    await user.type(screen.getByPlaceholderText("Re-enter your new password"), "StrongPass1!");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() =>
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: "OldPass1!",
        newPassword: "StrongPass1!",
        confirmPassword: "StrongPass1!",
      })
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Your password has been updated.");
  });

  it("blocks password submission when the confirmation does not match", async () => {
    const user = userEvent.setup();

    render(<ProfileSettingsSettingsPanel />);

    await user.type(screen.getByPlaceholderText("Enter your current password"), "OldPass1!");
    await user.type(screen.getByPlaceholderText("Enter your new password"), "StrongPass1!");
    await user.type(screen.getByPlaceholderText("Re-enter your new password"), "WrongPass1!");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(changePasswordMock).not.toHaveBeenCalled();
    expect(screen.getByText("Your new password and confirmation must match.")).toBeInTheDocument();
  });

  it("persists the selected language before switching locale", async () => {
    const user = userEvent.setup();

    render(<ProfileSettingsSettingsPanel />);

    await user.click(screen.getByRole("button", { name: "Change language" }));

    await waitFor(() =>
      expect(updateLanguageMock).toHaveBeenCalledWith({
        preferredLanguage: "fr",
      })
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Language preference updated.");
  });

  it("saves notification preference toggles immediately through the backend mutation", async () => {
    const user = userEvent.setup();
    updateNotificationPreferencesMock.mockImplementation(async (payload: unknown) => ({
      notificationPreferences: payload,
    }));

    render(<ProfileSettingsSettingsPanel />);

    await user.click(screen.getByRole("switch", { name: "Email notifications" }));

    await waitFor(() =>
      expect(updateNotificationPreferencesMock).toHaveBeenCalledWith({
        email: false,
        whatsApp: false,
        inApp: true,
      })
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Notification preferences updated.");
  });

  it("hides the WhatsApp toggle when no WhatsApp number is saved on the profile", () => {
    currentProfile = {
      ...baseProfile,
      whatsAppNumber: null,
    };

    render(<ProfileSettingsSettingsPanel />);

    expect(
      screen.queryByRole("switch", { name: "WhatsApp notifications" })
    ).not.toBeInTheDocument();
  });

  it("renders the settings experience cleanly at a 375px viewport with full-width mobile actions", () => {
    const { container } = render(<ProfileSettingsSettingsPanel />);

    expect(container.firstChild).toHaveAttribute("data-testid", "profile-settings-settings-panel");
    expect(screen.getByRole("button", { name: "Update Password" })).toHaveClass("w-full");
    expect(
      screen.getByText(
        "Some critical notifications, including signup links and receipts, are always sent."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change language" })).toBeInTheDocument();
  });

  it("renders the settings skeleton while the profile query is loading", () => {
    useMyProfileMock.mockReturnValue({
      profile: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const { container } = render(<ProfileSettingsSettingsPanel />);

    expect(container.firstChild).toHaveAttribute("data-testid", "profile-settings-settings-panel");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
