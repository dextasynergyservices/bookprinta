import { Global, Module } from "@nestjs/common";
import { RedisProvider } from "./redis.provider.js";
import { RedisService } from "./redis.service.js";

/**
 * Global Redis module — provides RedisService across the app.
 *
 * Any module can inject RedisService without importing RedisModule.
 * BullMQ queues use the same REDIS_URL connection via RedisService.getClient().
 *
 * Configuration:
 *  - Production: REDIS_URL → Upstash Redis (TLS via rediss://)
 *  - Local dev:  REDIS_URL → Docker Redis (redis://localhost:6379)
 *
 * Graceful degradation: If REDIS_URL is not set, the server still boots.
 * Redis-dependent features will be unavailable (see CLAUDE.md Section 22).
 */
@Global()
@Module({
  providers: [RedisProvider, RedisService],
  exports: [RedisService, RedisProvider],
})
export class RedisModule {}
