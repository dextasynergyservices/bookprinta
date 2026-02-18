import { SetMetadata } from "@nestjs/common";

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
 * @param roles - One or more UserRole enum values
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
