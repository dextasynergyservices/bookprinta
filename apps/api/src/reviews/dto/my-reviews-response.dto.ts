import { ApiProperty } from "@nestjs/swagger";
import { BookStatus } from "../../generated/prisma/enums.js";

export class ReviewedBookDto {
  @ApiProperty({
    description: "Book CUID",
    example: "cm8x8m4y10000x9ab12cd34ef",
  })
  bookId!: string;

  @ApiProperty({
    description: "User rating for this book",
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  rating!: number;

  @ApiProperty({
    description: "Optional review comment",
    example: "Excellent quality and communication throughout production.",
    nullable: true,
  })
  comment!: string | null;

  @ApiProperty({
    description: "Whether this review is publicly visible on showcase pages",
    example: false,
  })
  isPublic!: boolean;

  @ApiProperty({
    description: "When the review was submitted",
    example: "2026-03-04T10:45:30.000Z",
    type: String,
    format: "date-time",
  })
  createdAt!: Date;
}

export class PendingReviewBookDto {
  @ApiProperty({
    description: "Book CUID",
    example: "cm8x8m4y10000x9ab12cd34ef",
  })
  bookId!: string;

  @ApiProperty({
    description: "Current lifecycle status for the book",
    enum: BookStatus,
    example: BookStatus.PRINTED,
  })
  status!: BookStatus;
}

export class MyReviewsResponseDto {
  @ApiProperty({
    description: "True when user has at least one book at PRINTED or later status",
    example: true,
  })
  hasAnyPrintedBook!: boolean;

  @ApiProperty({
    description: "All reviews submitted by the user",
    type: [ReviewedBookDto],
  })
  reviewedBooks!: ReviewedBookDto[];

  @ApiProperty({
    description: "Review-eligible books with no submitted review yet",
    type: [PendingReviewBookDto],
  })
  pendingBooks!: PendingReviewBookDto[];
}
