import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AddonsModule } from "./addons/addons.module.js";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { CloudinaryModule } from "./cloudinary/cloudinary.module.js";
import { ContactModule } from "./contact/contact.module.js";
import { FilesModule } from "./files/files.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LoggerModule } from "./logger/logger.module.js";
import { PackagesModule } from "./packages/packages.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { ScannerModule } from "./scanner/scanner.module.js";

@Module({
  imports: [
    // Structured logging via Pino (must be first so all modules can log)
    LoggerModule,

    // Global database access
    PrismaModule,

    // Global Redis connection (Upstash in production, Docker locally)
    RedisModule,

    // Global Cloudinary signed upload infrastructure
    CloudinaryModule,

    // BullMQ job queues backed by Redis (ai-formatting, pdf-generation, page-count)
    // Processors are added in Phase 5. See CLAUDE.md Section 18.4.
    JobsModule.register(),

    // Rate limiting — 10 requests per minute on sensitive endpoints
    // Individual endpoints can override with @Throttle()
    ThrottlerModule.forRoot([
      {
        name: "short",
        ttl: 60000, // 1 minute
        limit: 10, // 10 requests
      },
      {
        name: "long",
        ttl: 3600000, // 1 hour
        limit: 100, // 100 requests
      },
    ]),

    // Authentication & authorization
    AuthModule,

    // Global malware scanning (ClamAV local / VirusTotal production)
    ScannerModule,

    // File upload & management (backend proxy with ClamAV/VirusTotal scanning)
    FilesModule,

    // Public contact form submissions
    ContactModule,

    // Health check endpoints (keep-alive for UptimeRobot, detailed status)
    HealthModule,

    // Public package category + package endpoints (pricing bundles)
    PackagesModule,

    // Public addon endpoints (Cover Design, Formatting, ISBN Registration)
    AddonsModule,

    // Payment processing & webhook handlers (Paystack, Stripe, PayPal, Bank Transfer)
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global throttler guard — applies rate limiting to all endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
