import { type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerLimitDetail } from "@nestjs/throttler";
import type { Response } from "express";
import { resolveRequestTracker } from "./tracker.utils.js";

const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait before trying again.";

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Default identity for every throttler without its own `getTracker`:
   * the signed-in user, else the proxy-resolved client IP. See tracker.utils.ts.
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveRequestTracker(req);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail
  ): Promise<void> {
    // Set the standard HTTP Retry-After header (in seconds) so Cloudflare,
    // browsers, and monitoring tools can surface the correct wait time.
    // timeToBlockExpire is in milliseconds — convert to whole seconds.
    const retryAfterSeconds = Math.ceil(throttlerLimitDetail.timeToBlockExpire / 1000);
    context.switchToHttp().getResponse<Response>().header("Retry-After", String(retryAfterSeconds));

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        message: RATE_LIMIT_MESSAGE,
        retryAfter: throttlerLimitDetail.timeToBlockExpire,
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
