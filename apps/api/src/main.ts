import "./instrument.js";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { cleanupOpenApiDoc, ZodValidationPipe } from "nestjs-zod";
import { AppModule } from "./app.module.js";
import { assertJwtSecretConfigured } from "./auth/jwt-secret.util.js";
import { installRedisCommandMeter } from "./health/redis-command-meter.js";
import { RuntimeTelemetryService } from "./health/runtime-telemetry.service.js";
import { resolveTrustProxySetting } from "./rate-limit/tracker.utils.js";
import { SentryExceptionFilter } from "./sentry/sentry-exception.filter.js";

const bootstrapStartedAt = Date.now();

function isSwaggerEnabled(): boolean {
  const flag = process.env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

async function bootstrap() {
  // Fail fast on an untrustworthy signing secret, BEFORE anything else starts.
  //
  // Previously four call sites fell back to a hardcoded "fallback-dev-secret"
  // when JWT_SECRET was unset, with no validation anywhere. A deployment missing
  // that one variable would have signed and verified tokens with a string that
  // is public in this repository — i.e. anyone could forge a SUPER_ADMIN
  // session, silently. Refusing to boot is the only safe response; a running
  // server with a known secret is worse than no server.
  assertJwtSecretConfigured();

  // Phase 0 baseline instrumentation (docs/infra-cost-hardening-plan.md).
  // MUST run before NestFactory.create() — module initialisation opens Redis
  // connections and BullMQ starts issuing commands immediately, so a later
  // install would undercount the very traffic we are trying to attribute.
  // No-ops unless REDIS_COMMAND_METER=1.
  installRedisCommandMeter();

  // Buffer early logs so nothing is lost before Pino is initialised
  // rawBody: true — preserves the raw request body for Stripe webhook signature verification.
  // NestJS stores it on req.rawBody; only routes using @RawBodyRequest<Request> access it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Resolve req.ip through our proxy chain (Vercel → Render) so rate limits and
  // audit logs see the real client instead of Render's shared proxy address.
  app.set("trust proxy", resolveTrustProxySetting());

  // Swap NestJS's default ConsoleLogger for Pino (structured logging)
  const logger = app.get(Logger);
  app.useLogger(logger);
  const runtimeTelemetry = app.get(RuntimeTelemetryService);
  runtimeTelemetry.markBootstrapStarted(bootstrapStartedAt);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestStartedAt = Date.now();

    res.once("finish", () => {
      const firstRequest = runtimeTelemetry.recordFirstRequest({
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - requestStartedAt,
        completedAtMs: Date.now(),
      });

      if (!firstRequest) return;

      const sinceBootText =
        firstRequest.msSinceBootstrapCompleted === null
          ? "bootstrap completion time unavailable"
          : `${firstRequest.msSinceBootstrapCompleted}ms after bootstrap`;

      logger.log(
        `First request completed: ${firstRequest.method} ${firstRequest.path} -> ${firstRequest.statusCode} in ${firstRequest.durationMs}ms (${sinceBootText})`,
        "Bootstrap"
      );
    });

    next();
  });

  // Global exception filter: report 5xx errors to Sentry
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapterHost));

  // Global prefix for all routes
  app.setGlobalPrefix("api/v1");

  // Security — helmet with CORS-compatible settings
  app.use(
    helmet({
      // Allow cross-origin requests (our frontend is on a different domain)
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(cookieParser());

  // CORS — restrict to frontend origins (with and without www)
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const allowedOrigins = [frontendUrl];
  // Auto-add www variant (or non-www variant) so both work
  if (frontendUrl.includes("://www.")) {
    allowedOrigins.push(frontendUrl.replace("://www.", "://"));
  } else if (frontendUrl.match(/^https?:\/\/[^/]+\./)) {
    allowedOrigins.push(frontendUrl.replace("://", "://www."));
  }
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    // Explicitly list every HTTP method the API uses.
    // GET/POST/PATCH/PUT/DELETE = real endpoints. OPTIONS = CORS preflight
    // (browsers send this automatically before every cross-origin request).
    // HEAD = Express auto-responds for every GET route (safe to include).
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });

  // Global Zod validation pipe (validates all incoming DTOs)
  app.useGlobalPipes(new ZodValidationPipe());

  // Swagger / OpenAPI documentation — dev and staging only (CLAUDE.md §9).
  // In production it publishes a full map of the API and costs boot time and
  // memory on a 512 MB instance. Set SWAGGER_ENABLED=true to force it on.
  const swaggerEnabled = isSwaggerEnabled();
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle("BookPrinta API")
      .setDescription("API documentation for the BookPrinta publishing platform")
      .setVersion("1.0")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT access token",
        },
        "access-token"
      )
      .addCookieAuth("access_token", {
        type: "apiKey",
        in: "cookie",
        name: "access_token",
        description: "JWT stored in HttpOnly cookie",
      })
      .addTag("Auth", "Authentication & authorization")
      .addTag("Contact", "Public contact form submissions")
      .addTag("Users", "User management")
      .addTag("Orders", "Order lifecycle")
      .addTag("Books", "Book management & processing")
      .addTag("Payments", "Payment processing & webhooks")
      .addTag("Packages", "Pricing tier management")
      .addTag("Quotes", "Custom quote requests")
      .addTag("Files", "File upload & management")
      .addTag("Engine", "AI formatting & PDF generation")
      .addTag("Notifications", "Notification management")
      .addTag("Coupons", "Discount code management")
      .addTag("Reviews", "Book review system")
      .addTag("Showcase", "Author showcase & categories")
      .addTag("Resources", "Blog & resource articles")
      .addTag("Marketing", "Public marketing pages and aggregate counters")
      .addTag("Admin", "Admin panel operations")
      .addTag("Health", "Service health checks")
      .build();

    // Create document then clean up Zod-generated schemas (nestjs-zod v5)
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: "alpha",
        operationsSorter: "alpha",
      },
      customSiteTitle: "BookPrinta API Docs",
    });
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  const runtimeSnapshot = runtimeTelemetry.markBootstrapCompleted(Date.now());
  const startupDurationMs = runtimeSnapshot.startupDurationMs ?? 0;
  logger.log(`Application running on port ${port}`, "Bootstrap");
  logger.log(`Startup completed in ${startupDurationMs}ms`, "Bootstrap");
  if (swaggerEnabled) {
    logger.log(`Swagger docs available at http://localhost:${port}/api/docs`, "Bootstrap");
  }
}
bootstrap();
