import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger response class for the Package endpoints.
 * Mirrors PackageResponseSchema from @bookprinta/shared.
 *
 * We define this manually (instead of createZodDto) because these are
 * GET-only endpoints — there's no request body to validate. This class
 * exists purely for Swagger documentation.
 */

export class PackageFeaturesDto {
  @ApiProperty({
    description: "List of feature descriptions included in this package",
    example: ["Professional formatting", "Custom cover design", "ISBN registration"],
    type: [String],
  })
  items!: string[];

  @ApiProperty({
    description: "Number of printed copies included per book size",
    example: { A4: 1, A5: 2, A6: 3 },
    type: "object",
    properties: {
      A4: { type: "number", example: 1 },
      A5: { type: "number", example: 2 },
      A6: { type: "number", example: 3 },
    },
  })
  copies!: { A4: number; A5: number; A6: number };
}

export class PackageCategorySummaryDto {
  @ApiProperty({
    description: "Unique package category identifier (CUID)",
    example: "cm1234567890abcdef1234567",
  })
  id!: string;

  @ApiProperty({
    description: "Package category name",
    example: "Author Lunch",
  })
  name!: string;

  @ApiProperty({
    description: "URL-safe category slug",
    example: "author-lunch",
  })
  slug!: string;

  @ApiProperty({
    description: "Category description shown on pricing page",
    example: "For author-focused publishing bundles with fixed default copies.",
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    description: "Fixed default copy count for all packages in this category",
    example: 25,
  })
  copies!: number;

  @ApiProperty({
    description: "Whether this category is currently active",
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: "Display order for categories on pricing page (ascending)",
    example: 0,
  })
  sortOrder!: number;
}

export class PackageBaseResponseDto {
  @ApiProperty({
    description: "Unique package identifier (CUID)",
    example: "clxyz1234567890abcdef",
  })
  id!: string;

  @ApiProperty({
    description: "Package name",
    example: "Author Launch 2",
  })
  name!: string;

  @ApiProperty({
    description: "URL-safe package slug",
    example: "author-launch-2",
  })
  slug!: string;

  @ApiProperty({
    description: "Package description shown on the pricing page",
    example: "Perfect for authors who want a professional finish with custom cover design.",
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    description: "Base price in Nigerian Naira (NGN)",
    example: 150000,
    type: Number,
  })
  basePrice!: number;

  @ApiProperty({
    description: "Maximum number of pages included in the base price",
    example: 200,
  })
  pageLimit!: number;

  @ApiProperty({
    description: "Whether ISBN registration is included free with this package",
    example: true,
  })
  includesISBN!: boolean;

  @ApiProperty({
    description: "Feature list and per-size copy counts",
    type: PackageFeaturesDto,
  })
  features!: PackageFeaturesDto;

  @ApiProperty({
    description: "Whether this package is currently available for purchase",
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: "Display order on pricing page (ascending)",
    example: 2,
  })
  sortOrder!: number;
}

export class PackageResponseDto extends PackageBaseResponseDto {
  @ApiProperty({
    description: "Category this package belongs to",
    type: PackageCategorySummaryDto,
  })
  category!: PackageCategorySummaryDto;
}
