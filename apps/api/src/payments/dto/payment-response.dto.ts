import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// ──────────────────────────────────────────────
// Response DTOs — manual classes for Swagger documentation.
// Used as the @ApiResponse({ type }) on controller methods.
// ──────────────────────────────────────────────

/** Response returned by POST /api/v1/payments/initialize. */
export class InitializePaymentResponseDto {
  @ApiProperty({
    description: "URL to redirect the user to for payment",
    example: "https://checkout.paystack.com/abcdef123456",
  })
  authorizationUrl!: string;

  @ApiPropertyOptional({
    description: "Paystack access code (Paystack only)",
    example: "access_abcdef",
  })
  accessCode?: string;

  @ApiProperty({
    description: "Unique payment reference for verification",
    example: "bp_txn_abc123def456",
  })
  reference!: string;

  @ApiProperty({
    description: "Payment provider used",
    enum: ["PAYSTACK", "STRIPE", "PAYPAL"],
    example: "PAYSTACK",
  })
  provider!: string;
}

/** Response returned by POST /api/v1/payments/verify/:reference. */
export class VerifyPaymentResponseDto {
  @ApiProperty({
    description: "Payment status from the provider",
    example: "success",
  })
  status!: string;

  @ApiProperty({
    description: "Provider reference",
    example: "bp_txn_abc123def456",
  })
  reference!: string;

  @ApiProperty({
    description: "Amount in Naira",
    example: 75000,
  })
  amount!: number | null;

  @ApiProperty({
    description: "Currency code",
    example: "NGN",
  })
  currency!: string | null;

  @ApiProperty({
    description: "Whether the payment was verified as successful",
    example: true,
  })
  verified!: boolean;

  @ApiPropertyOptional({
    description:
      "Signup completion URL. Available once webhook-created user/order state is ready for /signup/finish.",
    example: "https://bookprinta.com/en/signup/finish?token=abc123",
    nullable: true,
  })
  signupUrl?: string | null;

  @ApiPropertyOptional({
    description: "True when provider confirms payment but webhook linking is still in progress.",
    example: true,
  })
  awaitingWebhook?: boolean;
}

/** Response returned by POST /api/v1/payments/bank-transfer. */
export class BankTransferResponseDto {
  @ApiProperty({
    description: "Payment record ID",
    example: "clxyz1234567890",
  })
  id!: string;

  @ApiProperty({
    description: "Payment status (always AWAITING_APPROVAL for bank transfers)",
    example: "AWAITING_APPROVAL",
  })
  status!: string;

  @ApiProperty({
    description: "Confirmation message",
    example:
      "Your payment is being verified. You will receive an email once approved. This typically takes less than 30 minutes.",
  })
  message!: string;
}

/** Generic payment record response. */
export class PaymentResponseDto {
  @ApiProperty({ description: "Payment ID", example: "clxyz1234567890" })
  id!: string;

  @ApiPropertyOptional({
    description: "Linked order ID",
    example: "clxyz0987654321",
    nullable: true,
  })
  orderId!: string | null;

  @ApiProperty({
    description: "Payment provider",
    enum: ["PAYSTACK", "STRIPE", "PAYPAL", "BANK_TRANSFER"],
    example: "PAYSTACK",
  })
  provider!: string;

  @ApiProperty({
    description: "Payment type",
    enum: ["INITIAL", "EXTRA_PAGES", "MANUAL_ADJUSTMENT", "CUSTOM_QUOTE", "REFUND", "REPRINT"],
    example: "INITIAL",
  })
  type!: string;

  @ApiProperty({
    description: "Amount in Naira",
    example: 75000,
  })
  amount!: number;

  @ApiProperty({ description: "Currency code", example: "NGN" })
  currency!: string;

  @ApiProperty({
    description: "Payment status",
    enum: ["PENDING", "SUCCESS", "AWAITING_APPROVAL", "FAILED", "REFUNDED"],
    example: "SUCCESS",
  })
  status!: string;

  @ApiPropertyOptional({
    description: "Provider reference",
    nullable: true,
    example: "bp_txn_abc123",
  })
  providerRef!: string | null;

  @ApiPropertyOptional({
    description: "Receipt URL (bank transfers)",
    nullable: true,
  })
  receiptUrl!: string | null;

  @ApiPropertyOptional({
    description: "Payer name",
    nullable: true,
    example: "Alison Doe",
  })
  payerName!: string | null;

  @ApiPropertyOptional({
    description: "Payer email",
    nullable: true,
    example: "alison@example.com",
  })
  payerEmail!: string | null;

  @ApiProperty({
    description: "Created timestamp",
    example: "2026-02-23T14:30:00.000Z",
  })
  createdAt!: string;
}

/** Payment gateway info (for frontend to show available options). */
export class PaymentGatewayResponseDto {
  @ApiProperty({ description: "Gateway ID", example: "clxyz1234567890" })
  id!: string;

  @ApiProperty({
    description: "Provider name",
    enum: ["PAYSTACK", "STRIPE", "PAYPAL", "BANK_TRANSFER"],
    example: "PAYSTACK",
  })
  provider!: string;

  @ApiProperty({ description: "Display name", example: "Paystack" })
  name!: string;

  @ApiProperty({ description: "Whether this gateway is enabled", example: true })
  isEnabled!: boolean;

  @ApiProperty({ description: "Whether this gateway is in test mode", example: true })
  isTestMode!: boolean;

  @ApiPropertyOptional({
    description: "Bank account details (bank transfer only)",
    nullable: true,
  })
  bankDetails!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: "Payment instructions (bank transfer only)",
    nullable: true,
  })
  instructions!: string | null;

  @ApiProperty({ description: "Display priority (lower = first)", example: 1 })
  priority!: number;
}
