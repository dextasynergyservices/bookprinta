export class PrismaClient {
  async $connect(): Promise<void> {}

  async $disconnect(): Promise<void> {}
}

export const DiscountType = {
  PERCENTAGE: "PERCENTAGE",
  FIXED_AMOUNT: "FIXED_AMOUNT",
} as const;

export const BookStatus = {
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
} as const;

export const OrderStatus = {
  PAID: "PAID",
} as const;

export const PaymentProvider = {
  PAYSTACK: "PAYSTACK",
  STRIPE: "STRIPE",
  PAYPAL: "PAYPAL",
  BANK_TRANSFER: "BANK_TRANSFER",
} as const;

export const PaymentStatus = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
} as const;

export const PaymentType = {
  INITIAL: "INITIAL",
  EXTRA_PAGES: "EXTRA_PAGES",
  REPRINT: "REPRINT",
} as const;

export const UserRole = {
  USER: "USER",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

export const Prisma = {};
