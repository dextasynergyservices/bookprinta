import { ApiProperty } from "@nestjs/swagger";

/**
 * Job counts for a single BullMQ queue.
 * A count of -1 means Redis was unavailable when the snapshot was taken.
 */
export class QueueCountsItemDto {
  @ApiProperty({
    description: "BullMQ queue name",
    example: "ai-formatting",
  })
  name!: string;

  @ApiProperty({
    description: "Jobs waiting to be picked up by a worker. -1 if Redis unavailable.",
    example: 3,
  })
  waiting!: number;

  @ApiProperty({
    description: "Jobs currently being processed. -1 if Redis unavailable.",
    example: 1,
  })
  active!: number;

  @ApiProperty({
    description: "Jobs that have failed all retry attempts. -1 if Redis unavailable.",
    example: 0,
  })
  failed!: number;

  @ApiProperty({
    description:
      "Recently completed jobs (BullMQ trims this list to the keepCompleted limit). " +
      "-1 if Redis unavailable.",
    example: 42,
  })
  completed!: number;

  @ApiProperty({
    description:
      "Jobs scheduled for future execution (delayed/retry backoff). -1 if Redis unavailable.",
    example: 0,
  })
  delayed!: number;

  @ApiProperty({
    description: "Jobs held in the paused state via queue.pause(). -1 if Redis unavailable.",
    example: 0,
  })
  paused!: number;
}

/**
 * Response for GET /admin/system/queue-stats.
 * Provides a point-in-time snapshot of BullMQ job counts across all queues.
 */
export class QueueStatsResponseDto {
  @ApiProperty({
    description: "Per-queue job count snapshots",
    type: [QueueCountsItemDto],
  })
  queues!: QueueCountsItemDto[];

  @ApiProperty({
    description: "ISO-8601 timestamp when the snapshot was taken",
    example: "2025-01-15T12:34:56.789Z",
  })
  timestamp!: string;

  @ApiProperty({
    description: "Whether Redis responded successfully. When false, all queue counts are -1.",
    example: true,
  })
  redisAvailable!: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Job detail DTOs — used by GET /admin/system/queue-jobs
// ──────────────────────────────────────────────────────────────────────

/**
 * Detail record for a single BullMQ job returned from the job-listing endpoint.
 */
export class QueueJobDetailItemDto {
  @ApiProperty({ description: "BullMQ job ID", example: "42" })
  id!: string;

  @ApiProperty({ description: "Job type / processor name", example: "ai-formatting" })
  name!: string;

  @ApiProperty({ description: "Number of processing attempts made so far", example: 3 })
  attemptsMade!: number;

  @ApiProperty({
    description: "Human-readable failure message. Null when the job has not failed.",
    example: "Gemini API returned 429 Too Many Requests",
    nullable: true,
  })
  failedReason!: string | null;

  @ApiProperty({
    description: "Stack-trace lines for the last failure (empty array when none).",
    type: [String],
    example: ["Error: Gemini API 429", "    at GeminiService.generate (/app/dist/engine.js:42)"],
  })
  stacktrace!: string[];

  @ApiProperty({
    description: "Unix ms timestamp when the job was added to the queue.",
    example: 1715000000000,
  })
  timestamp!: number;

  @ApiProperty({
    description:
      "Unix ms timestamp when a worker started processing the job. Null if not yet started.",
    example: 1715000010000,
    nullable: true,
  })
  processedOn!: number | null;

  @ApiProperty({
    description: "Unix ms timestamp when the job reached a terminal state. Null if still running.",
    example: 1715000020000,
    nullable: true,
  })
  finishedOn!: number | null;

  @ApiProperty({
    description: "Delay in milliseconds before the job becomes eligible to run.",
    example: 5000,
  })
  delay!: number;

  @ApiProperty({
    description: "Current job progress expressed as a string (may be a JSON-serialised object).",
    example: "75",
  })
  progress!: string;

  @ApiProperty({
    description:
      "JSON-serialised job payload. Large payloads are truncated to 5,000 characters. " +
      "Sensitive fields (passwords, tokens) are redacted automatically.",
    example: '{"userId":"clx1234","bookId":"cly5678"}',
  })
  data!: string;
}

/**
 * Paginated response for GET /admin/system/queue-jobs.
 */
export class QueueJobsResponseDto {
  @ApiProperty({
    description: "Job detail records for the requested page",
    type: [QueueJobDetailItemDto],
  })
  jobs!: QueueJobDetailItemDto[];

  @ApiProperty({
    description: "Total number of jobs in this queue + state combination",
    example: 47,
  })
  total!: number;

  @ApiProperty({ description: "Zero-based page index", example: 0 })
  page!: number;

  @ApiProperty({ description: "Maximum records per page (as requested)", example: 10 })
  limit!: number;
}
