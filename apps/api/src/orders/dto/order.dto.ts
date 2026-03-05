import {
  OrderDetailResponseSchema,
  OrderInvoiceArchiveResponseSchema,
  OrderParamsSchema,
  OrdersListQuerySchema,
  OrdersListResponseSchema,
  OrderTrackingResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/orders query params */
export class OrdersListQueryDto extends createZodDto(OrdersListQuerySchema) {}

/** :id route param for /orders/:id and /orders/:id/tracking */
export class OrderParamsDto extends createZodDto(OrderParamsSchema) {}

/** Response for GET /api/v1/orders */
export class OrdersListResponseDto extends createZodDto(OrdersListResponseSchema) {}

/** Response for GET /api/v1/orders/:id */
export class OrderDetailResponseDto extends createZodDto(OrderDetailResponseSchema) {}

/** Response for GET /api/v1/orders/:id/tracking */
export class OrderTrackingResponseDto extends createZodDto(OrderTrackingResponseSchema) {}

/** Response for GET /api/v1/orders/:id/invoice/archive */
export class OrderInvoiceArchiveResponseDto extends createZodDto(
  OrderInvoiceArchiveResponseSchema
) {}
