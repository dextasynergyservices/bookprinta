import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BookCardSkeleton,
  DashboardErrorState,
  NotificationItemSkeleton,
  OrderRowSkeleton,
  ProfileSkeleton,
} from "./dashboard-async-primitives";

describe("dashboard async primitives", () => {
  it("renders the shared book, order, notification, and profile skeleton shapes", () => {
    const { container } = render(
      <div>
        <BookCardSkeleton />
        <OrderRowSkeleton />
        <NotificationItemSkeleton />
        <ProfileSkeleton />
      </div>
    );

    expect(container.querySelector('[data-dashboard-skeleton="book-card"]')).not.toBeNull();
    expect(container.querySelector('[data-dashboard-skeleton="order-row"]')).not.toBeNull();
    expect(container.querySelector('[data-dashboard-skeleton="notification-item"]')).not.toBeNull();
    expect(container.querySelector('[data-dashboard-skeleton="profile"]')).not.toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders a centered retry state and invokes the retry callback", async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    render(
      <DashboardErrorState
        title="Unable to load this section"
        description="Please try again in a moment."
        retryLabel="Try Again"
        loadingLabel="Retrying..."
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("alert")).toHaveAttribute("data-dashboard-error-state", "true");
    expect(screen.getByText("Unable to load this section")).toBeInTheDocument();
    expect(screen.getByText("Please try again in a moment.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the loading label while retry is in progress", () => {
    render(
      <DashboardErrorState
        title="Unable to load this section"
        description="Please try again in a moment."
        retryLabel="Try Again"
        loadingLabel="Retrying..."
        onRetry={jest.fn()}
        isRetrying
      />
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
  });
});
