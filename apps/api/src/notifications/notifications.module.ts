import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { SignupNotificationsService } from "./signup-notifications.service.js";

@Module({
  controllers: [NotificationsController],
  providers: [SignupNotificationsService, NotificationsService],
  exports: [SignupNotificationsService, NotificationsService],
})
export class NotificationsModule {}
