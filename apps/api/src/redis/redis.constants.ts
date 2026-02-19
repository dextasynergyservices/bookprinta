/**
 * Injection token for the shared Redis (ioredis) connection instance.
 * Used by RedisModule to provide the configured connection
 * that can be injected anywhere via @Inject(REDIS_CLIENT).
 */
export const REDIS_CLIENT = "REDIS_CLIENT";
