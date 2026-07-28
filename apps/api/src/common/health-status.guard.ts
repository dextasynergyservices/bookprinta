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
 * HealthStatusGuard — protects the detailed status endpoint.
 *
 * `GET /health/status` (`HealthService.detailedStatus`) pings the database,
 * Redis, the scanner and the queues, and — with `?deep=1` — runs a full
 * Gotenberg Chromium render smoke test. That last check is expensive: our
 * Gotenberg runs on a single free-tier Render instance, so an unauthenticated
 * caller could loop this endpoint and exhaust it, degrading the actual PDF
 * pipeline. Protecting it removes a free resource-exhaustion vector.
 *
 * Uses a shared monitoring token (`HEALTH_STATUS_TOKEN`) rather than the JWT
 * admin guard, because the primary callers are external monitors and manual
 * curl, which cannot present a user session.
 *
 * `GET /health/ping` remains PUBLIC and is not covered by this guard — it is the
 * UptimeRobot keep-alive target and must stay fast and unauthenticated.
 *
 * If `HEALTH_STATUS_TOKEN` is unset the endpoint is disabled (503), so deploying
 * without configuring it exposes nothing.
 */
@Injectable()
export class HealthStatusGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.HEALTH_STATUS_TOKEN?.trim();

    if (!expected) {
      throw new ServiceUnavailableException(
        "Detailed status is disabled. Set HEALTH_STATUS_TOKEN to enable."
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const presented = extractSharedSecret(request, "x-health-token");

    if (!matchesSharedSecret(expected, presented)) {
      throw new ForbiddenException("Invalid health status token");
    }

    return true;
  }
}
