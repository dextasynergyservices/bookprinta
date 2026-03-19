import { render, screen } from "@testing-library/react";
import { LegalDocument } from "./legal-document";

describe("LegalDocument", () => {
  it("renders the shared title, meta, intro, and repeated legal sections", () => {
    const { container } = render(
      <LegalDocument
        title="Terms & Conditions"
        lastUpdatedLabel="Last updated:"
        lastUpdatedDate="March 19, 2026"
        intro={[
          {
            id: "intro-1",
            content: "These terms govern your use of BookPrinta's services.",
          },
          {
            id: "intro-2",
            content: "Please read them carefully before placing an order.",
          },
        ]}
        sections={[
          {
            id: "acceptance",
            title: "Acceptance of Terms",
            paragraphs: [
              {
                id: "acceptance-1",
                content: "By accessing the platform, you agree to these terms.",
              },
              {
                id: "acceptance-2",
                content: "If you do not agree, you should not use the service.",
              },
            ],
          },
          {
            id: "payment",
            title: "Payment Policy",
            paragraphs: [
              {
                id: "payment-1",
                content: "Payments must be completed before production begins.",
              },
            ],
          },
        ]}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms & Conditions" })
    ).toBeInTheDocument();
    expect(screen.getByText("Last updated: March 19, 2026")).toBeInTheDocument();
    expect(
      screen.getByText("These terms govern your use of BookPrinta's services.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Acceptance of Terms" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Payment Policy" })).toBeInTheDocument();

    expect(container.querySelector('[data-legal-document="true"]')).not.toBeNull();
    expect(container.querySelector('[data-legal-intro="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-legal-section="true"]')).toHaveLength(2);
    expect(container.querySelector('[data-legal-section-body="true"]')?.className).toContain(
      "font-serif"
    );
  });

  it("omits the intro block when no intro paragraphs are provided", () => {
    const { container } = render(
      <LegalDocument
        title="Privacy Policy"
        lastUpdatedLabel="Last updated:"
        lastUpdatedDate="March 19, 2026"
        sections={[
          {
            id: "data-collected",
            title: "Data Collected",
            paragraphs: [
              {
                id: "data-collected-1",
                content: "We collect the information needed to process your order.",
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(container.querySelector('[data-legal-intro="true"]')).toBeNull();
    expect(container.querySelectorAll('[data-legal-section="true"]')).toHaveLength(1);
  });
});
