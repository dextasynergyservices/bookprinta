import type { AdminBookHtmlUploadBodyInput } from "@bookprinta/shared";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { BooksService } from "./books.service.js";
import {
  AdminBookDetailResponseDto,
  AdminBookDownloadParamsDto,
  AdminBookHtmlUploadBodyDto,
  AdminBookHtmlUploadResponseDto,
  AdminBooksListQueryDto,
  AdminBooksListResponseDto,
  AdminBookVersionFileDownloadParamsDto,
  AdminRejectBookDto,
  AdminRejectBookResponseDto,
  AdminResetProcessingDto,
  AdminResetProcessingResponseDto,
  AdminUpdateBookStatusDto,
  AdminUpdateBookStatusResponseDto,
  BookParamsDto,
} from "./dto/book.dto.js";

@ApiTags("Admin Books")
@Controller("admin/books")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminBooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List admin books",
    description:
      "Returns books for the admin production dashboard, including author, order, display status, and upload metadata.",
  })
  @ApiOkResponse({
    description: "Admin books listed successfully",
    type: AdminBooksListResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  async listBooks(@Query() query: AdminBooksListQueryDto): Promise<AdminBooksListResponseDto> {
    return this.booksService.findAdminBooks(query);
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get admin book detail",
    description:
      "Returns the full admin book detail view, including author and order context, status controls, and all file versions.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiOkResponse({
    description: "Admin book detail returned successfully",
    type: AdminBookDetailResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async getBookDetail(@Param() params: BookParamsDto): Promise<AdminBookDetailResponseDto> {
    return this.booksService.findAdminBookById(params.id);
  }

  @Patch(":id/status")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Advance admin book status",
    description:
      "Advances the admin-facing production tracker with optimistic locking and an audit log entry. " +
      "This updates Book.productionStatus without mutating the underlying manuscript-processing state.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiOkResponse({
    description: "Book status advanced successfully",
    type: AdminUpdateBookStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 409, description: "Conflict — book version is stale" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async updateBookStatus(
    @Param() params: BookParamsDto,
    @Body() dto: AdminUpdateBookStatusDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminUpdateBookStatusResponseDto> {
    return this.booksService.updateAdminBookStatus(params.id, dto, adminId);
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Reject a manuscript",
    description:
      "Rejects the manuscript with a required reason, records an audit log, creates an in-app notification, and sends the rejection email.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiOkResponse({
    description: "Book rejected successfully",
    type: AdminRejectBookResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 409, description: "Conflict — book version is stale" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async rejectBook(
    @Param() params: BookParamsDto,
    @Body() dto: AdminRejectBookDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminRejectBookResponseDto> {
    return this.booksService.rejectAdminBook(params.id, dto, adminId);
  }

  @Post(":id/upload-html")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Authorize or finalize manual cleaned HTML upload",
    description:
      'Supports the admin HTML fallback flow in one endpoint: send { action: "authorize" } to get a signed Cloudinary payload, then send { action: "finalize" } after upload succeeds to persist the CLEANED_HTML file and resume page counting.',
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiOkResponse({
    description: "HTML fallback upload authorized or finalized successfully",
    type: AdminBookHtmlUploadResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 409, description: "Conflict — book version is stale" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async uploadHtmlFallback(
    @Param() params: BookParamsDto,
    @CurrentUser("sub") adminId: string,
    @Body() body: AdminBookHtmlUploadBodyDto
  ): Promise<AdminBookHtmlUploadResponseDto> {
    return this.booksService.requestAdminBookHtmlUpload(
      params.id,
      body as AdminBookHtmlUploadBodyInput,
      adminId
    );
  }

  @Get(":id/download/:fileType")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Download admin book source files",
    description:
      "Downloads the latest raw manuscript, cleaned HTML, or final clean PDF file for admin verification and fallback workflows.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiParam({
    name: "fileType",
    description: "Admin download file type",
    enum: ["raw", "cleaned", "final-pdf"],
  })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/html"
  )
  @ApiOkResponse({
    description: "Requested book file streamed as an attachment",
    schema: {
      type: "string",
      format: "binary",
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 404, description: "Requested file not found" })
  async downloadBookFile(
    @Param() params: AdminBookDownloadParamsDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    const file = await this.booksService.downloadAdminBookFile(params.id, params.fileType);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.buffer);
  }

  @Get(":id/files/:fileId/download")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Download a specific admin book file version",
    description:
      "Streams a specific file lineage asset with its recorded filename so admin downloads do not fall back to a generic storage-provider name.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiParam({
    name: "fileId",
    description: "Book file CUID",
    example: "cm1234567890abcdef7654321",
  })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/html",
    "application/octet-stream"
  )
  @ApiOkResponse({
    description: "Requested book file version streamed as an attachment",
    schema: {
      type: "string",
      format: "binary",
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 404, description: "Requested file version not found" })
  async downloadBookVersionFile(
    @Param() params: AdminBookVersionFileDownloadParamsDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    const file = await this.booksService.downloadAdminBookVersionFile(params.id, params.fileId);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.buffer);
  }

  @Post(":id/reset-processing")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Reset manuscript processing pipeline",
    description:
      "Resets a stuck or failed book back to AI_PROCESSING and re-enqueues the formatting pipeline. " +
      "Use this when AI formatting or page counting has failed and you want to retry from scratch.",
  })
  @ApiParam({
    name: "id",
    description: "Book CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiOkResponse({
    description: "Processing pipeline reset and re-queued successfully",
    type: AdminResetProcessingResponseDto,
  })
  @ApiResponse({ status: 400, description: "Book cannot be reset at its current stage" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  @ApiResponse({ status: 409, description: "Conflict — book version is stale" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async resetProcessing(
    @Param() params: BookParamsDto,
    @Body() dto: AdminResetProcessingDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminResetProcessingResponseDto> {
    return this.booksService.resetAdminBookProcessing(params.id, dto, adminId);
  }
}
