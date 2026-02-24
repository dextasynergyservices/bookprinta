import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/interfaces/jwt.interface.js";
import { MAX_FILE_SIZE_BYTES } from "../cloudinary/cloudinary.service.js";
import { UploadFileDto } from "./dto/index.js";
import { FilesService } from "./files.service.js";

@ApiTags("Files")
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ──────────────────────────────────────────────
  // POST /api/v1/files/upload
  // ──────────────────────────────────────────────

  @Post("upload")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload a file (backend proxy)",
    description:
      "Uploads a file through the backend. The file is validated (MIME type + 10MB size limit), " +
      "scanned for malware (ClamAV in dev / VirusTotal in production), then uploaded to Cloudinary. " +
      "A File record is created in the database linking the uploaded asset to a Book. " +
      "This ensures all files are scanned before storage (CLAUDE.md constraint #6).",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "bookId", "fileType"],
      properties: {
        file: { type: "string", format: "binary", description: "The file to upload (max 10MB)" },
        bookId: { type: "string", description: "Book CUID", example: "clx..." },
        fileType: {
          type: "string",
          enum: [
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
          ],
          description: "File type classification",
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "File uploaded, scanned, and stored successfully" })
  @ApiResponse({ status: 400, description: "Invalid MIME type, file too large, or missing file" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "File rejected — malware detected" })
  @ApiResponse({ status: 404, description: "Book not found" })
  @ApiResponse({ status: 503, description: "Scanner unavailable — uploads temporarily disabled" })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: JwtPayload
  ) {
    if (!file) {
      throw new BadRequestException("No file provided. Please attach a file to upload.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        "File exceeds the 10MB upload limit. Please ensure your file is under 10MB."
      );
    }

    return this.filesService.uploadFile(file, dto, user.sub);
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
