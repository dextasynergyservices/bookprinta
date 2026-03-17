import {
  AdminArchiveOrderResponseSchema,
  AdminArchiveOrderSchema,
  AdminOrderDetailSchema,
  AdminOrdersListQuerySchema,
  AdminOrdersListResponseSchema,
  AdminUpdateOrderStatusResponseSchema,
  AdminUpdateOrderStatusSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/admin/orders?cursor=&limit=&status=&packageId=&dateFrom=&dateTo=&q=&sortBy=&sortDirection= */
export class AdminOrdersListQueryDto extends createZodDto(AdminOrdersListQuerySchema) {}

/** Response for GET /api/v1/admin/orders */
export class AdminOrdersListResponseDto extends createZodDto(AdminOrdersListResponseSchema) {}

/** Response for GET /api/v1/admin/orders/:id */
export class AdminOrderDetailDto extends createZodDto(AdminOrderDetailSchema) {}

/** PATCH /api/v1/admin/orders/:id/status */
export class AdminUpdateOrderStatusDto extends createZodDto(AdminUpdateOrderStatusSchema) {}

/** Response for PATCH /api/v1/admin/orders/:id/status */
export class AdminUpdateOrderStatusResponseDto extends createZodDto(
  AdminUpdateOrderStatusResponseSchema
) {}

/** PATCH /api/v1/admin/orders/:id/archive */
export class AdminArchiveOrderDto extends createZodDto(AdminArchiveOrderSchema) {}

/** Response for PATCH /api/v1/admin/orders/:id/archive */
export class AdminArchiveOrderResponseDto extends createZodDto(AdminArchiveOrderResponseSchema) {}
