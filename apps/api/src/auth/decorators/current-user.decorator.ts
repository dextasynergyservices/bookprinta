import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { JwtPayload } from "../interfaces/index.js";

/**
 * CurrentUser Decorator — Extract authenticated user from request.
 *
 * Usage in controllers:
 *   @Get('me')
 *   @UseGuards(JwtAuthGuard)
 *   getMe(@CurrentUser() user: JwtPayload) { ... }
 *
 *   // Or extract a specific field:
 *   getMe(@CurrentUser('sub') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (data) {
      return user?.[data];
    }

    return user;
  }
);
