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
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import {
  BankTransferDto,
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
  async verify(@Param("reference") reference: string) {
    return this.paymentsService.verify(reference);
  }

  /**
   * POST /api/v1/payments/bank-transfer
   * Submit a bank transfer receipt for manual approval.
   */
  @Post("bank-transfer")
  @HttpCode(HttpStatus.CREATED)
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
  async submitBankTransfer(@Body() dto: BankTransferDto) {
    return this.paymentsService.submitBankTransfer(dto);
  }

  // ────────────────────────────────────────────
  // Authenticated endpoints
  // ────────────────────────────────────────────

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
}
