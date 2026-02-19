// Auth Module — Public API

export { UserRole } from "../generated/prisma/enums.js";
export { AuthModule } from "./auth.module.js";
export { AuthService } from "./auth.service.js";
export { CurrentUser, Roles } from "./decorators/index.js";
export { JwtAuthGuard, JwtRefreshGuard, RolesGuard } from "./guards/index.js";
export type { JwtPayload, TokenPair } from "./interfaces/index.js";
export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./interfaces/index.js";
