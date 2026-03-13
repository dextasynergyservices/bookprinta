import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminBookPdfVerifier } from "./AdminBookPdfVerifier";

jest.mock("react-pdf", () => {
  const React = require("react");

  return {
    pdfjs: {
      version: "4.0.0",
      GlobalWorkerOptions: {
        workerSrc: "",
      },
    },
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children: React.ReactNode;
      onLoadSuccess?: (payload: { numPages: number }) => void;
    }) => {
      React.useEffect(() => {
        const timer = setTimeout(() => {
          onLoadSuccess?.({ numPages: 4 });
        }, 0);

        return () => {
          clearTimeout(timer);
        };
      }, [onLoadSuccess]);

      return <div data-testid="pdf-document">{children}</div>;
    },
    Page: ({ pageNumber }: { pageNumber: number }) => (
      <div data-testid="pdf-page">Rendered page {pageNumber}</div>
    ),
  };
});

describe("AdminBookPdfVerifier", () => {
  it("renders the loaded PDF and allows page navigation", async () => {
    const user = userEvent.setup();

    render(
      <AdminBookPdfVerifier
        fileName="preview.pdf"
        fileUrl="https://example.com/preview.pdf"
        emptyLabel="Waiting for PDF"
        loadingLabel="Loading PDF preview"
        errorLabel="The PDF could not be rendered right now."
        pageLabel="Page {page} of {count}"
        previousLabel="Previous"
        nextLabel="Next"
      />
    );

    expect(await screen.findByText("Page 1 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-page")).toHaveTextContent("Rendered page 1");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-page")).toHaveTextContent("Rendered page 2");

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
  });
});
