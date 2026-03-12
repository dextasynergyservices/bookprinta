/**
 * BullMQ Queue Names
 *
 * Three queues for the book processing pipeline (CLAUDE.md Section 18.2):
 *  - AI_FORMATTING: Gemini 1.5 Flash — manuscript → semantic HTML
 *  - PDF_GENERATION: Gotenberg — HTML → print-ready PDF
 *  - PAGE_COUNT: Gotenberg — HTML → authoritative page count for billing
 *  - PRODUCTION_DELAY: Scheduled backlog monitor for production delay events
 */
export const QUEUE_AI_FORMATTING = "ai-formatting";
export const QUEUE_PDF_GENERATION = "pdf-generation";
export const QUEUE_PAGE_COUNT = "page-count";
export const QUEUE_PRODUCTION_DELAY = "production-delay";
export const PRODUCTION_DELAY_JOB_SCHEDULER_ID = "production-delay-monitor";
export const PRODUCTION_DELAY_MONITOR_INTERVAL_MS = 15 * 60 * 1000;

/**
 * All queue names as an array — used to register queues in BullModule.
 */
export const ALL_QUEUES = [
  QUEUE_AI_FORMATTING,
  QUEUE_PDF_GENERATION,
  QUEUE_PAGE_COUNT,
  QUEUE_PRODUCTION_DELAY,
] as const;

/**
 * Job names within each queue.
 * Defined now for type safety — processors are implemented in Phase 5.
 */
export const JOB_NAMES = {
  /** Gemini AI formats manuscript into semantic HTML */
  FORMAT_MANUSCRIPT: "format-manuscript",
  /** Gotenberg generates print-ready PDF from formatted HTML */
  GENERATE_PDF: "generate-pdf",
  /** Gotenberg renders HTML to count authoritative pages for billing */
  COUNT_PAGES: "count-pages",
  /** Runs the production delay backlog monitor and event sync */
  CHECK_PRODUCTION_DELAY: "check-production-delay",
} as const;
