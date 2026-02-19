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
    };
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
