import type { MyProfileResponse } from "@bookprinta/shared";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSettingsProfilePanel } from "./profile-settings-profile-panel";

const useMyProfileMock = jest.fn();
const updateProfileMock = jest.fn();
const uploadProfileImageMock = jest.fn();
const deleteProfileImageMock = jest.fn();
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
  bio: "About You",
  website: "Website",
  purchase_links: "Where to Buy Your Books",
  social_links: "Social Media",
  remove_link: "Remove",
  profile_image: "Profile Image",
  profile_image_hint: "Upload the circular author photo readers will see on your showcase profile.",
  profile_image_choose: "Choose Image",
  profile_image_replace: "Replace Image",
  profile_image_remove: "Remove Image",
  profile_image_preview_alt: "Profile image preview",
  profile_image_drop_prompt: "Click or drag and drop your profile image here",
  profile_image_formats: "JPG or PNG only, max 10MB.",
  profile_image_uploading: "Uploading image",
  profile_image_upload_progress: "Profile image upload progress",
  profile_image_upload_success: "Profile image updated successfully.",
  profile_complete_status: "Profile complete",
  profile_incomplete_status: "Profile incomplete",
  profile_bio_hint: "Tell readers who you are, what you write, and where they can find you.",
  profile_bio_placeholder: "Share your author story in a few lines",
  profile_bio_counter: "{count}/{max}",
  profile_whatsapp_label: "WhatsApp Number",
  profile_whatsapp_hint: "Add the number readers can use to contact you on WhatsApp.",
  profile_whatsapp_placeholder: "e.g. +2348012345678",
  profile_website_hint: "Add your website if you want readers to visit it directly.",
  profile_website_placeholder: "https://yourwebsite.com",
  profile_purchase_links_hint: "Add one or more places where readers can buy your books.",
  profile_add_purchase_link: "Add Purchase Link",
  profile_purchase_link_label: "Link Label",
  profile_purchase_link_label_indexed: "Purchase link {index} label",
  profile_purchase_link_url: "Purchase URL",
  profile_purchase_link_url_indexed: "Purchase link {index} URL",
  profile_remove_purchase_link: "Remove purchase link {index}",
  profile_purchase_link_invalid: "Purchase link {index} needs both a label and a valid URL.",
  profile_social_links_hint: "Add the social profiles readers can use to follow your work.",
  profile_add_social_link: "Add Social Link",
  profile_social_platform_placeholder: "Select a platform",
  profile_social_platform_indexed: "Social link {index} platform",
  profile_social_link_url: "Profile URL",
  profile_social_link_url_indexed: "Social link {index} URL",
  profile_remove_social_link: "Remove social link {index}",
  profile_social_link_invalid: "Social link {index} needs a platform and a valid URL.",
  profile_social_platform_instagram: "Instagram",
  profile_social_platform_x: "X",
  profile_social_platform_facebook: "Facebook",
  profile_social_platform_linkedin: "LinkedIn",
  profile_social_platform_tiktok: "TikTok",
  profile_social_platform_youtube: "YouTube",
  profile_social_platform_threads: "Threads",
  profile_social_platform_goodreads: "Goodreads",
  profile_social_platform_amazon_author_central: "Amazon Author Central",
  profile_save: "Save Profile",
  profile_saving: "Saving profile...",
  profile_save_success: "Your profile has been updated.",
  profile_save_error: "Unable to save your profile right now.",
  profile_load_error_title: "Unable to load your profile",
  profile_load_error_description:
    "We couldn't load your profile details right now. Please try again.",
  profile_retry: "Retry",
};

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    interpolate(TRANSLATIONS[key] ?? key, values),
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

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    fill: _fill,
    loader: _loader,
    sizes: _sizes,
    unoptimized: _unoptimized,
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    loader?: unknown;
    sizes?: string;
    unoptimized?: boolean;
    [key: string]: unknown;
  }) => <span role="img" aria-label={alt} data-src={src} {...props} />,
}));

jest.mock("@/hooks/use-user-profile", () => ({
  useMyProfile: () => useMyProfileMock(),
  useUpdateMyProfile: () => ({
    updateProfile: (...args: unknown[]) => updateProfileMock(...args),
    isPending: false,
  }),
  useUploadProfileImage: () => ({
    uploadProfileImage: (...args: unknown[]) => uploadProfileImageMock(...args),
    isPending: false,
  }),
  useDeleteMyProfileImage: () => ({
    deleteProfileImage: (...args: unknown[]) => deleteProfileImageMock(...args),
    isPending: false,
  }),
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
    whatsApp: true,
    inApp: true,
  },
};

describe("ProfileSettingsProfilePanel", () => {
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
    updateProfileMock.mockResolvedValue(currentProfile);
    uploadProfileImageMock.mockResolvedValue(currentProfile);
    deleteProfileImageMock.mockResolvedValue({ ...currentProfile, profileImageUrl: null });
    URL.createObjectURL = jest.fn().mockReturnValue("blob:profile-image");
    URL.revokeObjectURL = jest.fn();
  });

  it("updates the bio counter and saves the profile payload through the profile mutation", async () => {
    const user = userEvent.setup();
    const nextProfile = {
      ...baseProfile,
      bio: "Hello world",
      isProfileComplete: true,
    };
    updateProfileMock.mockImplementation(async () => {
      currentProfile = nextProfile;
      return nextProfile;
    });

    render(<ProfileSettingsProfilePanel />);

    const bioField = screen.getByPlaceholderText("Share your author story in a few lines");
    await user.clear(bioField);
    await user.type(bioField, "Hello world");

    expect(screen.getByText("11/500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Profile" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith({
        bio: "Hello world",
        whatsAppNumber: "+2348012345678",
        websiteUrl: "https://author.example.com",
        purchaseLinks: [{ label: "Amazon", url: "https://amazon.com/example-book" }],
        socialLinks: [],
      })
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Your profile has been updated.");
  });

  it("adds and removes purchase and social link rows", async () => {
    const user = userEvent.setup();
    currentProfile = {
      ...baseProfile,
      purchaseLinks: [],
      socialLinks: [],
    };

    render(<ProfileSettingsProfilePanel />);

    await user.click(screen.getByRole("button", { name: "Add Purchase Link" }));
    await user.click(screen.getByRole("button", { name: "Add Social Link" }));

    expect(screen.getByLabelText("Purchase link 1 label")).toBeInTheDocument();
    expect(screen.getByLabelText("Purchase link 1 URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Social link 1 platform")).toBeInTheDocument();
    expect(screen.getByLabelText("Social link 1 URL")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove purchase link 1" }));
    await user.click(screen.getByRole("button", { name: "Remove social link 1" }));

    expect(screen.queryByLabelText("Purchase link 1 label")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Social link 1 platform")).not.toBeInTheDocument();
  });

  it("shows a circular preview and upload progress while a profile image upload is in flight", async () => {
    const user = userEvent.setup();
    const nextProfile = {
      ...baseProfile,
      profileImageUrl: "https://res.cloudinary.com/bookprinta/image/upload/profile.png",
      isProfileComplete: true,
    };
    let resolveUpload: ((value: typeof nextProfile) => void) | undefined;

    uploadProfileImageMock.mockImplementation(
      ({ onProgress }: { onProgress?: (percentage: number) => void }) =>
        new Promise<typeof nextProfile>((resolve) => {
          currentProfile = nextProfile;
          onProgress?.(35);
          resolveUpload = resolve;
        })
    );

    render(<ProfileSettingsProfilePanel />);

    await user.upload(
      screen.getByLabelText("Profile Image", { selector: "input" }),
      new File(["image"], "profile.png", { type: "image/png" })
    );

    expect(uploadProfileImageMock).toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Profile image preview" })).toHaveAttribute(
      "data-src",
      "blob:profile-image"
    );
    expect(screen.getByText("35%")).toBeInTheDocument();

    await act(async () => {
      resolveUpload?.(nextProfile);
    });

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Profile image preview" })).toHaveAttribute(
        "data-src",
        "https://res.cloudinary.com/bookprinta/image/upload/profile.png"
      )
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Profile image updated successfully.");
  });

  it("renders the profile editing experience cleanly at a 375px viewport with full-width actions", () => {
    const { container } = render(<ProfileSettingsProfilePanel />);

    expect(container.firstChild).toHaveAttribute("data-testid", "profile-settings-profile-panel");
    expect(screen.getByRole("button", { name: "Choose Image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Profile" })).toHaveClass("w-full");
    expect(
      screen.getByPlaceholderText("Share your author story in a few lines")
    ).toBeInTheDocument();
  });
});
