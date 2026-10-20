/// <reference types="jest" />
/**
 * Guards the relationship between the size limit we *enforce* and the one we
 * hand to Multer.
 *
 * Multer (busboy) aborts with LIMIT_FILE_SIZE once a file *reaches*
 * `limits.fileSize`, so that value is the first rejected size — not the last
 * accepted one. Every other layer uses an inclusive bound: `isWithinSizeLimit`
 * is `<= MAX_FILE_SIZE_BYTES`, the controllers reject on
 * `file.size > MAX_FILE_SIZE_BYTES`, and the web client validates with `>`.
 *
 * Passing MAX_FILE_SIZE_BYTES directly to Multer therefore rejected a file of
 * exactly 10,485,760 bytes with 413 "File too large" while the UI advertised a
 * 10MB maximum. Confirmed against a running server by probing the boundary:
 * 10,485,759 -> 404 (accepted, failed later), 10,485,760 -> 413.
 *
 * If someone "simplifies" the Multer configs back to MAX_FILE_SIZE_BYTES, these
 * tests fail instead of the regression shipping silently — the bug is invisible
 * unless you upload a file of exactly the limit.
 */
import { v2 as cloudinary } from "cloudinary";
import {
  CloudinaryService,
  MAX_FILE_SIZE_BYTES,
  MULTER_FILE_SIZE_LIMIT_BYTES,
} from "./cloudinary.service.js";

describe("file size limits", () => {
  it("enforces exactly 10 MiB as the documented maximum", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_FILE_SIZE_BYTES).toBe(10_485_760);
  });

  it("gives Multer one byte more, because its limit is the first rejected size", () => {
    expect(MULTER_FILE_SIZE_LIMIT_BYTES).toBe(MAX_FILE_SIZE_BYTES + 1);
  });

  describe("isWithinSizeLimit — the authoritative, inclusive bound", () => {
    let service: CloudinaryService;
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = {
        ...originalEnv,
        CLOUDINARY_CLOUD_NAME: "test-cloud",
        CLOUDINARY_API_KEY: "test-key",
        CLOUDINARY_API_SECRET: "test-secret",
      };
      service = new CloudinaryService(cloudinary.config());
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("accepts a file of exactly the limit", () => {
      expect(service.isWithinSizeLimit(MAX_FILE_SIZE_BYTES)).toBe(true);
    });

    it("rejects one byte over the limit", () => {
      expect(service.isWithinSizeLimit(MAX_FILE_SIZE_BYTES + 1)).toBe(false);
    });

    it("rejects empty files", () => {
      expect(service.isWithinSizeLimit(0)).toBe(false);
    });

    it("agrees with the Multer limit at the boundary", () => {
      // A file Multer lets through must also satisfy the enforced bound, or the
      // two layers disagree in the other direction and oversized files slip in.
      expect(service.isWithinSizeLimit(MULTER_FILE_SIZE_LIMIT_BYTES - 1)).toBe(true);
      expect(service.isWithinSizeLimit(MULTER_FILE_SIZE_LIMIT_BYTES)).toBe(false);
    });
  });
});
