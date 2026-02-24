import { Logger } from "@nestjs/common";
import type { ScanProvider, ScanResult } from "../scanner.interface.js";

/**
 * VirusTotal scan provider — uses the VirusTotal v3 REST API.
 *
 * Used in PRODUCTION where running a ClamAV daemon is impractical.
 * Free tier: 4 requests/minute, 500 requests/day.
 *
 * Flow:
 *  1. POST file to /files → returns analysis ID
 *  2. GET /analyses/{id} → poll until status is "completed"
 *  3. Check stats.malicious count → if > 0, file is infected
 *
 * Docs: https://docs.virustotal.com/reference/files-scan
 */

const VT_BASE_URL = "https://www.virustotal.com/api/v3";

/** Maximum time to wait for VirusTotal analysis to complete */
const ANALYSIS_TIMEOUT_MS = 120_000; // 2 minutes

/** Interval between polling attempts */
const POLL_INTERVAL_MS = 5_000; // 5 seconds

export class VirusTotalProvider implements ScanProvider {
  readonly name = "virustotal";
  private readonly logger = new Logger(VirusTotalProvider.name);
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async scanBuffer(buffer: Buffer, fileName: string): Promise<ScanResult> {
    this.logger.debug(`Scanning "${fileName}" (${buffer.length} bytes) via VirusTotal`);

    // Step 1: Upload file to VirusTotal
    const analysisId = await this.uploadFile(buffer, fileName);

    // Step 2: Poll for analysis result
    return this.pollAnalysis(analysisId, fileName);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple API key validation — fetch user quotas
      const response = await fetch(`${VT_BASE_URL}/users/me`, {
        headers: { "x-apikey": this.apiKey },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private async uploadFile(buffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append("file", blob, fileName);

    const response = await fetch(`${VT_BASE_URL}/files`, {
      method: "POST",
      headers: { "x-apikey": this.apiKey },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`VirusTotal upload failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { data: { id: string } };
    const analysisId = json.data.id;
    this.logger.debug(`VirusTotal analysis started: ${analysisId}`);

    return analysisId;
  }

  private async pollAnalysis(analysisId: string, fileName: string): Promise<ScanResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < ANALYSIS_TIMEOUT_MS) {
      const response = await fetch(`${VT_BASE_URL}/analyses/${analysisId}`, {
        headers: { "x-apikey": this.apiKey },
      });

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

      // Not yet complete — wait before polling again
      await this.sleep(POLL_INTERVAL_MS);
    }

    // Timed out waiting for analysis
    throw new Error(
      `VirusTotal analysis timed out after ${ANALYSIS_TIMEOUT_MS / 1000}s for "${fileName}"`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
