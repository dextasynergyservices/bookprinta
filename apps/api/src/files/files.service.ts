import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CloudinarySignatureResponse } from "../cloudinary/cloudinary.service.js";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import type { FileType } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ConfirmUploadInput, GenerateSignatureInput } from "./dto/index.js";

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService
  ) {}

  // ──────────────────────────────────────────────
  // Signature Generation
  // ──────────────────────────────────────────────

  /**
   * Generates a signed upload signature for the frontend.
   *
   * Flow:
   *  1. Frontend calls POST /api/v1/files/signature with folder, mimeType, fileSize
   *  2. Backend validates MIME type + file size, generates Cloudinary signature
   *  3. Frontend receives signature + upload params
   *  4. Frontend uploads directly to Cloudinary using signed params
   *  5. Frontend calls POST /api/v1/files/confirm with Cloudinary response data
   *
   * Security: Only the backend can generate signatures (API secret never leaves server).
   * Unsigned uploads are NOT allowed per CLAUDE.md.
   */
  generateSignature(input: GenerateSignatureInput): CloudinarySignatureResponse {
    const { folder, mimeType, fileSize, eager, tags } = input;

    // Server-side MIME validation — never trust the client Content-Type
    if (!this.cloudinary.isAllowedMimeType(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType}. Allowed: PDF, DOCX, JPEG, PNG`
      );
    }

    // Server-side size validation — 10MB hard limit
    if (!this.cloudinary.isWithinSizeLimit(fileSize)) {
      throw new BadRequestException(
        "File exceeds the 10MB upload limit. Please ensure your file is under 10MB."
      );
    }

    return this.cloudinary.generateSignature({
      folder,
      mimeType,
      eager,
      tags,
    });
  }

  // ──────────────────────────────────────────────
  // Upload Confirmation
  // ──────────────────────────────────────────────

  /**
   * Confirms a successful Cloudinary upload by creating a File record.
   *
   * Called by the frontend AFTER uploading directly to Cloudinary.
   * Stores the Cloudinary URL, file metadata, and links it to a Book.
   */
  async confirmUpload(input: ConfirmUploadInput, userId: string) {
    const { bookId, url, fileType, fileName, fileSize, mimeType } = input;

    // Verify the book exists and belongs to this user
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

    // Determine next version number for this file type
    const latestFile = await this.prisma.file.findFirst({
      where: {
        bookId,
        fileType: fileType as FileType,
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestFile?.version ?? 0) + 1;

    // Create the file record
    const file = await this.prisma.file.create({
      data: {
        bookId,
        fileType: fileType as FileType,
        url,
        fileName,
        fileSize,
        mimeType,
        version: nextVersion,
        createdBy: userId,
      },
    });

    this.logger.log(
      `File confirmed: ${file.id} (type=${fileType}, version=${nextVersion}, book=${bookId})`
    );

    return file;
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
