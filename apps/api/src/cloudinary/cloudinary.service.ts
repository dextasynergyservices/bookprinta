import { Inject, Injectable, Logger } from "@nestjs/common";
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { CLOUDINARY } from "./cloudinary.constants.js";

/**
 * Allowed MIME types for BookPrinta uploads.
 * Matches the security checklist in CLAUDE.md:
 *  - application/pdf
 *  - application/vnd.openxmlformats-officedocument.wordprocessingml.document (DOCX)
 *  - image/jpeg
 *  - image/png
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
] as const;

/** 10 MB in bytes — hard server-side limit per CLAUDE.md */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * File-size limit to hand Multer, which is NOT the same number as the limit we
 * actually enforce.
 *
 * Multer (busboy) treats `limits.fileSize` as the first *disallowed* size: it
 * aborts with LIMIT_FILE_SIZE once a file reaches that many bytes. Everywhere
 * else in the codebase the bound is inclusive — `isWithinSizeLimit()` uses
 * `<= MAX_FILE_SIZE_BYTES`, the controllers reject on
 * `file.size > MAX_FILE_SIZE_BYTES`, and the frontend validates with `>` too.
 *
 * Passing MAX_FILE_SIZE_BYTES straight to Multer therefore rejected a file of
 * exactly 10,485,760 bytes with "File too large", even though every other layer
 * (and the user-facing "max 10MB" copy) says 10MB is allowed. Verified by
 * probing the boundary: 10,485,759 passed, 10,485,760 returned 413.
 *
 * So Multer gets limit + 1, which makes exactly 10MB pass and 10MB + 1 byte the
 * first rejected size. The explicit `> MAX_FILE_SIZE_BYTES` checks stay as
 * defence-in-depth — they simply never fire now, since Multer caps first.
 */
export const MULTER_FILE_SIZE_LIMIT_BYTES = MAX_FILE_SIZE_BYTES + 1;

/**
 * Maps MIME types to Cloudinary resource_type values.
 * PDFs and DOCX are stored as "raw"; images as "image".
 */
function getResourceType(mimeType: string): "image" | "raw" {
  if (mimeType.startsWith("image/")) return "image";
  return "raw";
}

/**
 * Signature parameters returned to the frontend.
 * The frontend uses these to POST directly to Cloudinary's upload endpoint.
 */
export interface CloudinarySignatureResponse {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  eager?: string;
  resourceType: "image" | "raw";
  tags?: string[];
}

/**
 * Options for requesting a signed upload signature.
 */
export interface SignatureOptions {
  /** Cloudinary folder path, e.g. "bookprinta/manuscripts" */
  folder: string;
  /** MIME type of the file being uploaded — determines resource_type */
  mimeType: string;
  /** Optional eager transformations (e.g. image thumbnails) */
  eager?: string;
  /** Optional Cloudinary public_id override */
  publicId?: string;
  /** Optional tags for Cloudinary asset management */
  tags?: string[];
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  /**
   * The CLOUDINARY injection ensures the SDK is configured
   * before any method is called. We still reference the v2 API
   * directly because Cloudinary's Node SDK is a singleton module.
   */
  constructor(@Inject(CLOUDINARY) readonly _config: ReturnType<typeof cloudinary.config>) {}

  // ──────────────────────────────────────────────
  // Signature Generation (for signed client uploads)
  // ──────────────────────────────────────────────

  /**
   * Generates a signed upload signature that the frontend uses to upload
   * files directly to Cloudinary. This ensures:
   *  - Only the backend can authorise uploads (security)
   *  - The frontend uploads directly to Cloudinary (performance)
   *  - Server never proxies file bytes (bandwidth savings)
   *
   * The frontend must POST to:
   *   https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/upload
   *
   * With form-data including: file, signature, timestamp, api_key,
   * folder, and any other params that were signed.
   */
  generateSignature(options: SignatureOptions): CloudinarySignatureResponse {
    const { folder, mimeType, eager, publicId, tags } = options;
    const timestamp = Math.round(Date.now() / 1000);
    const resourceType = getResourceType(mimeType);

    // Build the params object that will be signed.
    // IMPORTANT: Only params included here will be accepted by Cloudinary.
    // Any additional param sent by the frontend that wasn't signed will be rejected.
    const paramsToSign: Record<string, string | number | undefined> = {
      timestamp,
      folder,
      ...(eager && { eager }),
      ...(publicId && { public_id: publicId }),
      ...(tags && tags.length > 0 && { tags: tags.join(",") }),
    };

    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      throw new Error("CLOUDINARY_API_SECRET is not set");
    }

    // cloudinary.utils.api_sign_request signs the params with the API secret.
    // This is the official way to generate upload signatures.
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    this.logger.debug(
      `Generated upload signature for folder="${folder}" resourceType="${resourceType}"`
    );

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    if (!cloudName || !apiKey) {
      throw new Error("CLOUDINARY_CLOUD_NAME or CLOUDINARY_API_KEY is not set");
    }

    return {
      signature,
      timestamp,
      cloudName,
      apiKey,
      folder,
      ...(eager && { eager }),
      resourceType,
      ...(tags && tags.length > 0 ? { tags } : {}),
    };
  }

  // ──────────────────────────────────────────────
  // Signed Download / Delivery URL Generation
  // ──────────────────────────────────────────────

  /**
   * Generates a time-limited signed delivery URL directly from Cloudinary.
   *
   * Parses the Cloudinary public_id, resource_type, and delivery type from an
   * existing stored Cloudinary URL. Validates that the cloud name matches our
   * configured CLOUDINARY_CLOUD_NAME.
   *
   * Returns null if:
   *  - The URL is null, empty, or not a Cloudinary URL
   *  - The URL does not belong to our configured cloud name
   *  - The URL cannot be parsed safely
   *
   * Returning null allows the caller to safely fall back to the existing server-proxied
   * streaming endpoint with zero downtime or breakage.
   */
  createSignedDownloadUrl(
    storedUrl: string | null | undefined,
    options: {
      expiresInSeconds?: number;
      attachment?: boolean;
    } = {}
  ): { url: string; expiresAt: string } | null {
    if (!storedUrl || typeof storedUrl !== "string") {
      return null;
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiSecret) {
      return null;
    }

    try {
      const parsed = new URL(storedUrl);
      if (!parsed.hostname.endsWith("cloudinary.com")) {
        return null;
      }

      // Expected path format: /<cloud_name>/<resource_type>/<type>/[v<version>/]<public_id>
      // Example: /bookprinta-cloud/raw/upload/v12345/bookprinta/preview-pdfs/cm.../job1
      const pathSegments = parsed.pathname.split("/").filter(Boolean);
      if (pathSegments.length < 4) {
        return null;
      }

      const [urlCloudName, resourceTypeRaw, deliveryTypeRaw, ...rest] = pathSegments;
      if (urlCloudName !== cloudName) {
        return null;
      }

      if (resourceTypeRaw !== "raw" && resourceTypeRaw !== "image" && resourceTypeRaw !== "video") {
        return null;
      }

      if (
        deliveryTypeRaw !== "upload" &&
        deliveryTypeRaw !== "authenticated" &&
        deliveryTypeRaw !== "private"
      ) {
        return null;
      }

      // If the first remaining segment starts with 'v' and is numeric (e.g. v1791456770), skip it
      if (rest.length > 0 && /^v\d+$/.test(rest[0])) {
        rest.shift();
      }

      if (rest.length === 0) {
        return null;
      }

      const publicIdWithFormat = decodeURIComponent(rest.join("/"));

      const expiresInSeconds = options.expiresInSeconds ?? 600; // 10 minutes default
      const now = Math.floor(Date.now() / 1000);
      const expiresAtTimestamp = now + expiresInSeconds;

      // Extract format if present, or pass empty string
      const dotIndex = publicIdWithFormat.lastIndexOf(".");
      const hasExtension = dotIndex > 0 && dotIndex < publicIdWithFormat.length - 1;
      const format = hasExtension ? publicIdWithFormat.slice(dotIndex + 1) : "";
      const publicId = hasExtension ? publicIdWithFormat.slice(0, dotIndex) : publicIdWithFormat;

      const signedUrl = cloudinary.utils.private_download_url(publicId, format, {
        resource_type: resourceTypeRaw,
        type: deliveryTypeRaw,
        expires_at: expiresAtTimestamp,
        attachment: Boolean(options.attachment),
      });

      return {
        url: signedUrl,
        expiresAt: new Date(expiresAtTimestamp * 1000).toISOString(),
      };
    } catch (err) {
      this.logger.warn(`Could not parse or sign Cloudinary URL "${storedUrl}": ${err}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // Server-side Upload (for internal use — AI output, admin uploads)
  // ──────────────────────────────────────────────

  /**
   * Uploads a file to Cloudinary from the server side.
   * Used for:
   *  - Storing AI-formatted HTML (CLEANED_HTML)
   *  - Admin uploading formatted HTML as fallback
   *  - Storing generated PDFs from Gotenberg
   */
  async upload(fileInput: string | Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadCallback = (error: unknown, result?: UploadApiResponse) => {
        if (error || !result) {
          this.logger.error("Cloudinary upload failed", error);
          reject(error || new Error("Upload returned no result"));
          return;
        }
        this.logger.log(`Uploaded to Cloudinary: ${result.public_id} (${result.bytes} bytes)`);
        resolve(result);
      };

      if (Buffer.isBuffer(fileInput)) {
        // Upload from buffer via upload_stream
        const stream = cloudinary.uploader.upload_stream(options, uploadCallback);
        stream.end(fileInput);
      } else {
        // Upload from file path or URL
        cloudinary.uploader.upload(fileInput, options, uploadCallback);
      }
    });
  }

  // ──────────────────────────────────────────────
  // Delete (cleanup old versions, rejected files)
  // ──────────────────────────────────────────────

  /**
   * Deletes a resource from Cloudinary by public ID.
   */
  async delete(
    publicId: string,
    resourceType: "image" | "raw" | "video" = "raw"
  ): Promise<{ result: string }> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      this.logger.log(`Deleted from Cloudinary: ${publicId} → ${result.result}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete ${publicId} from Cloudinary`, error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────
  // Validation Helpers
  // ──────────────────────────────────────────────

  /**
   * Validates that a MIME type is in the allowed list.
   * Server-side validation — never trust the client Content-Type header.
   */
  isAllowedMimeType(mimeType: string): boolean {
    return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
  }

  /**
   * Validates that a file size is within the 10MB limit.
   */
  isWithinSizeLimit(sizeInBytes: number): boolean {
    return sizeInBytes > 0 && sizeInBytes <= MAX_FILE_SIZE_BYTES;
  }
}
