import { Logger } from "@nestjs/common";
import type { ScanProvider, ScanResult } from "../scanner.interface.js";

/**
 * VirusTotal scan provider — uses the VirusTotal v3 REST API.
 *
 * Used in PRODUCTION where running a ClamAV daemon is impractical.
 *
 * Flow:
 *  1. POST file to /files → returns analysis ID
 *  2. GET /analyses/{id} → poll until status is "completed"
 *  3. Check stats.malicious count → if > 0, file is infected
 *
 * ─── Quota discipline ──────────────────────────────────────────────────────
 *
 * The free (public) API allows 4 requests/minute and 500/day. The previous
 * implementation polled every 5s and ran an availability probe before every
 * scan, so a single upload could exhaust the minute and two concurrent uploads
 * reliably failed with 429. Now:
 *  - every VirusTotal call goes through one pacer (VIRUSTOTAL_REQUESTS_PER_MINUTE,
 *    default 4) shared by the whole process;
 *  - scans run one at a time, so uploads queue instead of competing;
 *  - 429s wait (Retry-After, else 60s) and retry inside the overall deadline;
 *  - the availability probe is cached for a minute.
 *
 * NOTE: the public API's terms do not permit commercial use, and files
 * submitted to it are shared with VirusTotal's partners. See the audit notes —
 * production should use VirusTotal Premium (private scanning) or a ClamAV
 * daemon reachable from the API.
 *
 * Docs: https://docs.virustotal.com/reference/files-scan
 */

const VT_BASE_URL = "https://www.virustotal.com/api/v3";

/** Overall deadline for one scan, including time spent queued behind others. */
const SCAN_DEADLINE_MS = 240_000;

/** Interval between analysis polls (each poll costs one request). */
const POLL_INTERVAL_MS = 15_000;

const AVAILABILITY_CACHE_MS = 60_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;

export class VirusTotalProvider implements ScanProvider {
  readonly name = "virustotal";
  private readonly logger = new Logger(VirusTotalProvider.name);
  private readonly apiKey: string;
  private readonly requestsPerMinute: number;

  /** Start times of requests in the last minute (sliding window). */
  private readonly requestLog: number[] = [];
  /** Serialises scans: each new scan chains onto the previous one. */
  private scanQueue: Promise<unknown> = Promise.resolve();
  private availability: { value: boolean; expiresAt: number } | null = null;

  constructor(apiKey: string, requestsPerMinute = resolveRequestsPerMinute()) {
    this.apiKey = apiKey;
    this.requestsPerMinute = requestsPerMinute;
  }

  scanBuffer(buffer: Buffer, fileName: string): Promise<ScanResult> {
    const deadline = Date.now() + SCAN_DEADLINE_MS;
    const run = async () => {
      this.logger.debug(`Scanning "${fileName}" (${buffer.length} bytes) via VirusTotal`);
      const analysisId = await this.uploadFile(buffer, fileName, deadline);
      return this.pollAnalysis(analysisId, fileName, deadline);
    };
    const result = this.scanQueue.then(run, run);
    // Keep the chain alive regardless of this scan's outcome.
    this.scanQueue = result.catch(() => undefined);
    return result;
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.availability && this.availability.expiresAt > now) return this.availability.value;

    let value = false;
    try {
      const response = await this.request(`${VT_BASE_URL}/users/me`, {}, now + 30_000);
      value = response.ok;
    } catch {
      value = false;
    }
    this.availability = { value, expiresAt: Date.now() + AVAILABILITY_CACHE_MS };
    return value;
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private async uploadFile(buffer: Buffer, fileName: string, deadline: number): Promise<string> {
    const response = await this.request(
      `${VT_BASE_URL}/files`,
      {
        method: "POST",
        body: () => {
          const formData = new FormData();
          formData.append("file", new Blob([new Uint8Array(buffer)]), fileName);
          return formData;
        },
      },
      deadline
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`VirusTotal upload failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { data: { id: string } };
    this.logger.debug(`VirusTotal analysis started: ${json.data.id}`);
    return json.data.id;
  }

  private async pollAnalysis(
    analysisId: string,
    fileName: string,
    deadline: number
  ): Promise<ScanResult> {
    while (Date.now() < deadline) {
      const response = await this.request(`${VT_BASE_URL}/analyses/${analysisId}`, {}, deadline);

      if (!response.ok) {
        throw new Error(`VirusTotal analysis fetch failed (${response.status})`);
      }

      const json = (await response.json()) as {
        data: {
          attributes: {
            status: string;
            stats: { malicious: number; suspicious: number };
          };
        };
      };

      const { status, stats } = json.data.attributes;

      if (status === "completed") {
        const threats = stats.malicious + stats.suspicious;

        if (threats > 0) {
          this.logger.warn(
            `VirusTotal: "${fileName}" flagged by ${threats} engine(s) (${stats.malicious} malicious, ${stats.suspicious} suspicious)`
          );
          return {
            clean: false,
            reason: `Flagged by ${threats} antivirus engine(s)`,
          };
        }

        this.logger.debug(`VirusTotal: "${fileName}" is clean`);
        return { clean: true };
      }

      await this.sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    }

    throw new Error(
      `VirusTotal analysis timed out after ${SCAN_DEADLINE_MS / 1000}s for "${fileName}"`
    );
  }

  /**
   * One paced VirusTotal request. Waits for a slot in the per-minute budget,
   * and on 429 waits (Retry-After, else 60s) and retries — never past `deadline`.
   */
  private async request(
    url: string,
    init: { method?: string; body?: () => FormData },
    deadline: number
  ): Promise<Response> {
    for (;;) {
      await this.acquireSlot(deadline);
      const response = await fetch(url, {
        method: init.method ?? "GET",
        headers: { "x-apikey": this.apiKey },
        body: init.body?.(),
      });

      if (response.status !== 429) return response;

      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : DEFAULT_RATE_LIMIT_WAIT_MS;
      if (Date.now() + waitMs > deadline) {
        throw new Error("VirusTotal rate limit: no capacity before the scan deadline");
      }
      this.logger.warn(`VirusTotal rate-limited (429); retrying in ${Math.round(waitMs / 1000)}s`);
      await this.sleep(waitMs);
    }
  }

  private async acquireSlot(deadline: number): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.requestLog.length > 0 && now - (this.requestLog[0] ?? 0) >= 60_000) {
        this.requestLog.shift();
      }
      if (this.requestLog.length < this.requestsPerMinute) {
        this.requestLog.push(now);
        return;
      }
      const waitMs = 60_000 - (now - (this.requestLog[0] ?? now)) + 50;
      if (now + waitMs > deadline) {
        throw new Error("VirusTotal request budget exhausted before the scan deadline");
      }
      await this.sleep(waitMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function resolveRequestsPerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.VIRUSTOTAL_REQUESTS_PER_MINUTE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}
