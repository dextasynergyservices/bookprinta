import {
  AdminShowcaseUserSearchQuerySchema,
  AdminShowcaseUserSearchResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/admin/showcase/users/search */
export class AdminShowcaseUserSearchQueryDto extends createZodDto(
  AdminShowcaseUserSearchQuerySchema
) {}

/** Response for GET /api/v1/admin/showcase/users/search */
export class AdminShowcaseUserSearchResponseDto extends createZodDto(
  AdminShowcaseUserSearchResponseSchema
) {}
