import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
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
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
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
  BookSettingsResponseDto,
  UpdateBookSettingsDto,
} from "./dto/book.dto.js";

@ApiTags("Books")
@Controller("books")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

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
    @Param() params: BookParamsDto
  ): Promise<BookPreviewResponseDto> {
    return this.booksService.getUserBookPreview(userId, params.id);
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
      "Returns all file versions associated with a book, including manuscript, cleaned HTML, preview PDFs, and final PDFs.",
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
}
