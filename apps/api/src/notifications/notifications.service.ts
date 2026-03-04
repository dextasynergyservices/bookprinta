import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { UnreadCountResponseDto } from "./dto/unread-count-response.dto.js";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUnreadCount(userId: string): Promise<UnreadCountResponseDto> {
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { unreadCount };
  }
}
