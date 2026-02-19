import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "../../generated/prisma/enums.js";

/**
 * Metadata key for storing required roles
 */
export const ROLES_KEY = "roles";

/**
 * Roles Decorator — Specify which roles can access an endpoint.
 *
 * Usage:
 *   @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *
 * @param roles - One or more UserRole values
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
