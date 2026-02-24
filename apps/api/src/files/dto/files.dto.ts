import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Schema for the metadata body sent alongside the multipart file upload.
 *
 * The actual file comes in as multipart form-data via @UploadedFile().
 * MIME type and file size are validated server-side from the file buffer,
 * NOT from this DTO (never trust client-provided Content-Type).
 */
export const UploadFileSchema = z.object({
  /** The book this file belongs to */
  bookId: z.string().cuid("Invalid book ID"),

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
});

export type UploadFileInput = z.infer<typeof UploadFileSchema>;

// ==========================================
// NestJS DTO — Created from Zod schema via nestjs-zod
// Used for Swagger docs + automatic request validation
// ==========================================

export class UploadFileDto extends createZodDto(UploadFileSchema) {}
