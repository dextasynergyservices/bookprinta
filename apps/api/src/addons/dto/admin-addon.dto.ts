import {
  AdminAddonSchema,
  AdminCreateAddonSchema,
  AdminDeleteAddonResponseSchema,
  AdminUpdateAddonSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/admin/addons */
export class AdminAddonDto extends createZodDto(AdminAddonSchema) {}

/** POST /api/v1/admin/addons */
export class AdminCreateAddonDto extends createZodDto(AdminCreateAddonSchema) {}

/** PATCH /api/v1/admin/addons/:id */
export class AdminUpdateAddonDto extends createZodDto(AdminUpdateAddonSchema) {}

/** DELETE /api/v1/admin/addons/:id/permanent */
export class AdminDeleteAddonResponseDto extends createZodDto(AdminDeleteAddonResponseSchema) {}
