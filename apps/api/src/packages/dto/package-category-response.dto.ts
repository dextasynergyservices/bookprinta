import { ApiProperty } from "@nestjs/swagger";
import { PackageBaseResponseDto, PackageCategorySummaryDto } from "./package-response.dto.js";

/**
 * Swagger response class for GET /package-categories.
 * Mirrors PackageCategoryResponseSchema from @bookprinta/shared.
 */
export class PackageCategoryResponseDto extends PackageCategorySummaryDto {
  @ApiProperty({
    description: "Active packages in this category, sorted by sortOrder",
    type: [PackageBaseResponseDto],
  })
  packages!: PackageBaseResponseDto[];
}
