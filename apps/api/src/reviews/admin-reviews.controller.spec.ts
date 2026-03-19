/// <reference types="jest" />
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Test, type TestingModule } from "@nestjs/testing";
import { ROLES_KEY } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard, RolesGuard } from "../auth/guards/index.js";
import { UserRole } from "../auth/index.js";
import { AdminReviewsController } from "./admin-reviews.controller.js";
import { ReviewsService } from "./reviews.service.js";

const reviewsServiceMock = {
  listAdminReviews: jest.fn(),
  updateAdminReview: jest.fn(),
  deleteAdminReview: jest.fn(),
};

describe("AdminReviewsController", () => {
  let controller: AdminReviewsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminReviewsController],
      providers: [
        {
          provide: ReviewsService,
          useValue: reviewsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AdminReviewsController>(AdminReviewsController);
    jest.resetAllMocks();
  });

  it("applies admin role access metadata", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminReviewsController) as UserRole[];
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminReviewsController) as unknown[];

    expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it("delegates GET /admin/reviews with query filters", async () => {
    const query = {
      limit: 20,
      q: "ada",
      isPublic: false,
      rating: 4,
    } as const;

    reviewsServiceMock.listAdminReviews.mockResolvedValue({
      items: [
        {
          id: "review-1",
          bookId: "book-1",
          bookTitle: "Lagos Rising",
          authorName: "Ada Author",
          authorEmail: "ada@example.com",
          rating: 4,
          comment: "Great",
          isPublic: false,
          createdAt: "2026-03-19T10:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    await expect(controller.list(query)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "review-1" })],
    });
    expect(reviewsServiceMock.listAdminReviews).toHaveBeenCalledWith(query);
  });

  it("delegates PATCH /admin/reviews/:id to moderation update", async () => {
    reviewsServiceMock.updateAdminReview.mockResolvedValue({
      id: "review-1",
      bookId: "book-1",
      bookTitle: "Lagos Rising",
      authorName: "Ada Author",
      authorEmail: "ada@example.com",
      rating: 4,
      comment: "Updated",
      isPublic: true,
      createdAt: "2026-03-19T10:00:00.000Z",
    });

    const body = {
      isPublic: true,
      comment: "Updated",
    } as const;

    await expect(controller.update("review-1", body)).resolves.toMatchObject({
      id: "review-1",
      isPublic: true,
      comment: "Updated",
    });
    expect(reviewsServiceMock.updateAdminReview).toHaveBeenCalledWith("review-1", body);
  });

  it("delegates DELETE /admin/reviews/:id to moderation delete", async () => {
    reviewsServiceMock.deleteAdminReview.mockResolvedValue({
      id: "review-1",
      deleted: true,
    });

    await expect(controller.remove("review-1")).resolves.toEqual({
      id: "review-1",
      deleted: true,
    });
    expect(reviewsServiceMock.deleteAdminReview).toHaveBeenCalledWith("review-1");
  });
});
