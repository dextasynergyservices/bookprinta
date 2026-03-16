import { Module } from "@nestjs/common";
import { BooksModule } from "../books/books.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { UsersModule } from "../users/users.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [BooksModule, OrdersModule, NotificationsModule, UsersModule, ReviewsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
