import { render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import { createElement } from "react";
import OfflinePage, { generateMetadata } from "./page";

const mockSetRequestLocale = jest.fn();
const mockGetTranslations = jest.fn();

jest.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
  setRequestLocale: (...args: unknown[]) => mockSetRequestLocale(...args),
}));

jest.mock("./offline-reload-button", () => ({
  OfflineReloadButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string; priority?: boolean }) => {
    void priority;
    return createElement("img", { alt, src, ...props });
  },
}));

const offlineMessages = {
  title: "You're Offline",
  description: "Check your connection and try again.",
  retry: "Try Again",
  eyebrow: "Offline Mode",
};

describe("OfflinePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTranslations.mockImplementation(() =>
      Promise.resolve((key: keyof typeof offlineMessages) => offlineMessages[key])
    );
  });

  it("marks the offline route as noindex metadata", async () => {
    const metadata = (await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    })) as Metadata;

    expect(metadata.title).toBe("You're Offline — BookPrinta");
    expect(metadata.description).toBe("Check your connection and try again.");
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    });
  });

  it("renders the branded offline content", async () => {
    const page = await OfflinePage({ params: Promise.resolve({ locale: "en" }) });
    render(page);

    expect(mockSetRequestLocale).toHaveBeenCalledWith("en");
    expect(screen.getByRole("heading", { name: "You're Offline" })).toBeInTheDocument();
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "BookPrinta" })).toHaveAttribute(
      "src",
      "/logo-main-white.png"
    );
  });
});
