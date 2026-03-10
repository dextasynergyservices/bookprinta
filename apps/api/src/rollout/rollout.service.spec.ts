/// <reference types="jest" />
import { ServiceUnavailableException } from "@nestjs/common";
import { RolloutService } from "./rollout.service.js";

describe("RolloutService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.RENDER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.FEATURE_BOOK_WORKSPACE;
    delete process.env.FEATURE_MANUSCRIPT_PIPELINE;
    delete process.env.FEATURE_BILLING_GATE;
    delete process.env.FEATURE_FINAL_PDF;
    delete process.env.FEATURE_MANUSCRIPT_ALLOW_IN_FLIGHT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("enables manuscript features by default outside production", () => {
    process.env.NODE_ENV = "development";
    const service = new RolloutService();

    expect(service.getEnvironment()).toBe("development");
    expect(service.getMonitoringSnapshot()).toEqual({
      environment: "development",
      allowInFlightAccess: true,
      features: {
        bookWorkspace: true,
        manuscriptPipeline: true,
        billingGate: true,
        finalPdf: true,
      },
    });
  });

  it("disables manuscript features by default in production until explicitly enabled", () => {
    process.env.APP_ENV = "production";
    const service = new RolloutService();

    expect(service.getEnvironment()).toBe("production");
    expect(service.getMonitoringSnapshot().features).toEqual({
      bookWorkspace: false,
      manuscriptPipeline: false,
      billingGate: false,
      finalPdf: false,
    });
  });

  it("grandfathers in-flight books when rollout is disabled", () => {
    process.env.APP_ENV = "production";
    process.env.FEATURE_MANUSCRIPT_PIPELINE = "false";
    const service = new RolloutService();

    const state = service.resolveBookRolloutState({
      status: "FORMATTING",
      pageSize: "A5",
      fontSize: 11,
      wordCount: 42_000,
    });

    expect(state.manuscriptPipeline.access).toBe("grandfathered");
    expect(state.isGrandfathered).toBe(true);
  });

  it("blocks new books when rollout is disabled and grandfathering is not allowed", () => {
    process.env.APP_ENV = "production";
    process.env.FEATURE_MANUSCRIPT_PIPELINE = "false";
    process.env.FEATURE_MANUSCRIPT_ALLOW_IN_FLIGHT = "false";
    const service = new RolloutService();

    expect(() =>
      service.assertManuscriptPipelineAccess({
        status: "AWAITING_UPLOAD",
        pageSize: null,
        fontSize: null,
      })
    ).toThrow(ServiceUnavailableException);
  });
});
