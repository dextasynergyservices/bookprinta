import { z } from "zod";
import { PackageCategoryResponseSchema } from "./package.schema.ts";

// ==========================================
// Dashboard "Print a New Book" Schemas
// Source of Truth — Shared between frontend & backend
// ==========================================

// ──────────────────────────────────────────────
// GET /api/v1/dashboard/new-book
// Returns the same package-category structure as the public pricing page.
// ──────────────────────────────────────────────

export const DashboardNewBookPricingResponseSchema = z.object({
  categories: z.array(PackageCategoryResponseSchema),
});
export type DashboardNewBookPricingResponse = z.infer<typeof DashboardNewBookPricingResponseSchema>;

// ──────────────────────────────────────────────
// POST /api/v1/dashboard/new-book/order
// Authenticated user creates a new standard book order from the dashboard.
// The endpoint validates config, builds metadata, and initializes payment.
// ──────────────────────────────────────────────

/**
 * Addon selection in the dashboard new-book order.
 * `wordCount` is required when the addon has per-word pricing (formatting).
 */
export const DashboardNewBookAddonSchema = z.object({
  id: z.string().cuid(),
  slug: z.string().optional(),
  name: z.string().optional(),
  price: z.number().nonnegative(),
  wordCount: z.number().int().positive().optional(),
});
export type DashboardNewBookAddon = z.infer<typeof DashboardNewBookAddonSchema>;

export const DashboardNewBookOrderSchema = z.object({
  // Package & book configuration
  packageId: z.string().cuid(),
  hasCoverDesign: z.boolean(),
  hasFormatting: z.boolean(),
  bookSize: z.enum(["A4", "A5", "A6"]).default("A5"),
  paperColor: z.enum(["white", "cream"]).default("white"),
  lamination: z.enum(["matt", "gloss"]).default("gloss"),

  // Addons (optional array of selected addon IDs + pricing context)
  addons: z.array(DashboardNewBookAddonSchema).default([]),

  // Pricing (frontend-calculated, backend uses for payment initialization)
  basePrice: z.number().nonnegative(),
  addonTotal: z.number().nonnegative().default(0),
  totalPrice: z
    .number()
    .positive("Total price must be greater than zero")
    .max(10_000_000, "Amount cannot exceed ₦10,000,000"),
  couponCode: z.string().trim().max(50).optional(),

  // Payment method
  provider: z.enum(["PAYSTACK", "STRIPE", "PAYPAL", "BANK_TRANSFER"]),

  // Online payment callback (Paystack/Stripe/PayPal only)
  callbackUrl: z.string().url("Callback URL must be a valid URL").optional(),

  // Bank transfer receipt (required when provider is BANK_TRANSFER)
  receiptUrl: z.string().url("Receipt URL must be a valid URL").optional(),
});
export type DashboardNewBookOrderInput = z.infer<typeof DashboardNewBookOrderSchema>;

// ──────────────────────────────────────────────
// POST /api/v1/dashboard/new-book/order — Response
// Discriminated union: online payment redirect OR bank transfer confirmation.
// ──────────────────────────────────────────────

export const DashboardNewBookOnlineResponseSchema = z.object({
  type: z.literal("redirect"),
  authorizationUrl: z.string().url(),
  accessCode: z.string().optional(),
  reference: z.string(),
  provider: z.string(),
});

export const DashboardNewBookBankTransferResponseSchema = z.object({
  type: z.literal("bank_transfer"),
  message: z.string(),
  paymentId: z.string(),
});

export const DashboardNewBookOrderResponseSchema = z.discriminatedUnion("type", [
  DashboardNewBookOnlineResponseSchema,
  DashboardNewBookBankTransferResponseSchema,
]);
export type DashboardNewBookOrderResponse = z.infer<typeof DashboardNewBookOrderResponseSchema>;
