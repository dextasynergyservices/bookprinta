import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AddonsModule } from "./addons/addons.module.js";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { BooksModule } from "./books/books.module.js";
import { CloudinaryModule } from "./cloudinary/cloudinary.module.js";
import { ContactModule } from "./contact/contact.module.js";
import { CouponsModule } from "./coupons/coupons.module.js";
import { FilesModule } from "./files/files.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LoggerModule } from "./logger/logger.module.js";
import { MarketingModule } from "./marketing/marketing.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PackagesModule } from "./packages/packages.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { QuotesModule } from "./quotes/quotes.module.js";
import { AppThrottlerGuard } from "./rate-limit/app-throttler.guard.js";
import { RedisThrottlerStorage } from "./rate-limit/redis-throttler.storage.js";
import { RedisModule } from "./redis/redis.module.js";
import { RedisService } from "./redis/redis.service.js";
import { ResourcesModule } from "./resources/resources.module.js";
import { ReviewsModule } from "./reviews/reviews.module.js";
import { RolloutModule } from "./rollout/rollout.module.js";
import { ScannerModule } from "./scanner/scanner.module.js";
import { ShowcaseModule } from "./showcase/showcase.module.js";

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

    // Environment-driven feature rollout controls for production-safe releases
    RolloutModule,

    // BullMQ job queues backed by Redis (ai-formatting, pdf-generation, page-count)
    // AI formatting + authoritative page-count processors are wired.
    JobsModule.register(),

    // Rate limiting — Redis-backed with in-memory fallback (lossy)
    // Individual endpoints can override with @Throttle()
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        storage: new RedisThrottlerStorage(redisService),
        throttlers: [
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
        ],
      }),
    }),

    // Authentication & authorization
    AuthModule,

    // Global malware scanning (ClamAV local / VirusTotal production)
    ScannerModule,

    // File upload & management (backend proxy with ClamAV/VirusTotal scanning)
    FilesModule,

    // Public contact form submissions
    ContactModule,

    // Public marketing data endpoints (e.g. About page counters)
    MarketingModule,

    // Public custom quote wizard endpoints (Path B)
    QuotesModule,

    // Public resources/blog endpoints (listing, categories, article detail)
    ResourcesModule,

    // Public showcase endpoints (homepage featured preview + /showcase page)
    ShowcaseModule,

    // Coupon validation + admin coupon management
    CouponsModule,

    // Health check endpoints (keep-alive for UptimeRobot, detailed status)
    HealthModule,

    // Public package category + package endpoints (pricing bundles)
    PackagesModule,

    // Public addon endpoints (Cover Design, Formatting, ISBN Registration)
    AddonsModule,

    // In-app notifications endpoints (e.g. GET /notifications/unread-count for dashboard header badge)
    NotificationsModule,

    // Authenticated order endpoints (history, detail, tracking)
    OrdersModule,

    // Authenticated book endpoints (detail, status timeline, lifecycle metadata)
    BooksModule,

    // Payment processing & webhook handlers (Paystack, Stripe, PayPal, Bank Transfer)
    PaymentsModule,

    // User review endpoints (GET /reviews/my for dashboard eligibility + review state)
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global throttler guard — applies rate limiting to all endpoints
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
