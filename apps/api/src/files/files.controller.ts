import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/interfaces/jwt.interface.js";
import { ConfirmUploadDto, GenerateSignatureDto } from "./dto/index.js";
import { FilesService } from "./files.service.js";

@ApiTags("Files")
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ──────────────────────────────────────────────
  // POST /api/v1/files/signature
  // ──────────────────────────────────────────────

  @Post("signature")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Generate signed upload signature",
    description:
      "Generates a Cloudinary signed upload signature. " +
      "The frontend uses the returned signature, timestamp, apiKey, and cloudName " +
      "to upload files directly to Cloudinary. " +
      "This ensures uploads are always authorised by the backend (signed uploads only).",
  })
  @ApiBody({ type: GenerateSignatureDto })
  @ApiResponse({
    status: 201,
    description: "Signature generated successfully",
    schema: {
      type: "object",
      properties: {
        signature: { type: "string", example: "a1b2c3d4e5f6..." },
        timestamp: { type: "number", example: 1700000000 },
        cloudName: { type: "string", example: "bookprinta" },
        apiKey: { type: "string", example: "123456789012345" },
        folder: { type: "string", example: "bookprinta/manuscripts" },
        resourceType: { type: "string", enum: ["image", "raw"], example: "raw" },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Invalid MIME type or file exceeds 10MB limit" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  generateSignature(@Body() dto: GenerateSignatureDto) {
    return this.filesService.generateSignature(dto);
  }

  // ──────────────────────────────────────────────
  // POST /api/v1/files/confirm
  // ──────────────────────────────────────────────

  @Post("confirm")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Confirm upload and create file record",
    description:
      "Called after a successful direct-to-Cloudinary upload. " +
      "Creates a File record in the database linking the uploaded asset " +
      "to a Book with proper versioning and metadata.",
  })
  @ApiBody({ type: ConfirmUploadDto })
  @ApiResponse({ status: 201, description: "File record created successfully" })
  @ApiResponse({ status: 400, description: "Invalid input or unauthorized book access" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  confirmUpload(@Body() dto: ConfirmUploadDto, @CurrentUser() user: JwtPayload) {
    return this.filesService.confirmUpload(dto, user.sub);
  }

  // ──────────────────────────────────────────────
  // GET /api/v1/files/book/:bookId
  // ──────────────────────────────────────────────

  @Get("book/:bookId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "List all file versions for a book",
    description:
      "Returns all files associated with a book, grouped by type and " +
      "ordered by version (newest first). Only accessible by the book owner.",
  })
  @ApiParam({ name: "bookId", description: "Book CUID", example: "clx..." })
  @ApiResponse({ status: 200, description: "File list returned" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found" })
  getBookFiles(@Param("bookId") bookId: string, @CurrentUser() user: JwtPayload) {
    return this.filesService.getBookFiles(bookId, user.sub);
  }
}
