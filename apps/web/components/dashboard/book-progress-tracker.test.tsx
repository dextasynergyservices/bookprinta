import { render, screen } from "@testing-library/react";
import { BookProgressTracker } from "./book-progress-tracker";

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
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

  return { motion };
});

describe("BookProgressTracker", () => {
  it("renders all 11 pipeline stages and state markers", () => {
    render(
      <BookProgressTracker
        timeline={[
          {
            stage: "PAYMENT_RECEIVED",
            state: "completed",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PAYMENT_RECEIVED",
          },
          {
            stage: "DESIGNING",
            state: "current",
            reachedAt: "2026-03-02T08:00:00.000Z",
            sourceStatus: "DESIGNING",
          },
          {
            stage: "DELIVERED",
            state: "upcoming",
            reachedAt: null,
            sourceStatus: null,
          },
        ]}
        currentStage="DESIGNING"
        locale="en"
      />
    );

    const stageNodes = document.querySelectorAll("[data-stage]");
    expect(stageNodes.length).toBe(22);

    const completedNodes = document.querySelectorAll('[data-step-state="completed"]');
    const currentNodes = document.querySelectorAll('[data-step-state="current"]');
    const upcomingNodes = document.querySelectorAll('[data-step-state="upcoming"]');
    expect(completedNodes.length).toBeGreaterThan(0);
    expect(currentNodes.length).toBeGreaterThan(0);
    expect(upcomingNodes.length).toBeGreaterThan(0);

    expect(screen.getAllByText("Designing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Delivered").length).toBeGreaterThan(0);
  });

  it("renders pulsing current indicator and completed-step timestamp", () => {
    const completedAt = "2026-03-01T08:00:00.000Z";
    const expectedTimestamp = new Intl.DateTimeFormat("en-NG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(completedAt));

    render(
      <BookProgressTracker
        timeline={[
          {
            stage: "PAYMENT_RECEIVED",
            state: "completed",
            reachedAt: completedAt,
            sourceStatus: "PAYMENT_RECEIVED",
          },
          {
            stage: "DESIGNING",
            state: "current",
            reachedAt: "2026-03-02T08:00:00.000Z",
            sourceStatus: "DESIGNING",
          },
        ]}
        currentStage="DESIGNING"
        locale="en"
      />
    );

    expect(document.querySelectorAll('[data-slot="book-progress-current-ring"]')).toHaveLength(2);
    expect(screen.getAllByText(expectedTimestamp).length).toBeGreaterThan(0);
  });

  it("shows rejection reason on rejected stage", () => {
    render(
      <BookProgressTracker
        timeline={[
          {
            stage: "PAYMENT_RECEIVED",
            state: "completed",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PAYMENT_RECEIVED",
          },
          {
            stage: "REVIEW",
            state: "rejected",
            reachedAt: "2026-03-03T08:00:00.000Z",
            sourceStatus: "REJECTED",
          },
        ]}
        currentStage="REVIEW"
        rejectionReason="Low-resolution manuscript images."
        rejectionReasonLabel="Rejection reason"
      />
    );

    expect(screen.getAllByText("Review").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Rejection reason: Low-resolution manuscript images.").length
    ).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-step-state="rejected"]').length).toBeGreaterThan(0);
  });

  it("applies custom stage labels when provided", () => {
    render(
      <BookProgressTracker
        timeline={[
          {
            stage: "PAYMENT_RECEIVED",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PAYMENT_RECEIVED",
          },
        ]}
        stageLabels={{
          PAYMENT_RECEIVED: "Payment Received",
          DESIGNING: "Designing",
        }}
      />
    );

    expect(screen.getAllByText("Payment Received").length).toBeGreaterThan(0);
  });

  it("applies localized ARIA labels using stage and state labels", () => {
    render(
      <BookProgressTracker
        timeline={[
          {
            stage: "PAYMENT_RECEIVED",
            state: "current",
            reachedAt: "2026-03-01T08:00:00.000Z",
            sourceStatus: "PAYMENT_RECEIVED",
          },
        ]}
        stageLabels={{
          PAYMENT_RECEIVED: "Payment Received",
        }}
        stateLabels={{
          completed: "Completed",
          current: "Current",
          upcoming: "Upcoming",
          rejected: "Rejected",
        }}
      />
    );

    expect(screen.getAllByLabelText("Payment Received - Current")).toHaveLength(2);
  });

  it("marks pre-REVIEW stages as skipped for reprint orders", () => {
    render(
      <BookProgressTracker
        timeline={[
          {
            stage: "REVIEW",
            state: "current",
            reachedAt: "2026-03-05T08:00:00.000Z",
            sourceStatus: "REVIEW",
          },
        ]}
        currentStage="REVIEW"
        isReprint
        reprintLabel="Reprint — same document"
        stateLabels={{
          completed: "Completed",
          current: "Current",
          upcoming: "Upcoming",
          rejected: "Rejected",
          skipped: "Skipped",
        }}
      />
    );

    // Reprint label is displayed
    expect(screen.getAllByText("Reprint — same document").length).toBeGreaterThan(0);

    // Pre-REVIEW stages are skipped (PAYMENT_RECEIVED through FORMATTED = 5 stages × 2 layouts)
    const skippedNodes = document.querySelectorAll('[data-step-state="skipped"]');
    expect(skippedNodes.length).toBe(10);

    // REVIEW stage is current
    const currentNodes = document.querySelectorAll('[data-step-state="current"]');
    expect(currentNodes.length).toBeGreaterThan(0);

    // Post-REVIEW stages are upcoming
    const upcomingNodes = document.querySelectorAll('[data-step-state="upcoming"]');
    expect(upcomingNodes.length).toBeGreaterThan(0);
  });
});
