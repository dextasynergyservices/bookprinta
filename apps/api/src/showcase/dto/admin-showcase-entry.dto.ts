import {
  AdminCreateShowcaseEntrySchema,
  AdminDeleteShowcaseEntryResponseSchema,
  AdminShowcaseEntriesListQuerySchema,
  AdminShowcaseEntriesListResponseSchema,
  AdminShowcaseEntrySchema,
  AdminUpdateShowcaseEntrySchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** Response item for admin showcase entries */
export class AdminShowcaseEntryDto extends createZodDto(AdminShowcaseEntrySchema) {}

/** GET /api/v1/admin/showcase */
export class AdminShowcaseEntriesListQueryDto extends createZodDto(
  AdminShowcaseEntriesListQuerySchema
) {}

/** Response for GET /api/v1/admin/showcase */
export class AdminShowcaseEntriesListResponseDto extends createZodDto(
  AdminShowcaseEntriesListResponseSchema
) {}

/** POST /api/v1/admin/showcase */
export class AdminCreateShowcaseEntryDto extends createZodDto(AdminCreateShowcaseEntrySchema) {}

/** PATCH /api/v1/admin/showcase/:id */
export class AdminUpdateShowcaseEntryDto extends createZodDto(AdminUpdateShowcaseEntrySchema) {}

/** DELETE /api/v1/admin/showcase/:id */
export class AdminDeleteShowcaseEntryResponseDto extends createZodDto(
  AdminDeleteShowcaseEntryResponseSchema
) {}
