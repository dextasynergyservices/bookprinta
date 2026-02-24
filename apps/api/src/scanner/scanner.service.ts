import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ClamavProvider } from "./providers/clamav.provider.js";
import { VirusTotalProvider } from "./providers/virustotal.provider.js";
import type { ScanProvider, ScanResult } from "./scanner.interface.js";

/**
 * Scanner service — routes malware scans to the configured provider.
 *
 * Provider is selected via `SCANNER_PROVIDER` env var:
 *  - "clamav"     → ClamAV daemon (local dev via Docker)
 *  - "virustotal" → VirusTotal API (production)
 *
 * Per CLAUDE.md constraint #6: uploads MUST be blocked entirely
 * when the scanner is unreachable.
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private readonly provider: ScanProvider;

  constructor() {
    const providerName = process.env.SCANNER_PROVIDER ?? "clamav";

    if (providerName === "virustotal") {
      const apiKey = process.env.VIRUSTOTAL_API_KEY;
      if (!apiKey) {
        throw new Error("VIRUSTOTAL_API_KEY is required when SCANNER_PROVIDER=virustotal");
      }
      this.provider = new VirusTotalProvider(apiKey);
      this.logger.log("Scanner provider: VirusTotal API");
    } else {
      const host = process.env.CLAMAV_HOST ?? "localhost";
      const port = Number.parseInt(process.env.CLAMAV_PORT ?? "3310", 10);
      this.provider = new ClamavProvider(host, port);
      this.logger.log(`Scanner provider: ClamAV (${host}:${port})`);
    }
  }

  /**
   * Scans a file buffer for malware.
   * Throws ServiceUnavailableException if the scanner is unreachable
   * (per CLAUDE.md constraint #6 — never allow uploads without scanning).
   */
  async scanBuffer(buffer: Buffer, fileName: string): Promise<ScanResult> {
    // Check availability first — block uploads if scanner is down
    const available = await this.isAvailable();
    if (!available) {
      this.logger.error(`Scanner (${this.provider.name}) is unavailable — blocking upload`);
      throw new ServiceUnavailableException(
        "File scanning service is temporarily unavailable. Uploads are disabled until the scanner is back online."
      );
    }

    return this.provider.scanBuffer(buffer, fileName);
  }

  /**
   * Health check — is the scanning provider reachable?
   */
  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  /**
   * Returns the name of the active provider (for health check reporting).
   */
  getProviderName(): string {
    return this.provider.name;
  }
}
