import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import { MyReviewsResponseDto } from "./dto/my-reviews-response.dto.js";
import { ReviewsService } from "./reviews.service.js";

@ApiTags("Reviews")
@Controller("reviews")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("my")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get current user's reviews and review-eligible books",
    description:
      "Returns review state for the authenticated user, including submitted reviews, " +
      "pending reviewable books, and `hasAnyPrintedBook` used to gate the dashboard sidebar item.",
  })
  @ApiResponse({
    status: 200,
    description: "Review state retrieved successfully",
    type: MyReviewsResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async getMyReviews(@CurrentUser("sub") userId: string): Promise<MyReviewsResponseDto> {
    return this.reviewsService.getMyReviews(userId);
  }
}
