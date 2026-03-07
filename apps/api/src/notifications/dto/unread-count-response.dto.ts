import { NotificationUnreadCountResponseSchema } from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

export class UnreadCountResponseDto extends createZodDto(NotificationUnreadCountResponseSchema) {}
