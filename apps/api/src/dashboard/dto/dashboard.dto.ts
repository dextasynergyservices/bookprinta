import { DashboardOverviewResponseSchema } from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** Response for GET /api/v1/dashboard/overview */
export class DashboardOverviewResponseDto extends createZodDto(DashboardOverviewResponseSchema) {}
