/**
 * Result of a malware scan.
 */
export interface ScanResult {
  /** Whether the file is clean (no malware detected) */
  clean: boolean;
  /** Human-readable reason if the file is flagged (e.g. virus name) */
  reason?: string;
}

/**
 * Interface that all scan providers must implement.
 * Allows swapping between ClamAV (local dev) and VirusTotal (production)
 * without changing the consuming code.
 */
export interface ScanProvider {
  /** Unique name for logging, e.g. "clamav" or "virustotal" */
  readonly name: string;

  /**
   * Scans a file buffer for malware.
   * @param buffer - The raw file bytes
   * @param fileName - Original filename (used for logging / VirusTotal metadata)
   * @returns ScanResult indicating whether the file is clean
   */
  scanBuffer(buffer: Buffer, fileName: string): Promise<ScanResult>;

  /**
   * Checks whether the scan provider is reachable and operational.
   * Used by the health check endpoint.
   */
  isAvailable(): Promise<boolean>;
}
