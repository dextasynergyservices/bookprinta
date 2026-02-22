import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/index.js";
import { ContactController } from "./contact.controller.js";
import { ContactService } from "./contact.service.js";

@Module({
  imports: [RedisModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
