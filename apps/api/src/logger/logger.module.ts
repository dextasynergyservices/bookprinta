import { Module } from "@nestjs/common";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";

/**
 * LoggerModule — Structured logging via Pino, injected as the NestJS logger.
 *
 * Behaviour:
 *  - Development: human-readable, coloured output via `pino-pretty`
 *  - Production:  raw JSON lines for log-aggregation services (Render, Datadog, ELK)
 *
 * All existing `new Logger(ClassName.name)` calls throughout the codebase
 * automatically route through Pino once `app.useLogger(app.get(Logger))` is
 * set in `main.ts` — no changes required at call sites.
 *
 * Environment variables:
 *  - LOG_LEVEL: overrides the default log level (default: "debug" in dev, "info" in prod)
 *  - NODE_ENV:  controls transport selection ("production" → JSON, otherwise → pino-pretty)
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        // Log level: configurable via env, sensible defaults per environment
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),

        // Redact sensitive headers from logged request objects
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie"],
          censor: "[REDACTED]",
        },

        // Assign a human-readable severity label alongside the numeric level
        formatters: {
          level: (label: string) => ({ level: label }),
        },

        // Custom serializers — keep request/response logs lean
        serializers: {
          req: (req: Record<string, unknown>) => ({
            method: req.method,
            url: req.url,
            // Include query params when present
            ...(req.query && Object.keys(req.query as object).length > 0
              ? { query: req.query }
              : {}),
          }),
          res: (res: Record<string, unknown>) => ({
            statusCode: res.statusCode,
          }),
        },

        // Development: coloured, pretty-printed output
        // Production:  raw JSON (no transport — writes to stdout directly)
        ...(process.env.NODE_ENV !== "production"
          ? {
              transport: {
                target: "pino-pretty",
                options: {
                  colorize: true,
                  singleLine: false,
                  translateTime: "SYS:HH:MM:ss.l",
                  ignore: "pid,hostname",
                },
              },
            }
          : {}),
      },
    }),
  ],
})
export class LoggerModule {}
