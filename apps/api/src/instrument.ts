import "dotenv/config";
import * as Sentry from "@sentry/node";

function parseSampleRate(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }
  return fallback;
}

const dsn = process.env.SENTRY_DSN;

if (dsn && !Sentry.isInitialized()) {
  const tracesSampleRate = parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.1 : 1.0
  );

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate,
    sendDefaultPii: false,
  });
}
