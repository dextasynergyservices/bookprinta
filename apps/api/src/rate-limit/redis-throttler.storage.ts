import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { type ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import type { Redis } from "ioredis";
import { RedisService } from "../redis/redis.service.js";

const REDIS_COMMAND_TIMEOUT_MS = 3000;
const KEY_PREFIX = "throttle";
type ThrottlerIncrementRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallbackStorage = new ThrottlerStorageService();
  private fallbackActive = false;

  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerIncrementRecord> {
    const redis = this.redisService.getClient();
    if (!redis || redis.status !== "ready") {
      this.enableFallback("Redis unavailable for throttling");
      return this.fallbackStorage.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    try {
      const record = await this.incrementInRedis(
        redis,
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName
      );
      this.disableFallback();
      return record;
    } catch (error) {
      this.enableFallback(`Redis throttling failed: ${this.toErrorMessage(error)}`);
      return this.fallbackStorage.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  onApplicationShutdown(): void {
    this.fallbackStorage.onApplicationShutdown();
  }

  private async incrementInRedis(
    redis: Redis,
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerIncrementRecord> {
    const ttlSeconds = this.toSeconds(ttl);
    const blockDurationSeconds = this.toSeconds(blockDuration);
    const hitsKey = this.hitsKey(throttlerName, key);
    const blockKey = this.blockKey(throttlerName, key);

    const existingBlockTtl = await this.redisWithTimeout(
      redis.ttl(blockKey),
      "Redis TTL block key"
    );
    if (existingBlockTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: existingBlockTtl,
        isBlocked: true,
        timeToBlockExpire: existingBlockTtl,
      };
    }

    const totalHits = await this.redisWithTimeout(redis.incr(hitsKey), "Redis INCR throttle hits");
    if (totalHits === 1) {
      await this.redisWithTimeout(
        redis.expire(hitsKey, ttlSeconds),
        "Redis EXPIRE throttle hits key"
      );
    }

    const rawTtl = await this.redisWithTimeout(redis.ttl(hitsKey), "Redis TTL throttle hits key");
    const timeToExpire = this.normalizeTtl(rawTtl, ttlSeconds);

    if (totalHits > limit) {
      await this.redisWithTimeout(
        redis.set(blockKey, "1", "EX", blockDurationSeconds),
        "Redis SET throttle block key"
      );
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: blockDurationSeconds,
      };
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  private redisWithTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return withTimeout(promise, REDIS_COMMAND_TIMEOUT_MS, label);
  }

  private hitsKey(throttlerName: string, key: string): string {
    return `${KEY_PREFIX}:hits:${throttlerName}:${key}`;
  }

  private blockKey(throttlerName: string, key: string): string {
    return `${KEY_PREFIX}:block:${throttlerName}:${key}`;
  }

  private toSeconds(milliseconds: number): number {
    return Math.max(1, Math.ceil(milliseconds / 1000));
  }

  private normalizeTtl(ttlSeconds: number, fallbackTtlSeconds: number): number {
    return ttlSeconds > 0 ? ttlSeconds : fallbackTtlSeconds;
  }

  private enableFallback(reason: string): void {
    if (!this.fallbackActive) {
      this.logger.warn(`${reason}. Falling back to in-memory throttling.`);
      this.fallbackActive = true;
    }
  }

  private disableFallback(): void {
    if (this.fallbackActive) {
      this.logger.log("Redis throttling restored. Using Redis storage.");
      this.fallbackActive = false;
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
