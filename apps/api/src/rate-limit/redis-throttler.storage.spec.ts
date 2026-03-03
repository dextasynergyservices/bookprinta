/// <reference types="jest" />
import { RedisThrottlerStorage } from "./redis-throttler.storage.js";

type MockRedisClient = {
  status: string;
  ttl: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  set: jest.Mock;
};

function makeRedisService(client: MockRedisClient | null) {
  return {
    getClient: jest.fn(() => client),
  };
}

function makeReadyRedisClient(): MockRedisClient {
  return {
    status: "ready",
    ttl: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
  };
}

describe("RedisThrottlerStorage", () => {
  it("falls back to in-memory throttling when Redis client is unavailable", async () => {
    const storage = new RedisThrottlerStorage(makeRedisService(null) as never);

    const result = await storage.increment("key-1", 60_000, 10, 60_000, "short");

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToExpire).toBeGreaterThan(0);
  });

  it("falls back to in-memory throttling when Redis errors", async () => {
    const redis = makeReadyRedisClient();
    redis.ttl.mockRejectedValue(new Error("Redis down"));
    const storage = new RedisThrottlerStorage(makeRedisService(redis) as never);

    const result = await storage.increment("key-2", 60_000, 10, 60_000, "short");

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
    expect(redis.ttl).toHaveBeenCalled();
  });

  it("returns blocked response when block key is active in Redis", async () => {
    const redis = makeReadyRedisClient();
    redis.ttl.mockResolvedValue(42);
    const storage = new RedisThrottlerStorage(makeRedisService(redis) as never);

    const result = await storage.increment("key-3", 60_000, 10, 60_000, "short");

    expect(result.isBlocked).toBe(true);
    expect(result.timeToBlockExpire).toBe(42);
    expect(result.totalHits).toBe(11);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("increments in Redis when available and not blocked", async () => {
    const redis = makeReadyRedisClient();
    redis.ttl.mockResolvedValueOnce(-2).mockResolvedValueOnce(60);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    const storage = new RedisThrottlerStorage(makeRedisService(redis) as never);

    const result = await storage.increment("key-4", 60_000, 10, 60_000, "short");

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToExpire).toBe(60);
    expect(redis.incr).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });
});
