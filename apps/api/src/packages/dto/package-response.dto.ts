import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger response class for the Package endpoints.
 * Mirrors PackageResponseSchema from @bookprinta/shared.
 *
 * We define this manually (instead of createZodDto) because these are
 * GET-only endpoints — there's no request body to validate. This class
 * exists purely for Swagger documentation.
 */

class PackageFeaturesDto {
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

export class PackageResponseDto {
  @ApiProperty({
    description: "Unique package identifier (CUID)",
    example: "clxyz1234567890abcdef",
  })
  id!: string;

  @ApiProperty({
    description: "Package tier name",
    example: "Glow Up",
  })
  name!: string;

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
