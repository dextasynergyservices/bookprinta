import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request } from "express";
import { extractSharedSecret, matchesSharedSecret } from "./shared-secret.js";

/**
 * CronTokenGuard — authenticates external scheduler callbacks.
 *
 * BookPrinta's periodic maintenance work is triggered by an external cron
 * (the same UptimeRobot / cron-job.org account that pings `/health/ping`)
 * rather than by BullMQ job schedulers. See docs/infra-cost-hardening-plan.md
 * Phase 1b for why: a BullMQ scheduler keeps a delayed job permanently pending,
 * which forces its worker to long-poll Redis every 10 seconds forever.
 *
 * Deliberately NOT the JWT admin guard: the caller is a machine with no user
 * session. A dedicated shared secret keeps the cron surface independent of the
 * auth module and means a leaked cron token cannot be used against admin APIs.
 *
 * Accepts the token via either:
 *   Authorization: Bearer <token>
 *   X-Cron-Token: <token>
 *
 * Two headers because not every cron provider supports arbitrary
 * `Authorization` values on free tiers.
 *
 * If CRON_TRIGGER_TOKEN is unset the endpoints are disabled outright (503), so
 * deploying without configuring it exposes nothing.
 */
@Injectable()
export class CronTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CRON_TRIGGER_TOKEN?.trim();

    if (!expected) {
      throw new ServiceUnavailableException(
        "Scheduled job triggers are disabled. Set CRON_TRIGGER_TOKEN to enable."
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const presented = extractSharedSecret(request, "x-cron-token");

    if (!matchesSharedSecret(expected, presented)) {
      throw new ForbiddenException("Invalid cron trigger token");
    }

    return true;
  }
}
