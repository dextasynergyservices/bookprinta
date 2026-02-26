import * as Sentry from "@sentry/nextjs";

function parseSampleRate(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }
  return fallback;
}

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: parseSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      process.env.NODE_ENV === "production" ? 0.1 : 1.0
    ),
    sendDefaultPii: false,
  });
}
