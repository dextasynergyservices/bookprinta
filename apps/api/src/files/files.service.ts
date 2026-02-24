import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import type { FileType } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ScannerService } from "../scanner/scanner.service.js";
import type { UploadFileInput } from "./dto/index.js";

/**
 * Maps file types to Cloudinary folder paths.
 * Each file type gets a dedicated folder for organisation.
 */
const FILE_TYPE_FOLDERS: Record<string, string> = {
  RAW_MANUSCRIPT: "bookprinta/manuscripts",
  CLEANED_TEXT: "bookprinta/cleaned-text",
  CLEANED_HTML: "bookprinta/cleaned-html",
  FORMATTED_PDF: "bookprinta/formatted-pdfs",
  PREVIEW_PDF: "bookprinta/preview-pdfs",
  FINAL_PDF: "bookprinta/final-pdfs",
  ADMIN_GENERATED_DOCX: "bookprinta/admin-docx",
  COVER_DESIGN_DRAFT: "bookprinta/covers/drafts",
  COVER_DESIGN_FINAL: "bookprinta/covers/finals",
  USER_UPLOADED_IMAGE: "bookprinta/user-images",
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly scanner: ScannerService
  ) {}

  // ──────────────────────────────────────────────
  // Upload (Backend Proxy)
  // ──────────────────────────────────────────────

  /**
   * Handles the complete upload flow:
   *
   *  1. Validate MIME type (server-side — never trust client Content-Type)
   *  2. Validate file size (10MB hard limit)
   *  3. Scan for malware (ClamAV or VirusTotal)
   *  4. Upload to Cloudinary (server-side)
   *  5. Create File record in database
   *
   * Per CLAUDE.md:
   *  - Constraint #4: Cloudinary uploads must be signed (server-side upload = inherently signed)
   *  - Constraint #5: 10MB file size limit enforced server-side
   *  - Constraint #6: ClamAV/VirusTotal must scan before Cloudinary storage
   */
  async uploadFile(file: Express.Multer.File, metadata: UploadFileInput, userId: string) {
    const { bookId, fileType } = metadata;
    const fileName = file.originalname;
    const mimeType = file.mimetype;
    const fileSize = file.size;

    // ── Step 1: MIME validation ────────────────────
    if (!this.cloudinary.isAllowedMimeType(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType}. Allowed: PDF, DOCX, JPEG, PNG`
      );
    }

    // ── Step 2: Size validation ────────────────────
    if (!this.cloudinary.isWithinSizeLimit(fileSize)) {
      throw new BadRequestException(
        "File exceeds the 10MB upload limit. Please ensure your file is under 10MB."
      );
    }

    // ── Step 3: Verify book ownership ──────────────
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, userId: true },
    });

    if (!book) {
      throw new NotFoundException("Book not found");
    }

    if (book.userId !== userId) {
      throw new BadRequestException("You do not have access to this book");
    }

    // ── Step 4: Malware scanning ───────────────────
    // Per CLAUDE.md constraint #6: scan BEFORE storing in Cloudinary.
    // ScannerService throws ServiceUnavailableException if scanner is down.
    const scanResult = await this.scanner.scanBuffer(file.buffer, fileName);

    if (!scanResult.clean) {
      this.logger.warn(
        `File rejected — malware detected in "${fileName}" for book ${bookId}: ${scanResult.reason}`
      );
      throw new ForbiddenException(
        "File rejected for security reasons. Please ensure your file is safe and try again."
      );
    }

    this.logger.debug(`Scan passed for "${fileName}" — uploading to Cloudinary`);

    // ── Step 5: Cloudinary upload (server-side) ────
    const folder = FILE_TYPE_FOLDERS[fileType] ?? "bookprinta/uploads";
    const resourceType = mimeType.startsWith("image/") ? "image" : "raw";

    const cloudinaryResult = await this.cloudinary.upload(file.buffer, {
      folder,
      resource_type: resourceType as "image" | "raw",
      type: "upload",
    });

    // ── Step 6: Create database record ─────────────
    const latestFile = await this.prisma.file.findFirst({
      where: {
        bookId,
        fileType: fileType as FileType,
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestFile?.version ?? 0) + 1;

    const fileRecord = await this.prisma.file.create({
      data: {
        bookId,
        fileType: fileType as FileType,
        url: cloudinaryResult.secure_url,
        fileName,
        fileSize,
        mimeType,
        version: nextVersion,
        createdBy: userId,
      },
    });

    this.logger.log(
      `File uploaded: ${fileRecord.id} (type=${fileType}, version=${nextVersion}, book=${bookId}, cloudinary=${cloudinaryResult.public_id})`
    );

    return fileRecord;
  }

  // ──────────────────────────────────────────────
  // File Retrieval
  // ──────────────────────────────────────────────

  /**
   * Lists all files for a book, grouped by type and ordered by version.
   */
  async getBookFiles(bookId: string, userId: string) {
    // Verify book access
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, userId: true },
    });

    if (!book) {
      throw new NotFoundException("Book not found");
    }

    if (book.userId !== userId) {
      throw new BadRequestException("You do not have access to this book");
    }

    return this.prisma.file.findMany({
      where: { bookId },
      orderBy: [{ fileType: "asc" }, { version: "desc" }],
    });
  }
}
