import {
  BOOK_PROGRESS_TRACKER_SOURCE_ENDPOINT,
  BOOK_PROGRESS_TRACKER_TARGET_ENDPOINT,
  mapBackendStatusToProgressStage,
  normalizeBookProgressPayload,
} from "./book-progress-contract";

describe("book progress contract alignment", () => {
  it("locks source and target endpoints for tracker rollout", () => {
    expect(BOOK_PROGRESS_TRACKER_SOURCE_ENDPOINT).toBe("/api/v1/orders/:id/tracking");
    expect(BOOK_PROGRESS_TRACKER_TARGET_ENDPOINT).toBe("/api/v1/books/:id");
  });

  it("normalizes current orders tracking payload to tracker contract", () => {
    const payload = {
      orderId: "cm1111111111111111111111111",
      orderNumber: "BP-2026-0001",
      bookId: "cm2222222222222222222222222",
      currentBookStatus: "PREVIEW_READY",
      rejectionReason: null,
      timeline: [
        {
          status: "PAYMENT_RECEIVED",
          state: "completed",
          reachedAt: "2026-03-01T08:00:00.000Z",
        },
        {
          status: "DESIGNING",
          state: "completed",
          reachedAt: "2026-03-01T09:00:00.000Z",
        },
        {
          status: "PREVIEW_READY",
          state: "current",
          reachedAt: "2026-03-02T10:00:00.000Z",
        },
      ],
    };

    const normalized = normalizeBookProgressPayload(payload);

    expect(normalized.sourceEndpoint).toBe("orders_tracking");
    expect(normalized.bookId).toBe("cm2222222222222222222222222");
    expect(normalized.currentStatus).toBe("PREVIEW_READY");
    expect(normalized.currentStage).toBe("REVIEW");
    expect(normalized.timeline.find((stage) => stage.stage === "REVIEW")?.state).toBe("current");
    expect(normalized.timeline.find((stage) => stage.stage === "DESIGNING")?.state).toBe(
      "completed"
    );
    expect(normalized.timeline.find((stage) => stage.stage === "APPROVED")?.state).toBe("upcoming");
  });

  it("normalizes future /books/:id payload shape to the same contract", () => {
    const payload = {
      id: "cm2222222222222222222222222",
      status: "IN_PRODUCTION",
      rejectionReason: null,
      rollout: {
        environment: "staging",
        allowInFlightAccess: true,
        isGrandfathered: false,
        blockedBy: null,
        workspace: { enabled: true, access: "enabled" },
        manuscriptPipeline: { enabled: true, access: "enabled" },
        billingGate: { enabled: true, access: "enabled" },
        finalPdf: { enabled: true, access: "enabled" },
      },
      processing: {
        isActive: true,
        currentStep: "COUNTING_PAGES",
        jobStatus: "processing",
        trigger: "upload",
        startedAt: "2026-03-03T12:05:00.000Z",
        attempt: 1,
        maxAttempts: 3,
      },
      timeline: [
        {
          status: "APPROVED",
          state: "completed",
          reachedAt: "2026-03-02T11:00:00.000Z",
        },
        {
          status: "IN_PRODUCTION",
          state: "current",
          reachedAt: "2026-03-03T12:00:00.000Z",
        },
      ],
    };

    const normalized = normalizeBookProgressPayload(payload);

    expect(normalized.sourceEndpoint).toBe("books_detail");
    expect(normalized.bookId).toBe("cm2222222222222222222222222");
    expect(normalized.currentStage).toBe("PRINTING");
    expect(normalized.timeline.find((stage) => stage.stage === "PRINTING")?.state).toBe("current");
    expect(normalized.rollout.environment).toBe("staging");
    expect(normalized.rollout.finalPdf.access).toBe("enabled");
    expect(normalized.processing.currentStep).toBe("COUNTING_PAGES");
    expect(normalized.processing.jobStatus).toBe("processing");
  });

  it("keeps a complete 11-step timeline and safe fallback when status is unknown", () => {
    const payload = {
      id: "cm3333333333333333333333333",
      status: "SOMETHING_NEW",
      timeline: [],
    };

    const normalized = normalizeBookProgressPayload(payload);

    expect(normalized.currentStatus).toBe("SOMETHING_NEW");
    expect(normalized.currentStage).toBe("PAYMENT_RECEIVED");
    expect(normalized.timeline).toHaveLength(11);
    expect(normalized.timeline[0]?.state).toBe("current");
  });

  it("handles REJECTED state with red-stage alignment at REVIEW", () => {
    const payload = {
      id: "cm2222222222222222222222222",
      status: "REJECTED",
      rejectionReason: "Images are low resolution.",
      timeline: [
        {
          status: "DESIGNED",
          state: "completed",
          reachedAt: "2026-03-02T11:00:00.000Z",
        },
        {
          status: "REJECTED",
          state: "current",
          reachedAt: "2026-03-03T12:00:00.000Z",
        },
      ],
    };

    const normalized = normalizeBookProgressPayload(payload);

    expect(normalized.isRejected).toBe(true);
    expect(normalized.currentStage).toBe("REVIEW");
    expect(normalized.rejectionReason).toBe("Images are low resolution.");
    expect(normalized.timeline.find((stage) => stage.stage === "REVIEW")?.state).toBe("rejected");
  });

  it("falls back to enabled rollout state when rollout metadata is absent", () => {
    const normalized = normalizeBookProgressPayload({
      id: "cm4444444444444444444444444",
      status: "AWAITING_UPLOAD",
      timeline: [],
    });

    expect(normalized.rollout.environment).toBe("unknown");
    expect(normalized.rollout.workspace.access).toBe("enabled");
    expect(normalized.rollout.blockedBy).toBeNull();
    expect(normalized.processing.isActive).toBe(false);
    expect(normalized.processing.currentStep).toBeNull();
  });
});

describe("mapBackendStatusToProgressStage", () => {
  it("locks normalization rules from backend statuses to the 11-step UI pipeline", () => {
    expect(mapBackendStatusToProgressStage("PAYMENT_RECEIVED")).toBe("PAYMENT_RECEIVED");
    expect(mapBackendStatusToProgressStage("AI_PROCESSING")).toBe("DESIGNING");
    expect(mapBackendStatusToProgressStage("FORMATTING_REVIEW")).toBe("REVIEW");
    expect(mapBackendStatusToProgressStage("PREVIEW_READY")).toBe("REVIEW");
    expect(mapBackendStatusToProgressStage("IN_PRODUCTION")).toBe("PRINTING");
    expect(mapBackendStatusToProgressStage("COMPLETED")).toBe("DELIVERED");
    expect(mapBackendStatusToProgressStage("REJECTED")).toBe("REVIEW");
  });

  it("returns null for unknown statuses so adapter fallback remains explicit", () => {
    expect(mapBackendStatusToProgressStage("NOT_A_REAL_STATUS")).toBeNull();
  });
});
