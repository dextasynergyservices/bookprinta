import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProfileSettingsView } from "./profile-settings-view";

const usePathnameMock = jest.fn();
const useSearchParamsMock = jest.fn();

const DASHBOARD_TRANSLATIONS: Record<string, string> = {
  profile: "Profile",
  settings: "Settings",
  bio: "About You",
  website: "Website",
  purchase_links: "Where to Buy Your Books",
  social_links: "Social Media",
};

jest.mock("next-intl", () => ({
  useTranslations: (_namespace: "dashboard") => (key: string) => DASHBOARD_TRANSLATIONS[key] ?? key,
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => usePathnameMock(),
}));

jest.mock("./profile-settings-profile-panel", () => ({
  ProfileSettingsProfilePanel: () => <div data-testid="profile-settings-profile-panel" />,
}));

jest.mock("./profile-settings-settings-panel", () => ({
  ProfileSettingsSettingsPanel: () => <div data-testid="profile-settings-settings-panel" />,
}));

describe("ProfileSettingsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks the profile route tab as active and renders the profile panel", () => {
    usePathnameMock.mockReturnValue("/dashboard/profile");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());

    render(<ProfileSettingsView />);

    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByTestId("profile-settings-profile-panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });

  it("marks the settings route tab as active and renders the settings panel", () => {
    usePathnameMock.mockReturnValue("/dashboard/settings");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());

    render(<ProfileSettingsView />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("profile-settings-settings-panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("allows query state to override the selected tab without changing the shared view", () => {
    usePathnameMock.mockReturnValue("/dashboard/profile");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("tab=settings"));

    render(<ProfileSettingsView />);

    expect(screen.getByTestId("profile-settings-settings-panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });
});
