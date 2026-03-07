import {
  NotificationIdParamsSchema,
  NotificationMarkAllReadResponseSchema,
  NotificationMarkReadResponseSchema,
  NotificationsListQuerySchema,
  NotificationsListResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/notifications query params */
export class NotificationsListQueryDto extends createZodDto(NotificationsListQuerySchema) {}

/** :id route param for /notifications/:id/read */
export class NotificationIdParamsDto extends createZodDto(NotificationIdParamsSchema) {}

/** Response for GET /api/v1/notifications */
export class NotificationsListResponseDto extends createZodDto(NotificationsListResponseSchema) {}

/** Response for PATCH /api/v1/notifications/:id/read */
export class NotificationMarkReadResponseDto extends createZodDto(
  NotificationMarkReadResponseSchema
) {}

/** Response for PATCH /api/v1/notifications/read-all */
export class NotificationMarkAllReadResponseDto extends createZodDto(
  NotificationMarkAllReadResponseSchema
) {}
