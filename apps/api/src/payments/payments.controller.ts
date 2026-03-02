import type { RawBodyRequest } from "@nestjs/common";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { MAX_FILE_SIZE_BYTES } from "../cloudinary/cloudinary.service.js";
import {
  ExtraPagesPaymentDto,
  InitializePaymentDto,
  ReprintPaymentDto,
} from "./dto/payment-request.dto.js";
import {
  BankTransferResponseDto,
  InitializePaymentResponseDto,
  PaymentGatewayResponseDto,
  VerifyPaymentResponseDto,
} from "./dto/payment-response.dto.js";
import { PaymentsService } from "./payments.service.js";

// ──────────────────────────────────────────────
// Payments Controller
//
// Endpoints from CLAUDE.md Section 9.1 — Payments:
//   GET  /payments/gateways            (Public)
//   POST /payments/initialize          (Public)
//   POST /payments/verify/:reference   (Public)
//   POST /payments/bank-transfer       (Public)
//   POST /payments/extra-pages         (Authenticated)
//   POST /payments/reprint             (Authenticated)
//   POST /payments/webhook/paystack    (Public — signature verified)
//   POST /payments/webhook/stripe      (Public — signature verified)
// ──────────────────────────────────────────────

@ApiTags("Payments")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ────────────────────────────────────────────
  // Public endpoints
  // ────────────────────────────────────────────

  /**
   * GET /api/v1/payments/gateways
   * Returns active checkout gateways, sorted by priority.
   */
  @Get("gateways")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List available payment gateways",
    description:
      "Returns enabled gateways for checkout (e.g. Paystack, Bank Transfer), sorted by priority. " +
      "Card gateways are returned only when provider keys are configured.",
  })
  @ApiResponse({
    status: 200,
    description: "Available gateways",
    type: PaymentGatewayResponseDto,
    isArray: true,
  })
  async listGateways() {
    return this.paymentsService.listAvailableGateways();
  }

  /**
   * POST /api/v1/payments/initialize
   * Initialize a payment session with Paystack, Stripe, or PayPal.
   * Returns an authorization URL for frontend redirect.
   */
  @Post("initialize")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Initialize payment session",
    description:
      "Creates a payment session with the chosen provider (Paystack/Stripe/PayPal). " +
      "Returns an authorization URL to redirect the user for payment. " +
      "All charges are in NGN (Nigerian Naira).",
  })
  @ApiResponse({
    status: 200,
    description: "Payment session initialized — redirect user to authorizationUrl",
    type: InitializePaymentResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid request body or unsupported provider" })
  @ApiResponse({ status: 404, description: "Payment gateway not configured" })
  @ApiResponse({ status: 503, description: "Payment provider unavailable (API keys missing)" })
  async initialize(@Body() dto: InitializePaymentDto) {
    return this.paymentsService.initialize(dto);
  }

  /**
   * POST /api/v1/payments/verify/:reference
   * Verify a payment status by reference.
   * Fallback for when webhooks are delayed.
   */
  @Post("verify/:reference")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify payment status",
    description:
      "Checks the payment status with the provider. " +
      "Use this as a fallback if the webhook has not been received.",
  })
  @ApiResponse({
    status: 200,
    description: "Payment verification result",
    type: VerifyPaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: "Payment reference not found" })
  async verify(@Param("reference") reference: string, @Query("provider") provider?: string) {
    return this.paymentsService.verify(reference, provider);
  }

  /**
   * POST /api/v1/payments/bank-transfer
   * Submit a bank transfer receipt for manual approval.
   */
  @Post("bank-transfer")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("receipt", {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    })
  )
  @ApiConsumes("multipart/form-data", "application/json")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        payerName: { type: "string", example: "Adaeze Okafor" },
        payerEmail: { type: "string", example: "adaeze@example.com" },
        payerPhone: { type: "string", example: "+2348012345678" },
        amount: { type: "number", example: 150000 },
        currency: { type: "string", example: "NGN" },
        receiptUrl: { type: "string", nullable: true },
        metadata: {
          type: "string",
          nullable: true,
          description: "JSON stringified checkout metadata",
        },
        receipt: {
          type: "string",
          format: "binary",
          description: "Receipt file (PDF/JPG/PNG), max 10MB",
        },
      },
      required: ["payerName", "payerEmail", "payerPhone", "amount"],
    },
  })
  @ApiOperation({
    summary: "Submit bank transfer receipt",
    description:
      "Submit bank transfer details and receipt for manual admin verification. " +
      "Creates a payment with AWAITING_APPROVAL status. " +
      "Admin must approve via the admin panel before the user receives a signup link.",
  })
  @ApiResponse({
    status: 201,
    description: "Bank transfer receipt submitted — awaiting admin approval",
    type: BankTransferResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 503, description: "Bank transfer gateway disabled" })
  async submitBankTransfer(
    @Body() body: Record<string, unknown>,
    @UploadedFile() receipt?: Express.Multer.File
  ) {
    const metadata = this.parseMetadata(body.metadata);
    const amount = this.parseAmount(body.amount);

    const payerName = this.parseRequiredString(body.payerName, "payerName");
    const payerEmail = this.parseRequiredString(body.payerEmail, "payerEmail").toLowerCase();
    const payerPhone = this.parseRequiredString(body.payerPhone, "payerPhone");
    const currency = this.parseOptionalString(body.currency)?.toUpperCase() ?? "NGN";
    const receiptUrl = this.parseOptionalString(body.receiptUrl);
    const orderId = this.parseOptionalString(body.orderId);

    if (!receipt && !receiptUrl) {
      throw new BadRequestException("Upload a receipt file or provide receiptUrl");
    }

    return this.paymentsService.submitBankTransfer(
      {
        payerName,
        payerEmail,
        payerPhone,
        amount,
        currency,
        receiptUrl,
        orderId,
        metadata,
      },
      receipt
    );
  }

  // ────────────────────────────────────────────
  // Authenticated endpoints
  // ────────────────────────────────────────────

  @Get("bank-transfer/pending")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "List pending bank transfers",
    description:
      "Returns all bank-transfer payments awaiting approval, sorted oldest first with SLA age metadata.",
  })
  @ApiResponse({ status: 200, description: "Pending bank transfer payments" })
  @ApiResponse({ status: 401, description: "Unauthorized — JWT required" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  async listPendingBankTransfers() {
    return this.paymentsService.listPendingBankTransfers();
  }

  @Post("bank-transfer/:paymentId/approve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Approve bank transfer",
    description:
      "Approves a pending bank transfer. On approval, links user/order and sends signup link email.",
  })
  @ApiResponse({ status: 200, description: "Bank transfer approved" })
  @ApiResponse({ status: 400, description: "Payment is not awaiting approval" })
  @ApiResponse({ status: 404, description: "Payment not found" })
  async approveBankTransfer(
    @Param("paymentId") paymentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser("sub") adminId: string
  ) {
    return this.paymentsService.approveBankTransfer({
      paymentId,
      adminId,
      adminNote: this.parseOptionalString(body.adminNote),
    });
  }

  @Post("bank-transfer/:paymentId/reject")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Reject bank transfer",
    description: "Rejects a pending bank transfer with an admin note.",
  })
  @ApiResponse({ status: 200, description: "Bank transfer rejected" })
  @ApiResponse({ status: 400, description: "Payment is not awaiting approval or note missing" })
  @ApiResponse({ status: 404, description: "Payment not found" })
  async rejectBankTransfer(
    @Param("paymentId") paymentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser("sub") adminId: string
  ) {
    const adminNote = this.parseRequiredString(body.adminNote, "adminNote");
    return this.paymentsService.rejectBankTransfer({
      paymentId,
      adminId,
      adminNote,
    });
  }

  /**
   * POST /api/v1/payments/extra-pages
   * Pay for extra pages when the billing gate triggers.
   */
  @Post("extra-pages")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Pay for extra pages",
    description:
      "Initiates payment for extra pages when the book exceeds the bundle page limit. " +
      "Cost is ₦300 per extra page. Requires authentication.",
  })
  @ApiResponse({
    status: 200,
    description: "Extra pages payment initialized — redirect to authorizationUrl",
    type: InitializePaymentResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — JWT required" })
  @ApiResponse({ status: 404, description: "Book not found" })
  async payExtraPages(@Body() dto: ExtraPagesPaymentDto, @CurrentUser("sub") userId: string) {
    return this.paymentsService.payExtraPages({
      bookId: dto.bookId,
      provider: dto.provider,
      extraPages: dto.extraPages,
      callbackUrl: dto.callbackUrl ?? undefined,
      userId,
    });
  }

  /**
   * POST /api/v1/payments/reprint
   * Pay for a reprint order.
   */
  @Post("reprint")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Pay for reprint order",
    description:
      "Initiates payment for a reprint order. Requires authentication. " +
      "The order must belong to the authenticated user.",
  })
  @ApiResponse({
    status: 200,
    description: "Reprint payment initialized — redirect to authorizationUrl",
    type: InitializePaymentResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — JWT required" })
  @ApiResponse({ status: 404, description: "Order not found" })
  async payReprint(@Body() dto: ReprintPaymentDto, @CurrentUser("sub") userId: string) {
    return this.paymentsService.payReprint({
      orderId: dto.orderId,
      provider: dto.provider,
      callbackUrl: dto.callbackUrl ?? undefined,
      userId,
    });
  }

  // ────────────────────────────────────────────
  // Webhook endpoints
  // ────────────────────────────────────────────

  /**
   * POST /api/v1/payments/webhook/paystack
   * Paystack webhook — verifies x-paystack-signature header.
   * NEVER trust unverified webhook payloads (CLAUDE.md Section 11).
   */
  @Post("webhook/paystack")
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({
    summary: "Paystack webhook endpoint",
    description:
      "Receives webhook events from Paystack. " +
      "Verifies the x-paystack-signature header using HMAC SHA-512. " +
      "Idempotent — duplicate events are safely ignored.",
  })
  @ApiResponse({ status: 200, description: "Webhook processed (or already processed)" })
  @ApiResponse({ status: 400, description: "Invalid or missing signature" })
  async handlePaystackWebhook(
    @Body() body: Record<string, unknown>,
    @Headers("x-paystack-signature") signature: string
  ) {
    // 1. Validate signature presence
    if (!signature) {
      throw new BadRequestException("Missing x-paystack-signature header");
    }

    // 2. Get the raw body for signature verification
    const rawBody = JSON.stringify(body);

    // 3. Verify signature
    const isValid = this.paymentsService.verifyPaystackSignature(rawBody, signature);

    if (!isValid) {
      throw new BadRequestException("Invalid Paystack webhook signature");
    }

    // 4. Process the event
    return this.paymentsService.handlePaystackWebhook(
      body as unknown as Parameters<typeof this.paymentsService.handlePaystackWebhook>[0]
    );
  }

  /**
   * POST /api/v1/payments/webhook/stripe
   * Stripe webhook — verifies signature using raw body.
   * Requires raw body middleware on this route (configured in main.ts).
   */
  @Post("webhook/stripe")
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({
    summary: "Stripe webhook endpoint",
    description:
      "Receives webhook events from Stripe. " +
      "Verifies the Stripe-Signature header using the raw request body. " +
      "Idempotent — duplicate events are safely ignored.",
  })
  @ApiResponse({ status: 200, description: "Webhook processed (or already processed)" })
  @ApiResponse({ status: 400, description: "Invalid or missing signature" })
  async handleStripeWebhook(
    @Headers("stripe-signature") signature: string,
    @Req() req: RawBodyRequest<Request>
  ) {
    // 1. Validate signature header
    if (!signature) {
      throw new BadRequestException("Missing stripe-signature header");
    }

    // 2. Get raw body — set by rawBody middleware in main.ts
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException(
        "Raw body not available — ensure rawBody middleware is configured for this route"
      );
    }

    // 3. Verify signature via Stripe SDK
    const event = this.paymentsService.verifyStripeSignature(rawBody, signature);

    if (!event) {
      throw new BadRequestException("Invalid Stripe webhook signature");
    }

    // 4. Process the event
    return this.paymentsService.handleStripeWebhook(
      event as unknown as Parameters<typeof this.paymentsService.handleStripeWebhook>[0]
    );
  }

  private parseMetadata(value: unknown): Record<string, unknown> | undefined {
    if (!value) return undefined;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        throw new BadRequestException("metadata must be a JSON object");
      } catch {
        throw new BadRequestException("metadata must be valid JSON");
      }
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    throw new BadRequestException("metadata must be a JSON object");
  }

  private parseAmount(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    throw new BadRequestException("amount must be a positive number");
  }

  private parseRequiredString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private parseOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
}
