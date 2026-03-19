import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  AdminDeleteReviewResponseDto,
  AdminReviewsListQueryDto,
  AdminReviewsListResponseDto,
  AdminUpdateReviewDto,
  AdminUpdateReviewResponseDto,
} from "./dto/review.dto.js";
import { ReviewsService } from "./reviews.service.js";

@ApiTags("Admin Reviews")
@Controller("admin/reviews")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List reviews (admin)",
    description:
      "Returns reviews with cursor pagination and optional moderation filters for visibility, rating, and search.",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    description: "Pagination cursor (last seen review ID)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Page size (default 20, max 50)",
    example: 20,
  })
  @ApiQuery({
    name: "q",
    required: false,
    description: "Search by review comment, book title, author name, or author email",
  })
  @ApiQuery({
    name: "isPublic",
    required: false,
    description: "Filter by review visibility",
    schema: { oneOf: [{ type: "boolean" }, { type: "string", enum: ["true", "false"] }] },
  })
  @ApiQuery({
    name: "rating",
    required: false,
    description: "Filter by rating",
    schema: { oneOf: [{ type: "integer", minimum: 1, maximum: 5 }, { type: "string" }] },
  })
  @ApiResponse({
    status: 200,
    description: "Admin reviews list",
    type: AdminReviewsListResponseDto,
  })
  async list(@Query() query: AdminReviewsListQueryDto): Promise<AdminReviewsListResponseDto> {
    return this.reviewsService.listAdminReviews(query);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Moderate review (admin)",
    description:
      "Updates review moderation fields. Use this endpoint to toggle public visibility or adjust review comment content.",
  })
  @ApiParam({ name: "id", description: "Review ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Review updated",
    type: AdminUpdateReviewResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 404, description: "Review not found" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdateReviewDto
  ): Promise<AdminUpdateReviewResponseDto> {
    return this.reviewsService.updateAdminReview(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete review (admin)",
    description: "Permanently deletes a review from moderation queue and public listings.",
  })
  @ApiParam({ name: "id", description: "Review ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Review deleted",
    type: AdminDeleteReviewResponseDto,
  })
  @ApiResponse({ status: 404, description: "Review not found" })
  async remove(@Param("id") id: string): Promise<AdminDeleteReviewResponseDto> {
    return this.reviewsService.deleteAdminReview(id);
  }
}
