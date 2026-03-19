import { fireEvent, render, screen } from "@testing-library/react";
import { OfflineReloadButton } from "./offline-reload-button";
import { reloadCurrentPage } from "./reload-page";

jest.mock("./reload-page", () => ({
  reloadCurrentPage: jest.fn(),
}));

describe("OfflineReloadButton", () => {
  it("reloads the current page when activated", () => {
    render(<OfflineReloadButton label="Try Again" />);

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    expect(reloadCurrentPage).toHaveBeenCalledTimes(1);
  });
});
