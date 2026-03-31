import { render, screen } from "@testing-library/react";
import { MarketingSocialLinkList } from "./social-link-list";

describe("MarketingSocialLinkList", () => {
  it("infers the platform icon from the URL when the label is custom", () => {
    render(
      <MarketingSocialLinkList
        links={[{ label: "Follow our page", url: "https://facebook.com/bookprinta-ng" }]}
      />
    );

    expect(screen.getByRole("link", { name: "Follow our page" })).toHaveAttribute(
      "data-social-platform",
      "facebook"
    );
  });

  it("falls back to a generic icon for unknown links", () => {
    render(
      <MarketingSocialLinkList
        links={[{ label: "Community", url: "https://community.example.com" }]}
      />
    );

    expect(screen.getByRole("link", { name: "Community" })).toHaveAttribute(
      "data-social-platform",
      "generic"
    );
  });
});
