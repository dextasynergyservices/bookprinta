import { Module } from "@nestjs/common";
import { SignupNotificationsService } from "./signup-notifications.service.js";

@Module({
  providers: [SignupNotificationsService],
  exports: [SignupNotificationsService],
})
export class NotificationsModule {}
