import {
  AdminUpdateUserResponseSchema,
  AdminUpdateUserSchema,
  AdminUserDetailSchema,
  AdminUsersListQuerySchema,
  AdminUsersListResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/admin/users?cursor=&limit=&q=&role=&isVerified=&sortBy=&sortDirection= */
export class AdminUsersListQueryDto extends createZodDto(AdminUsersListQuerySchema) {}

/** Response for GET /api/v1/admin/users */
export class AdminUsersListResponseDto extends createZodDto(AdminUsersListResponseSchema) {}

/** Response for GET /api/v1/admin/users/:id */
export class AdminUserDetailDto extends createZodDto(AdminUserDetailSchema) {}

/** PATCH /api/v1/admin/users/:id */
export class AdminUpdateUserDto extends createZodDto(AdminUpdateUserSchema) {}

/** Response for PATCH /api/v1/admin/users/:id */
export class AdminUpdateUserResponseDto extends createZodDto(AdminUpdateUserResponseSchema) {}
