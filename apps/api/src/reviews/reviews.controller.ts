import { Body, Controller, Get, Header, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import {
  CreateReviewBodyDto,
  CreateReviewResponseDto,
  MyReviewsResponseZodDto,
} from "./dto/review.dto.js";
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
    summary: "Get current user's delivered-book review state",
    description:
      "Returns a unified review-state payload for the authenticated user, including " +
      "DELIVERED-or-later books, persisted book metadata, review status, and submitted review summaries.",
  })
  @ApiResponse({
    status: 200,
    description: "Review state retrieved successfully",
    type: MyReviewsResponseZodDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async getMyReviews(@CurrentUser("sub") userId: string): Promise<MyReviewsResponseZodDto> {
    return this.reviewsService.getMyReviews(userId);
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Submit a review for a delivered book",
    description:
      "Creates one review for the authenticated user and selected book. " +
      "The book must belong to the user, be DELIVERED or later, and not already have a review.",
  })
  @ApiResponse({
    status: 201,
    description: "Review submitted successfully",
    type: CreateReviewResponseDto,
  })
  @ApiResponse({ status: 400, description: "Book is not yet eligible for review" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Book not found for current user" })
  @ApiResponse({ status: 409, description: "Review already exists for this book" })
  async createReview(
    @CurrentUser("sub") userId: string,
    @Body() body: CreateReviewBodyDto
  ): Promise<CreateReviewResponseDto> {
    return this.reviewsService.createReview(userId, body);
  }
}
