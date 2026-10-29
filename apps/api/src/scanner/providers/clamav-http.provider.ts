import { Logger } from "@nestjs/common";
import type { ScanProvider, ScanResult } from "../scanner.interface.js";

/**
 * Remote ClamAV over HTTPS — the BookPrinta scan gateway (infra/scanner).
 *
 * Production scanner. ClamAV needs ~1.2 GB RAM for its signature database, so
 * it cannot share Render's 512 MB instance; it runs on its own VM behind a
 * token-protected HTTPS gateway. Files go only to our own server — unlike the
 * public VirusTotal API, which shares submissions with third parties.
 *
 * Contract (see infra/scanner/gateway/server.mjs):
 *   POST {url}/scan   raw bytes → { clean: true } | { clean: false, signature }
 *   GET  {url}/health           → 200 when clamd answers
 * Any non-200 means the file was NOT scanned → we throw, and the upload is
 * blocked (CLAUDE.md constraint #6: never accept unscanned files).
 */

const SCAN_TIMEOUT_MS = 90_000;
const HEALTH_TIMEOUT_MS = 10_000;
const AVAILABILITY_CACHE_MS = 30_000;

export class ClamavHttpProvider implements ScanProvider {
  readonly name = "clamav-http";
  private readonly logger = new Logger(ClamavHttpProvider.name);
  private readonly baseUrl: string;
  private availability: { value: boolean; expiresAt: number } | null = null;

  constructor(
    url: string,
    private readonly token: string
  ) {
    this.baseUrl = url.trim().replace(/\/+$/, "");
  }

  async scanBuffer(buffer: Buffer, fileName: string): Promise<ScanResult> {
    const response = await this.request("/scan", {
      method: "POST",
      body: new Blob([new Uint8Array(buffer)]),
      timeoutMs: SCAN_TIMEOUT_MS,
      headers: { "content-type": "application/octet-stream" },
    });

    const payload = (await response.json().catch(() => null)) as {
      clean?: unknown;
      signature?: unknown;
      error?: unknown;
    } | null;

    if (!response.ok || typeof payload?.clean !== "boolean") {
      // Invalidate so the next upload re-probes instead of trusting a stale "up".
      this.availability = null;
      throw new Error(
        `Scan gateway failed for "${fileName}" (${response.status}): ${String(payload?.error ?? "invalid response")}`
      );
    }

    if (payload.clean) return { clean: true };

    const signature = typeof payload.signature === "string" ? payload.signature : "Unknown threat";
    this.logger.warn(`ClamAV (remote): "${fileName}" is INFECTED — ${signature}`);
    return { clean: false, reason: signature };
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.availability && this.availability.expiresAt > now) return this.availability.value;

    let value = false;
    try {
      const response = await this.request("/health", {
        method: "GET",
        timeoutMs: HEALTH_TIMEOUT_MS,
      });
      value = response.ok;
    } catch {
      value = false;
    }
    this.availability = { value, expiresAt: Date.now() + AVAILABILITY_CACHE_MS };
    return value;
  }

  private async request(
    path: string,
    init: { method: string; body?: Blob; timeoutMs: number; headers?: Record<string, string> }
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), init.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        body: init.body,
        headers: { authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
