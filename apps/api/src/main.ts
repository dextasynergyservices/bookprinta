import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { cleanupOpenApiDoc, ZodValidationPipe } from "nestjs-zod";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  // Buffer early logs so nothing is lost before Pino is initialised
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Swap NestJS's default ConsoleLogger for Pino (structured logging)
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Global prefix for all routes
  app.setGlobalPrefix("api/v1");

  // Security
  app.use(helmet());
  app.use(cookieParser());

  // CORS — restrict to frontend origin
  app.enableCors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  });

  // Global Zod validation pipe (validates all incoming DTOs)
  app.useGlobalPipes(new ZodValidationPipe());

  // Swagger / OpenAPI documentation
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

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`Application running on port ${port}`, "Bootstrap");
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`, "Bootstrap");
}
bootstrap();
