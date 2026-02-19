import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ALLOWED_MIME_TYPES } from "../../cloudinary/cloudinary.service.js";

/**
 * Schema for requesting a signed upload signature.
 *
 * The frontend calls this BEFORE uploading to get:
 *   - A Cloudinary signature
 *   - The timestamp, cloud name, and API key
 *
 * Then the frontend POSTs the file directly to Cloudinary
 * with these signed params.
 */
export const GenerateSignatureSchema = z.object({
  /** Target folder in Cloudinary, e.g. "bookprinta/manuscripts" */
  folder: z
    .string()
    .min(1, "Folder is required")
    .max(200, "Folder path too long")
    .regex(
      /^[a-zA-Z0-9_\-/]+$/,
      "Folder must contain only alphanumeric characters, underscores, hyphens, and slashes"
    ),

  /** MIME type of the file to upload — must be in the allowed list */
  mimeType: z.enum(ALLOWED_MIME_TYPES as unknown as [string, ...string[]], {
    error: "Unsupported file type. Allowed: PDF, DOCX, JPEG, PNG",
  }),

  /** File size in bytes — validated against 10MB limit */
  fileSize: z
    .number()
    .int()
    .positive("File size must be positive")
    .max(10 * 1024 * 1024, "File exceeds 10MB limit"),

  /** Original filename for record-keeping */
  fileName: z.string().min(1).max(255).optional(),

  /** Optional eager transformations (e.g. "w_200,h_200,c_thumb" for profile images) */
  eager: z.string().max(500).optional(),

  /** Optional tags for Cloudinary asset management */
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export type GenerateSignatureInput = z.infer<typeof GenerateSignatureSchema>;

/**
 * Schema for confirming a successful upload.
 *
 * After the frontend uploads directly to Cloudinary, it calls this
 * endpoint so the backend can create a File record in the database.
 */
export const ConfirmUploadSchema = z.object({
  /** The book this file belongs to */
  bookId: z.string().cuid("Invalid book ID"),

  /** Cloudinary secure URL returned after upload */
  url: z.string().url("Invalid URL"),

  /** Cloudinary public ID — needed for deletion/management */
  publicId: z.string().min(1, "Public ID is required"),

  /** File type classification for the engine pipeline */
  fileType: z.enum([
    "RAW_MANUSCRIPT",
    "CLEANED_TEXT",
    "CLEANED_HTML",
    "FORMATTED_PDF",
    "PREVIEW_PDF",
    "FINAL_PDF",
    "ADMIN_GENERATED_DOCX",
    "COVER_DESIGN_DRAFT",
    "COVER_DESIGN_FINAL",
    "USER_UPLOADED_IMAGE",
  ]),

  /** Original filename for display */
  fileName: z.string().min(1).max(255).optional(),

  /** File size in bytes */
  fileSize: z.number().int().positive().optional(),

  /** MIME type */
  mimeType: z.string().max(100).optional(),
});

export type ConfirmUploadInput = z.infer<typeof ConfirmUploadSchema>;

// ==========================================
// NestJS DTOs — Created from Zod schemas via nestjs-zod
// Used for Swagger docs + automatic request validation
// ==========================================

export class GenerateSignatureDto extends createZodDto(GenerateSignatureSchema) {}
export class ConfirmUploadDto extends createZodDto(ConfirmUploadSchema) {}
