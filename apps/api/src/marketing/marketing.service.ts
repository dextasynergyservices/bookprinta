import { Injectable } from "@nestjs/common";
import { BookStatus, OrderStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AboutStatsResponseDto } from "./dto/about-stats-response.dto.js";

const PUBLISHED_BOOK_STATUSES: BookStatus[] = [
  BookStatus.PRINTED,
  BookStatus.SHIPPING,
  BookStatus.DELIVERED,
  BookStatus.COMPLETED,
];

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async getAboutStats(): Promise<AboutStatsResponseDto> {
    const [titlesPublished, ordersReceived, copiesAggregate] = await Promise.all([
      this.prisma.book.count({
        where: {
          status: { in: PUBLISHED_BOOK_STATUSES },
        },
      }),
      this.prisma.order.count({
        where: {
          status: { not: OrderStatus.CANCELLED },
        },
      }),
      this.prisma.order.aggregate({
        _sum: { copies: true },
        where: {
          status: { not: OrderStatus.CANCELLED },
          book: {
            is: {
              status: { in: PUBLISHED_BOOK_STATUSES },
            },
          },
        },
      }),
    ]);

    return {
      titlesPublished,
      copiesPrinted: copiesAggregate._sum.copies ?? 0,
      ordersReceived,
    };
  }
}
