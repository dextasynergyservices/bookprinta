import { ApiProperty } from "@nestjs/swagger";

export class UnreadCountResponseDto {
  @ApiProperty({
    description: "Number of unread in-app notifications for the authenticated user",
    example: 3,
    minimum: 0,
  })
  unreadCount!: number;
}
