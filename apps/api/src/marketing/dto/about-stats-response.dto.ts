import { ApiProperty } from "@nestjs/swagger";

export class AboutStatsResponseDto {
  @ApiProperty({
    description: "Total published titles (books that reached print/shipping/completed states)",
    example: 1280,
    minimum: 0,
  })
  titlesPublished!: number;

  @ApiProperty({
    description: "Total copies printed for published titles",
    example: 245000,
    minimum: 0,
  })
  copiesPrinted!: number;

  @ApiProperty({
    description: "Total orders received (excluding cancelled orders)",
    example: 9800,
    minimum: 0,
  })
  ordersReceived!: number;
}
