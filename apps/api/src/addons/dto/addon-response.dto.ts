import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger response class for the Addon endpoints.
 * Mirrors AddonResponseSchema from @bookprinta/shared.
 *
 * We define this manually (instead of createZodDto) because these are
 * GET-only endpoints — there's no request body to validate. This class
 * exists purely for Swagger documentation.
 */
export class AddonResponseDto {
  @ApiProperty({
    description: "Unique addon identifier (CUID)",
    example: "clxyz1234567890abcdef",
  })
  id!: string;

  @ApiProperty({
    description: "Addon display name",
    example: "Cover Design",
  })
  name!: string;

  @ApiProperty({
    description: "URL-safe slug (unique identifier for upserts)",
    example: "cover-design",
  })
  slug!: string;

  @ApiProperty({
    description: "Addon description shown at checkout",
    example: "Professional cover design for your book",
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    description: 'Pricing model — "fixed" for flat rate, "per_word" for variable pricing',
    example: "fixed",
    enum: ["fixed", "per_word"],
  })
  pricingType!: string;

  @ApiProperty({
    description:
      "Fixed price in Nigerian Naira (NGN). Set for fixed-price addons, null for per_word.",
    example: 45000,
    nullable: true,
    type: Number,
  })
  price!: number | null;

  @ApiProperty({
    description:
      "Price per word in NGN. Set for per_word addons (e.g. Formatting), null for fixed-price.",
    example: 0.7,
    nullable: true,
    type: Number,
  })
  pricePerWord!: number | null;

  @ApiProperty({
    description: "Display order at checkout (ascending)",
    example: 1,
  })
  sortOrder!: number;

  @ApiProperty({
    description: "Whether this addon is currently available for selection",
    example: true,
  })
  isActive!: boolean;
}
