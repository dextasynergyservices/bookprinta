import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { SignupNotificationsService } from "./signup-notifications.service.js";
import { WhatsappService } from "./whatsapp.service.js";
import { WhatsappNotificationsService } from "./whatsapp-notifications.service.js";

@Module({
  imports: [RedisModule],
  controllers: [NotificationsController],
  providers: [
    SignupNotificationsService,
    NotificationsService,
    WhatsappService,
    WhatsappNotificationsService,
  ],
  exports: [
    SignupNotificationsService,
    NotificationsService,
    WhatsappService,
    WhatsappNotificationsService,
  ],
})
export class NotificationsModule {}
