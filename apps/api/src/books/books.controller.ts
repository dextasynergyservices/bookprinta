import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import { BooksService } from "./books.service.js";
import { BookDetailResponseDto, BookParamsDto } from "./dto/book.dto.js";

@ApiTags("Books")
@Controller("books")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

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
