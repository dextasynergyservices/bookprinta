import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import { MAX_FILE_SIZE_BYTES } from "../cloudinary/cloudinary.service.js";
import { BooksService } from "./books.service.js";
import {
  ApproveBookDto,
  BookApproveResponseDto,
  BookDetailResponseDto,
  BookFilesResponseDto,
  BookManuscriptUploadResponseDto,
  BookParamsDto,
  BookPreviewResponseDto,
  BookReprintConfigResponseDto,
  BookReprocessResponseDto,
  BookSettingsResponseDto,
  UpdateBookSettingsDto,
  UserBooksListQueryDto,
  UserBooksListResponseDto,
} from "./dto/book.dto.js";

@ApiTags("Books")
@Controller("books")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  /**
   * GET /api/v1/books
   * Authenticated user's books, paginated and most recently updated first.
   */
  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List current user's books",
    description:
      "Returns the authenticated user's books with lifecycle status, processing summary, " +
      "and direct dashboard navigation URLs for the workspace and linked order tracking view.",
  })
  @ApiResponse({
    status: 200,
    description: "Book list retrieved successfully",
    type: UserBooksListResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async findMyBooks(
    @CurrentUser("sub") userId: string,
    @Query() query: UserBooksListQueryDto
  ): Promise<UserBooksListResponseDto> {
    return this.booksService.findUserBooks(userId, query);
  }

  /**
   * PATCH /api/v1/books/:id/settings
   * Save pre-upload manuscript settings (size + font).
   */
  @Patch(":id/settings")
  @ApiOperation({
    summary: "Update book manuscript settings",
    description:
      "Stores the manuscript layout settings selected before upload (page size and font size). " +
      "These settings are required before manuscript upload and are used for page estimation.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Book settings updated successfully",
    type: BookSettingsResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid settings payload" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async updateBookSettings(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto,
    @Body() dto: UpdateBookSettingsDto
  ): Promise<BookSettingsResponseDto> {
    return this.booksService.updateUserBookSettings(userId, params.id, dto);
  }

  /**
   * POST /api/v1/books/:id/upload
   * Upload manuscript after settings are selected.
   */
  @Post(":id/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
      },
    })
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload manuscript file",
    description:
      "Uploads a DOCX/PDF manuscript for a book after settings are selected. " +
      "The file is validated (type + 10MB max), malware scanned (ClamAV/VirusTotal), " +
      "stored in Cloudinary, then word count and estimated pages are calculated.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Manuscript file (.docx or .pdf, max 10MB)",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Manuscript uploaded and analyzed successfully",
    type: BookManuscriptUploadResponseDto,
  })
  @ApiResponse({ status: 400, description: "Missing file, unsupported type, or invalid settings" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  @ApiResponse({ status: 403, description: "File rejected for security reasons" })
  @ApiResponse({ status: 503, description: "File scanning temporarily unavailable" })
  async uploadManuscript(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto,
    @UploadedFile() file: Express.Multer.File | undefined
  ): Promise<BookManuscriptUploadResponseDto> {
    if (!file) {
      throw new BadRequestException("No file provided. Please attach a DOCX or PDF manuscript.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        "File exceeds the 10MB upload limit. Please ensure your file is under 10MB."
      );
    }

    return this.booksService.uploadUserManuscript(userId, params.id, file);
  }

  /**
   * POST /api/v1/books/:id/reprocess
   * Requeue automated manuscript processing when the previous run is stale.
   */
  @Post(":id/reprocess")
  @ApiOperation({
    summary: "Retry manuscript processing",
    description:
      "Queues a fresh automated manuscript formatting run from the latest uploaded manuscript " +
      "when the previous processing run is stale or recoverable.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Manuscript processing requeued successfully",
    type: BookReprocessResponseDto,
  })
  @ApiResponse({ status: 400, description: "Missing manuscript or book no longer retryable" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  @ApiResponse({ status: 409, description: "Processing is still actively running" })
  async reprocessBook(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto
  ): Promise<BookReprocessResponseDto> {
    return this.booksService.reprocessUserBook(userId, params.id);
  }

  /**
   * POST /api/v1/books/:id/approve
   * Approve book for final PDF generation after billing gate checks.
   */
  @Post(":id/approve")
  @ApiOperation({
    summary: "Approve book for production",
    description:
      "Approves a PREVIEW_READY manuscript for production only when billing gate rules pass. " +
      "If page overage exists, successful extra-page payment is required before approval.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Book approved and final PDF generation queued",
    type: BookApproveResponseDto,
  })
  @ApiResponse({ status: 400, description: "Book is not ready for approval" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  @ApiResponse({ status: 409, description: "Extra pages payment required before approval" })
  async approveBook(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto,
    @Body() dto: ApproveBookDto
  ): Promise<BookApproveResponseDto> {
    return this.booksService.approveUserBook(userId, params.id, dto);
  }

  /**
   * GET /api/v1/books/:id/preview
   * Returns the current watermarked preview PDF URL for the authenticated user.
   */
  @Get(":id/preview")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get preview PDF",
    description:
      "Returns the current watermarked preview PDF URL for a user's book after preview generation is complete.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Preview PDF URL retrieved successfully",
    type: BookPreviewResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found or preview PDF not available yet" })
  async getBookPreview(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto,
    @Req() request: Request
  ): Promise<BookPreviewResponseDto> {
    return this.booksService.getUserBookPreview(
      userId,
      params.id,
      this.buildPreviewStreamUrl(request, params.id)
    );
  }

  /**
   * GET /api/v1/books/:id/preview/file
   * Streams the current watermarked preview PDF inline for the authenticated user.
   */
  @Get(":id/preview/file")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Open watermarked preview PDF inline",
    description:
      "Streams the current watermarked preview PDF inline for the authenticated user " +
      "so the browser opens it as a PDF instead of downloading a generic raw file.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiProduces("application/pdf")
  @ApiResponse({ status: 200, description: "Preview PDF streamed successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found or preview PDF not available yet" })
  @ApiResponse({ status: 503, description: "Preview PDF is temporarily unavailable" })
  async streamBookPreview(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto
  ): Promise<StreamableFile> {
    const preview = await this.booksService.getUserBookPreviewFileSource(userId, params.id);

    let upstreamResponse: Awaited<ReturnType<typeof fetch>>;
    try {
      upstreamResponse = await fetch(preview.sourceUrl);
    } catch {
      throw new ServiceUnavailableException("Preview PDF is temporarily unavailable.");
    }

    if (!upstreamResponse.ok) {
      throw new ServiceUnavailableException("Preview PDF is temporarily unavailable.");
    }

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const safeFileName = this.normalizePdfFileName(preview.fileName);

    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `inline; filename="${safeFileName}"`,
      length: buffer.byteLength,
    });
  }

  /**
   * GET /api/v1/books/:id/files
   * Returns file lineage for the authenticated user's book.
   */
  @Get(":id/files")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List book file versions",
    description:
      "Returns user-visible file versions associated with a book, including manuscript, cleaned HTML, and preview PDFs. Final PDFs remain admin-only.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Book files retrieved successfully",
    type: BookFilesResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async getBookFiles(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto
  ): Promise<BookFilesResponseDto> {
    return this.booksService.getUserBookFiles(userId, params.id);
  }

  /**
   * GET /api/v1/books/:id/reprint-config
   * Returns the narrow server-authored reprint configuration for a delivered/completed book.
   */
  @Get(":id/reprint-config")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get reprint configuration",
    description:
      "Returns the authenticated user's reprint-same configuration for a book, including " +
      "eligibility, default print options, cost-per-page lookup, and enabled inline providers.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Reprint configuration retrieved successfully",
    type: BookReprintConfigResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async getBookReprintConfig(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto
  ): Promise<BookReprintConfigResponseDto> {
    return this.booksService.getUserBookReprintConfig(userId, params.id);
  }

  /**
   * GET /api/v1/books/:id
   * Authenticated user can only access their own book.
   */
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get book detail",
    description:
      "Returns full book detail for the authenticated user, including current status, " +
      "production progress timeline, timestamps, and rejection metadata.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Book detail retrieved successfully",
    type: BookDetailResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async findMyBookById(
    @CurrentUser("sub") userId: string,
    @Param() params: BookParamsDto
  ): Promise<BookDetailResponseDto> {
    return this.booksService.findUserBookById(userId, params.id);
  }

  private buildPreviewStreamUrl(request: Request, bookId: string): string {
    const forwardedProtoHeader = request.headers["x-forwarded-proto"];
    const forwardedHostHeader = request.headers["x-forwarded-host"];
    const protocol =
      typeof forwardedProtoHeader === "string" && forwardedProtoHeader.trim().length > 0
        ? forwardedProtoHeader.split(",")[0]?.trim() || request.protocol
        : request.protocol;
    const host =
      (typeof forwardedHostHeader === "string" && forwardedHostHeader.trim().length > 0
        ? forwardedHostHeader
        : request.get("host")) ?? "localhost:3001";

    return `${protocol}://${host}/api/v1/books/${encodeURIComponent(bookId)}/preview/file`;
  }

  private normalizePdfFileName(fileName: string): string {
    const trimmed = fileName.trim().replace(/"/g, "");
    if (trimmed.length === 0) {
      return "book-preview.pdf";
    }
    if (trimmed.toLowerCase().endsWith(".pdf")) {
      return trimmed;
    }
    return `${trimmed}.pdf`;
  }
}
