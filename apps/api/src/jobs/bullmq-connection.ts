export type BullMqConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
  lazyConnect?: boolean;
};

export type BullMqConnectionResolution = {
  configured: boolean;
  source: "env" | "localhost_fallback";
  connection: BullMqConnectionOptions;
};

export function resolveBullMqConnection(
  redisUrl = process.env.REDIS_URL
): BullMqConnectionResolution {
  if (!redisUrl || redisUrl.trim().length === 0) {
    return {
      configured: false,
      source: "localhost_fallback",
      connection: {
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: null,
        lazyConnect: true,
      },
    };
  }

  const url = new URL(redisUrl);

  return {
    configured: true,
    source: "env",
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      tls: url.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
    },
  };
}
