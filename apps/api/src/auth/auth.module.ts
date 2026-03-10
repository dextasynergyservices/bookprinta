import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { LoggerModule } from "../logger/logger.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { RolesGuard } from "./guards/index.js";
import { JwtRefreshStrategy, JwtStrategy } from "./strategies/index.js";

/**
 * Auth Module — JWT authentication with HttpOnly cookies.
 *
 * Provides:
 * - Passport JWT strategy (access token from cookie)
 * - Passport JWT refresh strategy (refresh token from cookie + DB validation)
 * - RBAC via RolesGuard + @Roles() decorator
 * - AuthService for signup, login, logout, refresh, password reset
 *
 * PrismaService is available globally via PrismaModule (@Global).
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" }), NotificationsModule, LoggerModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, RolesGuard],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
