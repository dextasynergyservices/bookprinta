import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ShowcaseEntry } from "@/types/showcase";
import { ShowcaseCard } from "./ShowcaseCard";

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
        contact_author: "Contact Author",
        cover_alt: "Cover of {title}",
      }[key] ?? key,
      values
    ),
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
    "style",
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
    motion,
    useScroll: () => ({
      scrollYProgress: 0,
    }),
    useTransform: () => 0,
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
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    loader?: unknown;
    sizes?: string;
    [key: string]: unknown;
  }) => <span role="img" aria-label={alt} data-src={src} {...props} />,
}));

function createShowcaseEntry(overrides: Partial<ShowcaseEntry> = {}): ShowcaseEntry {
  return {
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
    userId: "cmuser000000000000000000001",
    isFeatured: false,
    isProfileComplete: true,
    ...overrides,
  };
}

describe("ShowcaseCard", () => {
  it("hides the contact-author action when the author's profile is incomplete", () => {
    render(
      <ShowcaseCard
        entry={createShowcaseEntry({ isProfileComplete: false })}
        onContactAuthor={jest.fn()}
        index={0}
      />
    );

    expect(screen.queryByRole("button", { name: "Contact Author" })).not.toBeInTheDocument();
  });

  it("shows the contact-author action only when the author's profile is complete", async () => {
    const user = userEvent.setup();
    const onContactAuthor = jest.fn();
    const entry = createShowcaseEntry();

    render(<ShowcaseCard entry={entry} onContactAuthor={onContactAuthor} index={0} />);

    await user.click(screen.getByRole("button", { name: "Contact Author" }));

    expect(onContactAuthor).toHaveBeenCalledWith(entry);
  });
});
