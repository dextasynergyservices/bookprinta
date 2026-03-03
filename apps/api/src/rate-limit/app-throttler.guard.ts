import { type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerLimitDetail } from "@nestjs/throttler";

const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait before trying again.";

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail
  ): Promise<void> {
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
