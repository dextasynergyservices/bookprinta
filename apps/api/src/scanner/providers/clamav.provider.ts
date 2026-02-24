import * as net from "node:net";
import { Logger } from "@nestjs/common";
import type { ScanProvider, ScanResult } from "../scanner.interface.js";

/**
 * ClamAV scan provider — connects to the clamd daemon over TCP.
 *
 * Used for LOCAL DEVELOPMENT with the Docker ClamAV container.
 * Protocol reference: https://docs.clamav.net/manual/Usage/Scanning.html#clamd
 *
 * Commands used:
 *  - PING       → expects PONG (health check)
 *  - INSTREAM   → streams file bytes, expects "OK" or virus name
 */
export class ClamavProvider implements ScanProvider {
  readonly name = "clamav";
  private readonly logger = new Logger(ClamavProvider.name);
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(host: string, port: number, timeoutMs = 30_000) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  async scanBuffer(buffer: Buffer, fileName: string): Promise<ScanResult> {
    this.logger.debug(`Scanning "${fileName}" (${buffer.length} bytes) via ClamAV`);

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let response = "";

      socket.setTimeout(this.timeoutMs);

      socket.on("connect", () => {
        // Send INSTREAM command (tells clamd we'll stream data)
        socket.write("zINSTREAM\0");

        // ClamAV INSTREAM protocol: send chunks as [4-byte big-endian length][data]
        // Final chunk: [0x00000000] (zero-length) signals end of stream
        const chunkSize = 8192;
        for (let i = 0; i < buffer.length; i += chunkSize) {
          const chunk = buffer.subarray(i, i + chunkSize);
          const lengthHeader = Buffer.alloc(4);
          lengthHeader.writeUInt32BE(chunk.length, 0);
          socket.write(lengthHeader);
          socket.write(chunk);
        }

        // Signal end of stream
        const endHeader = Buffer.alloc(4);
        endHeader.writeUInt32BE(0, 0);
        socket.write(endHeader);
      });

      socket.on("data", (data) => {
        response += data.toString();
      });

      socket.on("end", () => {
        const trimmed = response.trim();
        // ClamAV response format: "stream: OK" or "stream: VirusName FOUND"
        if (trimmed.endsWith("OK")) {
          this.logger.debug(`ClamAV: "${fileName}" is clean`);
          resolve({ clean: true });
        } else {
          // Extract virus name from "stream: VirusName FOUND"
          const match = trimmed.match(/stream:\s*(.+)\s+FOUND/);
          const virusName = match?.[1] ?? "Unknown threat";
          this.logger.warn(`ClamAV: "${fileName}" is INFECTED — ${virusName}`);
          resolve({ clean: false, reason: virusName });
        }
      });

      socket.on("timeout", () => {
        socket.destroy();
        this.logger.error("ClamAV scan timed out");
        reject(new Error("ClamAV scan timed out"));
      });

      socket.on("error", (err) => {
        this.logger.error(`ClamAV connection error: ${err.message}`);
        reject(new Error(`ClamAV connection error: ${err.message}`));
      });

      socket.connect(this.port, this.host);
    });
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5_000);

      socket.on("connect", () => {
        socket.write("zPING\0");
      });

      socket.on("data", (data) => {
        const response = data.toString().trim();
        socket.destroy();
        resolve(response === "PONG");
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(this.port, this.host);
    });
  }
}
