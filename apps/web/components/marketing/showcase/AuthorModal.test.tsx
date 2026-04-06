import { render, screen, within } from "@testing-library/react";
import { AuthorModal } from "./AuthorModal";

const useAuthorProfileMock = jest.fn();

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
    interpolate(
      {
        contact_whatsapp: "Message on WhatsApp",
        visit_website: "Visit Website",
        buy_book: "Buy Book",
        socials: "Social Media",
        author_details_unavailable: "No contact or book details yet.",
      }[key] ?? key,
      values
    ),
}));

jest.mock("@/hooks/use-showcase", () => ({
  useAuthorProfile: (...args: unknown[]) => useAuthorProfileMock(...args),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => {
    const React = require("react") as typeof import("react");
    return React.createElement("img", { src, alt, ...props });
  },
}));

describe("AuthorModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
  });

  it("shows a no-details-yet state when the author profile is unavailable", () => {
    useAuthorProfileMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(
      <AuthorModal
        entry={{
          id: "cmshowcaseentry0000000000001",
          authorName: "Adaeze Obi",
          bookTitle: "The Lagos Chronicle",
          bookCoverUrl: "https://res.cloudinary.com/bookprinta/image/upload/cover.png",
          aboutBook: "A literary journey through Lagos.",
          testimonial: null,
          categoryId: "cmcategory0000000000000001",
          category: {
            id: "cmcategory0000000000000001",
            name: "Fiction",
            slug: "fiction",
            description: "Fiction titles",
            sortOrder: 1,
          },
          publishedYear: 2026,
          publishedAt: "2026-03-10T12:00:00.000Z",
          userId: null,
          isFeatured: false,
          hasAuthorProfile: false,
          isProfileComplete: false,
        }}
        open
        onOpenChange={jest.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText("The Lagos Chronicle")).toBeInTheDocument();
    expect(within(dialog).getByText("No contact or book details yet.")).toBeInTheDocument();
  });
});
