import {
  AdminCreatePackageSchema,
  AdminDeletePackageResponseSchema,
  AdminPackageSchema,
  AdminUpdatePackageSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/admin/packages */
export class AdminPackageDto extends createZodDto(AdminPackageSchema) {}

/** POST /api/v1/admin/packages */
export class AdminCreatePackageDto extends createZodDto(AdminCreatePackageSchema) {}

/** PATCH /api/v1/admin/packages/:id */
export class AdminUpdatePackageDto extends createZodDto(AdminUpdatePackageSchema) {}

/** DELETE /api/v1/admin/packages/:id/permanent */
export class AdminDeletePackageResponseDto extends createZodDto(AdminDeletePackageResponseSchema) {}
