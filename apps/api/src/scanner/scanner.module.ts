import { Global, Module } from "@nestjs/common";
import { ScannerService } from "./scanner.service.js";

/**
 * Global Scanner module — provides ScannerService across the app.
 * Any module can inject ScannerService without importing ScannerModule.
 *
 * The active scan provider (ClamAV or VirusTotal) is determined by
 * the SCANNER_PROVIDER environment variable at startup.
 */
@Global()
@Module({
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}
