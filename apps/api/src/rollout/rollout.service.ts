import { Injectable, ServiceUnavailableException } from "@nestjs/common";

export type RolloutEnvironment = "development" | "test" | "staging" | "production" | "unknown";

export type RolloutAccess = "enabled" | "grandfathered" | "disabled";

export type RolloutBlockedFeature =
  | "workspace"
  | "manuscript_pipeline"
  | "billing_gate"
  | "final_pdf";

export type BookRolloutSubject = {
  status?: string | null;
  pageSize?: string | null;
  fontSize?: number | null;
  wordCount?: number | null;
  estimatedPages?: number | null;
  pageCount?: number | null;
  currentHtmlUrl?: string | null;
  previewPdfUrl?: string | null;
  finalPdfUrl?: string | null;
};

export type RolloutFeatureState = {
  enabled: boolean;
  access: RolloutAccess;
};

export type BookRolloutState = {
  environment: RolloutEnvironment;
  allowInFlightAccess: boolean;
  isGrandfathered: boolean;
  blockedBy: RolloutBlockedFeature | null;
  workspace: RolloutFeatureState;
  manuscriptPipeline: RolloutFeatureState;
  billingGate: RolloutFeatureState;
  finalPdf: RolloutFeatureState;
};

export type RolloutMonitoringSnapshot = {
  environment: RolloutEnvironment;
  allowInFlightAccess: boolean;
  features: {
    bookWorkspace: boolean;
    manuscriptPipeline: boolean;
    billingGate: boolean;
    finalPdf: boolean;
  };
};

type RuntimeFlags = RolloutMonitoringSnapshot["features"] & {
  allowInFlightAccess: boolean;
};

@Injectable()
export class RolloutService {
  private static readonly IN_FLIGHT_BOOK_STATUSES = new Set([
    "UPLOADED",
    "PAYMENT_RECEIVED",
    "AI_PROCESSING",
    "DESIGNING",
    "DESIGNED",
    "FORMATTING",
    "FORMATTED",
    "FORMATTING_REVIEW",
    "PREVIEW_READY",
    "REVIEW",
    "REJECTED",
    "APPROVED",
    "IN_PRODUCTION",
    "PRINTING",
    "PRINTED",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
  ]);

  getRuntimeFlags(): RuntimeFlags {
    const environment = this.getEnvironment();
    const defaultEnabled = environment !== "production";

    return {
      bookWorkspace: this.readBooleanFlag("FEATURE_BOOK_WORKSPACE", defaultEnabled),
      manuscriptPipeline: this.readBooleanFlag("FEATURE_MANUSCRIPT_PIPELINE", defaultEnabled),
      billingGate: this.readBooleanFlag("FEATURE_BILLING_GATE", defaultEnabled),
      finalPdf: this.readBooleanFlag("FEATURE_FINAL_PDF", defaultEnabled),
      allowInFlightAccess: this.readBooleanFlag("FEATURE_MANUSCRIPT_ALLOW_IN_FLIGHT", true),
    };
  }

  getEnvironment(): RolloutEnvironment {
    const rawValue =
      process.env.APP_ENV ??
      process.env.VERCEL_ENV ??
      process.env.RENDER_ENV ??
      process.env.NODE_ENV ??
      "";
    const normalized = rawValue.trim().toLowerCase();

    if (normalized === "production" || normalized === "prod") return "production";
    if (normalized === "staging" || normalized === "stage" || normalized === "preview") {
      return "staging";
    }
    if (normalized === "test") return "test";
    if (normalized === "development" || normalized === "dev" || normalized === "local") {
      return "development";
    }

    return "unknown";
  }

  getMonitoringSnapshot(): RolloutMonitoringSnapshot {
    const flags = this.getRuntimeFlags();

    return {
      environment: this.getEnvironment(),
      allowInFlightAccess: flags.allowInFlightAccess,
      features: {
        bookWorkspace: flags.bookWorkspace,
        manuscriptPipeline: flags.manuscriptPipeline,
        billingGate: flags.billingGate,
        finalPdf: flags.finalPdf,
      },
    };
  }

  resolveBookRolloutState(subject: BookRolloutSubject): BookRolloutState {
    const flags = this.getRuntimeFlags();
    const isInFlight = this.isBookInFlight(subject);
    const workspace = this.resolveFeatureState(flags.bookWorkspace, isInFlight);
    const manuscriptPipeline = this.resolveFeatureState(flags.manuscriptPipeline, isInFlight);
    const billingGate = this.resolveFeatureState(flags.billingGate, isInFlight);
    const finalPdf = this.resolveFeatureState(flags.finalPdf, isInFlight);
    const blockedBy =
      workspace.access === "disabled"
        ? "workspace"
        : manuscriptPipeline.access === "disabled"
          ? "manuscript_pipeline"
          : billingGate.access === "disabled"
            ? "billing_gate"
            : finalPdf.access === "disabled"
              ? "final_pdf"
              : null;

    return {
      environment: this.getEnvironment(),
      allowInFlightAccess: flags.allowInFlightAccess,
      isGrandfathered:
        workspace.access === "grandfathered" ||
        manuscriptPipeline.access === "grandfathered" ||
        billingGate.access === "grandfathered" ||
        finalPdf.access === "grandfathered",
      blockedBy,
      workspace,
      manuscriptPipeline,
      billingGate,
      finalPdf,
    };
  }

  assertBookWorkspaceAccess(subject: BookRolloutSubject): void {
    const state = this.resolveBookRolloutState(subject);
    this.assertFeatureAccess(
      state.workspace.access,
      "Automated manuscript workspace is not enabled in this environment yet."
    );
  }

  assertManuscriptPipelineAccess(subject: BookRolloutSubject): void {
    const state = this.resolveBookRolloutState(subject);
    this.assertFeatureAccess(
      state.manuscriptPipeline.access,
      "Automated manuscript processing is not enabled in this environment yet."
    );
  }

  assertBillingGateAccess(subject: BookRolloutSubject): void {
    const state = this.resolveBookRolloutState(subject);
    this.assertFeatureAccess(
      state.billingGate.access,
      "Automated extra-page billing is not enabled in this environment yet."
    );
  }

  assertFinalPdfAccess(subject: BookRolloutSubject): void {
    const state = this.resolveBookRolloutState(subject);
    this.assertFeatureAccess(
      state.finalPdf.access,
      "Automated final PDF generation is not enabled in this environment yet."
    );
  }

  private assertFeatureAccess(access: RolloutAccess, message: string): void {
    if (access === "disabled") {
      throw new ServiceUnavailableException(message);
    }
  }

  private resolveFeatureState(enabled: boolean, isInFlight: boolean): RolloutFeatureState {
    if (enabled) {
      return { enabled: true, access: "enabled" };
    }

    const allowInFlightAccess = this.getRuntimeFlags().allowInFlightAccess;
    if (allowInFlightAccess && isInFlight) {
      return { enabled: false, access: "grandfathered" };
    }

    return { enabled: false, access: "disabled" };
  }

  private isBookInFlight(subject: BookRolloutSubject): boolean {
    const normalizedStatus = this.normalizeStatus(subject.status);
    if (normalizedStatus && RolloutService.IN_FLIGHT_BOOK_STATUSES.has(normalizedStatus)) {
      return true;
    }

    if (typeof subject.wordCount === "number" && Number.isFinite(subject.wordCount)) return true;
    if (typeof subject.estimatedPages === "number" && Number.isFinite(subject.estimatedPages)) {
      return true;
    }
    if (typeof subject.pageCount === "number" && Number.isFinite(subject.pageCount)) return true;
    if (this.hasValue(subject.currentHtmlUrl)) return true;
    if (this.hasValue(subject.previewPdfUrl)) return true;
    if (this.hasValue(subject.finalPdfUrl)) return true;

    return this.hasValue(subject.pageSize) && typeof subject.fontSize === "number";
  }

  private normalizeStatus(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized.toUpperCase() : null;
  }

  private hasValue(value: string | null | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  private readBooleanFlag(name: string, fallback: boolean): boolean {
    const rawValue = process.env[name];
    if (typeof rawValue !== "string") return fallback;

    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;

    return fallback;
  }
}
