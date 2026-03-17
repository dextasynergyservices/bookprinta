import { z } from "zod";

// ==========================================
// Custom Quote Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

/**
 * Supported print sizes for custom quotes (Path B).
 */
export const QuoteBookSizeSchema = z.enum(["A4", "A5", "A6"]);
export type QuoteBookSize = z.infer<typeof QuoteBookSizeSchema>;

/**
 * Current custom quote cover type.
 * Path B only supports paperback at this stage.
 */
export const QuoteCoverTypeSchema = z.enum(["paperback"]);
export type QuoteCoverType = z.infer<typeof QuoteCoverTypeSchema>;

/**
 * Allowed special-requirement options from Step 3.
 */
export const QuoteSpecialRequirementSchema = z.enum([
  "hardback",
  "embossing",
  "gold_foil",
  "special_size",
  "full_color_interior",
  "special_paper",
  "other",
]);
export type QuoteSpecialRequirement = z.infer<typeof QuoteSpecialRequirementSchema>;

/**
 * Quote lifecycle status values aligned with Prisma `QuoteStatus`.
 */
export const QuoteStatusSchema = z.enum([
  "PENDING",
  "REVIEWING",
  "PAYMENT_LINK_SENT",
  "PAID",
  "COMPLETED",
  "REJECTED",
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

/**
 * POST /api/v1/quotes/estimate
 */
export const QuoteEstimateSchema = z.object({
  estimatedWordCount: z
    .number()
    .int("Estimated word count must be an integer")
    .min(1, "Estimated word count must be at least 1"),
  bookSize: QuoteBookSizeSchema,
  quantity: z.number().int("Quantity must be an integer").min(1, "Quantity must be at least 1"),
});
export type QuoteEstimateInput = z.infer<typeof QuoteEstimateSchema>;

/**
 * Response for POST /api/v1/quotes/estimate
 */
export const QuoteEstimateResponseSchema = z.object({
  estimatedPriceLow: z.number().int().min(0),
  estimatedPriceHigh: z.number().int().min(0),
});
export type QuoteEstimateResponse = z.infer<typeof QuoteEstimateResponseSchema>;

const QuoteSpecialRequirementsArraySchema = z
  .array(QuoteSpecialRequirementSchema)
  .max(7, "Too many special requirements selected")
  .default([]);

/**
 * POST /api/v1/quotes
 * Final payload submitted from the 4-step custom quote wizard.
 */
export const CreateQuoteSchema = z
  .object({
    // Step 1
    workingTitle: z
      .string()
      .trim()
      .min(1, "Working title is required")
      .max(200, "Working title must be at most 200 characters"),
    estimatedWordCount: z
      .number()
      .int("Estimated word count must be an integer")
      .min(1, "Estimated word count must be at least 1"),

    // Step 2
    bookSize: QuoteBookSizeSchema,
    quantity: z.number().int("Quantity must be an integer").min(1, "Quantity must be at least 1"),
    coverType: QuoteCoverTypeSchema.default("paperback"),

    // Step 3
    hasSpecialReqs: z.boolean(),
    specialRequirements: QuoteSpecialRequirementsArraySchema,
    specialRequirementsOther: z
      .string()
      .trim()
      .max(2000, "Special requirements details are too long")
      .optional()
      .or(z.literal("")),

    // Step 4
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(120, "Full name must be at most 120 characters"),
    email: z.string().trim().email("Please enter a valid email address"),
    phone: z
      .string()
      .trim()
      .min(7, "Phone number must be at least 7 characters")
      .max(30, "Phone number is too long")
      .refine((value) => value.replace(/\D/g, "").length >= 7, {
        message: "Phone number must contain at least 7 digits",
      }),

    // Estimator
    estimatedPriceLow: z.number().int().min(0).nullable().optional(),
    estimatedPriceHigh: z.number().int().min(0).nullable().optional(),

    // Public-form security
    recaptchaToken: z.string().min(1, "reCAPTCHA verification failed").optional(),
  })
  .superRefine((data, ctx) => {
    const specialRequirements = data.specialRequirements ?? [];
    const specialRequirementsOther = (data.specialRequirementsOther ?? "").trim();
    const hasOtherSelected = specialRequirements.includes("other");
    const hasDuplicateSpecialRequirements =
      new Set(specialRequirements).size !== specialRequirements.length;

    if (hasDuplicateSpecialRequirements) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirements"],
        message: "Special requirements cannot contain duplicates",
      });
    }

    if (data.hasSpecialReqs && specialRequirements.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirements"],
        message: "Select at least one special requirement",
      });
    }

    if (!data.hasSpecialReqs && specialRequirements.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirements"],
        message: "Special requirements must be empty when hasSpecialReqs is false",
      });
    }

    if (hasOtherSelected && specialRequirementsOther.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirementsOther"],
        message: "Please describe your other special requirements",
      });
    }

    if (!hasOtherSelected && specialRequirementsOther.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirementsOther"],
        message: "Only provide other details when 'other' is selected",
      });
    }

    if (data.hasSpecialReqs) {
      if (data.estimatedPriceLow != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["estimatedPriceLow"],
          message: "Estimated price must be null when special requirements are selected",
        });
      }
      if (data.estimatedPriceHigh != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["estimatedPriceHigh"],
          message: "Estimated price must be null when special requirements are selected",
        });
      }
      return;
    }

    if (data.estimatedPriceLow == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedPriceLow"],
        message: "Estimated low price is required when no special requirements are selected",
      });
    }

    if (data.estimatedPriceHigh == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedPriceHigh"],
        message: "Estimated high price is required when no special requirements are selected",
      });
    }

    if (
      data.estimatedPriceLow != null &&
      data.estimatedPriceHigh != null &&
      data.estimatedPriceHigh < data.estimatedPriceLow
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedPriceHigh"],
        message: "Estimated high price must be greater than or equal to estimated low price",
      });
    }
  });
export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

/**
 * Minimal response for successful quote submission.
 */
export const CreateQuoteResponseSchema = z.object({
  id: z.string().cuid(),
  status: QuoteStatusSchema,
  message: z.string(),
});
export type CreateQuoteResponse = z.infer<typeof CreateQuoteResponseSchema>;

// ==========================================
// Quote Payment-Link Contracts (Phase 0)
// ==========================================

/**
 * All quote payment links expire after 7 days from generation.
 */
export const QUOTE_PAYMENT_LINK_VALIDITY_DAYS = 7;
export const QUOTE_PAYMENT_LINK_VALIDITY_MS =
  QUOTE_PAYMENT_LINK_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Status filter options for the admin quotes list.
 * These map directly to QuoteStatus values in DB/API.
 */
export const AdminQuoteListStatusSchema = z.enum([
  "PENDING",
  "PAYMENT_LINK_SENT",
  "PAID",
  "REJECTED",
]);
export type AdminQuoteListStatus = z.infer<typeof AdminQuoteListStatusSchema>;

/**
 * Sort fields supported by admin quote list endpoint.
 */
export const AdminQuoteSortFieldSchema = z.enum([
  "createdAt",
  "updatedAt",
  "fullName",
  "email",
  "workingTitle",
  "bookPrintSize",
  "quantity",
  "status",
  "finalPrice",
]);
export type AdminQuoteSortField = z.infer<typeof AdminQuoteSortFieldSchema>;

export const AdminQuoteSortDirectionSchema = z.enum(["asc", "desc"]);
export type AdminQuoteSortDirection = z.infer<typeof AdminQuoteSortDirectionSchema>;

/**
 * Derived lifecycle for payment-link presentation in admin/public UI.
 * NOTE: This does not replace QuoteStatus and is computed from quote status + token validity.
 */
export const QuotePaymentLinkDisplayStatusSchema = z.enum(["NOT_SENT", "SENT", "EXPIRED", "PAID"]);
export type QuotePaymentLinkDisplayStatus = z.infer<typeof QuotePaymentLinkDisplayStatusSchema>;

export const QuoteEstimatePresentationSchema = z.object({
  mode: z.enum(["RANGE", "MANUAL_REQUIRED"]),
  estimatedPriceLow: z.number().int().min(0).nullable(),
  estimatedPriceHigh: z.number().int().min(0).nullable(),
  label: z.string().min(1),
});
export type QuoteEstimatePresentation = z.infer<typeof QuoteEstimatePresentationSchema>;

/**
 * GET /api/v1/admin/quotes query
 */
export const AdminQuotesListQuerySchema = z.object({
  cursor: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: AdminQuoteListStatusSchema.optional(),
  q: z.string().trim().max(200).optional(),
  sortBy: AdminQuoteSortFieldSchema.default("createdAt"),
  sortDirection: AdminQuoteSortDirectionSchema.default("desc"),
});
export type AdminQuotesListQuery = z.infer<typeof AdminQuotesListQuerySchema>;

export const AdminQuotesListItemSchema = z.object({
  id: z.string().cuid(),
  fullName: z.string(),
  email: z.string().email(),
  workingTitle: z.string(),
  bookPrintSize: QuoteBookSizeSchema,
  quantity: z.number().int().min(1),
  estimate: QuoteEstimatePresentationSchema,
  status: QuoteStatusSchema,
  paymentLinkStatus: QuotePaymentLinkDisplayStatusSchema,
  actions: z.object({
    canReject: z.boolean(),
    canArchive: z.boolean(),
    canDelete: z.boolean(),
    canRevokePaymentLink: z.boolean(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminQuotesListItem = z.infer<typeof AdminQuotesListItemSchema>;

export const AdminQuotesListResponseSchema = z.object({
  items: z.array(AdminQuotesListItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  totalItems: z.number().int().min(0),
  limit: z.number().int().min(1),
  sortBy: AdminQuoteSortFieldSchema,
  sortDirection: AdminQuoteSortDirectionSchema,
  sortableFields: z.array(AdminQuoteSortFieldSchema),
});
export type AdminQuotesListResponse = z.infer<typeof AdminQuotesListResponseSchema>;

/**
 * GET /api/v1/admin/quotes/:id
 */
export const AdminQuoteContactSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string(),
});
export type AdminQuoteContact = z.infer<typeof AdminQuoteContactSchema>;

export const AdminQuoteManuscriptSchema = z.object({
  workingTitle: z.string(),
  estimatedWordCount: z.number().int().min(1),
});
export type AdminQuoteManuscript = z.infer<typeof AdminQuoteManuscriptSchema>;

export const AdminQuotePrintSchema = z.object({
  bookPrintSize: QuoteBookSizeSchema,
  quantity: z.number().int().min(1),
  coverType: QuoteCoverTypeSchema,
});
export type AdminQuotePrint = z.infer<typeof AdminQuotePrintSchema>;

export const AdminQuoteSpecialRequirementsSchema = z.object({
  hasSpecialReqs: z.boolean(),
  specialReqs: z.array(QuoteSpecialRequirementSchema),
  specialReqsOther: z.string().nullable(),
});
export type AdminQuoteSpecialRequirements = z.infer<typeof AdminQuoteSpecialRequirementsSchema>;

export const QuotePaymentLinkSummarySchema = z.object({
  token: z.string().nullable(),
  url: z.string().url().nullable(),
  expiresAt: z.string().datetime().nullable(),
  generatedAt: z.string().datetime().nullable(),
  displayStatus: QuotePaymentLinkDisplayStatusSchema,
  validityDays: z.number().int().min(1),
});
export type QuotePaymentLinkSummary = z.infer<typeof QuotePaymentLinkSummarySchema>;

export const AdminQuoteDetailSchema = z.object({
  id: z.string().cuid(),
  status: QuoteStatusSchema,
  manuscript: AdminQuoteManuscriptSchema,
  print: AdminQuotePrintSchema,
  specialRequirements: AdminQuoteSpecialRequirementsSchema,
  contact: AdminQuoteContactSchema,
  estimate: QuoteEstimatePresentationSchema,
  adminNotes: z.string().nullable(),
  finalPrice: z.number().int().min(0).nullable(),
  actions: z.object({
    canReject: z.boolean(),
    canArchive: z.boolean(),
    canDelete: z.boolean(),
    canRevokePaymentLink: z.boolean(),
  }),
  paymentLink: QuotePaymentLinkSummarySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminQuoteDetail = z.infer<typeof AdminQuoteDetailSchema>;

/**
 * PATCH /api/v1/admin/quotes/:id
 * Used by auto-save notes (on blur) and final price updates.
 */
export const AdminQuotePatchSchema = z
  .object({
    adminNotes: z.string().trim().max(5000).nullable().optional(),
    finalPrice: z.number().int().min(1).nullable().optional(),
    email: z.string().trim().email("Please enter a valid email address").optional(),
    phone: z
      .string()
      .trim()
      .min(7, "Phone number must be at least 7 characters")
      .max(30, "Phone number is too long")
      .refine((value) => value.replace(/\D/g, "").length >= 7, {
        message: "Phone number must contain at least 7 digits",
      })
      .optional(),
  })
  .refine(
    (value) =>
      value.adminNotes !== undefined ||
      value.finalPrice !== undefined ||
      value.email !== undefined ||
      value.phone !== undefined,
    {
      message: "At least one field must be provided",
    }
  );
export type AdminQuotePatchInput = z.infer<typeof AdminQuotePatchSchema>;

export const AdminQuotePatchResponseSchema = z.object({
  id: z.string().cuid(),
  status: QuoteStatusSchema,
  adminNotes: z.string().nullable(),
  finalPrice: z.number().int().min(0).nullable(),
  contact: z.object({
    email: z.string().email(),
    phone: z.string(),
  }),
  updatedAt: z.string().datetime(),
});
export type AdminQuotePatchResponse = z.infer<typeof AdminQuotePatchResponseSchema>;

/**
 * POST /api/v1/admin/quotes/:id/payment-link
 */
export const GenerateQuotePaymentLinkSchema = z.object({
  finalPrice: z.number().int().min(1),
});
export type GenerateQuotePaymentLinkInput = z.infer<typeof GenerateQuotePaymentLinkSchema>;

export const QuoteDeliveryChannelStatusSchema = z.object({
  attempted: z.boolean(),
  delivered: z.boolean(),
  failureReason: z.string().nullable(),
});
export type QuoteDeliveryChannelStatus = z.infer<typeof QuoteDeliveryChannelStatusSchema>;

export const QuotePaymentLinkDeliveryStatusSchema = z.object({
  attemptedAt: z.string().datetime(),
  email: QuoteDeliveryChannelStatusSchema,
  whatsapp: QuoteDeliveryChannelStatusSchema,
});
export type QuotePaymentLinkDeliveryStatus = z.infer<typeof QuotePaymentLinkDeliveryStatusSchema>;

export const GenerateQuotePaymentLinkResponseSchema = z.object({
  id: z.string().cuid(),
  status: z.literal("PAYMENT_LINK_SENT"),
  paymentLink: QuotePaymentLinkSummarySchema,
  delivery: QuotePaymentLinkDeliveryStatusSchema,
});
export type GenerateQuotePaymentLinkResponse = z.infer<
  typeof GenerateQuotePaymentLinkResponseSchema
>;

/**
 * DELETE /api/v1/admin/quotes/:id/payment-link
 */
export const AdminRevokeQuotePaymentLinkSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  notifyCustomer: z.boolean().default(false),
  customerMessage: z.string().trim().max(1000).nullable().optional(),
});
export type AdminRevokeQuotePaymentLinkInput = z.infer<typeof AdminRevokeQuotePaymentLinkSchema>;

export const RevokeQuotePaymentLinkResponseSchema = z.object({
  id: z.string().cuid(),
  status: QuoteStatusSchema,
  paymentLink: QuotePaymentLinkSummarySchema,
  delivery: z.object({
    email: QuoteDeliveryChannelStatusSchema,
  }),
  revoked: z.literal(true),
});
export type RevokeQuotePaymentLinkResponse = z.infer<typeof RevokeQuotePaymentLinkResponseSchema>;

/**
 * PATCH /api/v1/admin/quotes/:id/reject
 */
export const AdminRejectQuoteSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type AdminRejectQuoteInput = z.infer<typeof AdminRejectQuoteSchema>;

/**
 * PATCH /api/v1/admin/quotes/:id/archive
 */
export const AdminArchiveQuoteSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type AdminArchiveQuoteInput = z.infer<typeof AdminArchiveQuoteSchema>;

/**
 * DELETE /api/v1/admin/quotes/:id
 */
export const AdminDeleteQuoteSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  confirmText: z.literal("DELETE"),
});
export type AdminDeleteQuoteInput = z.infer<typeof AdminDeleteQuoteSchema>;

export const AdminQuoteActionResponseSchema = z.object({
  id: z.string().cuid(),
  status: QuoteStatusSchema,
  updatedAt: z.string().datetime(),
});
export type AdminQuoteActionResponse = z.infer<typeof AdminQuoteActionResponseSchema>;

export const AdminDeleteQuoteResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
  deletedAt: z.string().datetime(),
});
export type AdminDeleteQuoteResponse = z.infer<typeof AdminDeleteQuoteResponseSchema>;

// ==========================================
// Public payment-link contracts
// ==========================================

export const PublicQuotePaymentTokenStatusSchema = z.enum([
  "VALID",
  "EXPIRED",
  "PAID",
  "REVOKED",
  "NOT_FOUND",
]);
export type PublicQuotePaymentTokenStatus = z.infer<typeof PublicQuotePaymentTokenStatusSchema>;

/**
 * GET /api/v1/pay/:token
 */
export const ResolveQuotePaymentTokenResponseSchema = z.object({
  tokenStatus: PublicQuotePaymentTokenStatusSchema,
  quote: z
    .object({
      id: z.string().cuid(),
      workingTitle: z.string(),
      fullName: z.string(),
      email: z.string().email(),
      bookPrintSize: QuoteBookSizeSchema,
      quantity: z.number().int().min(1),
      finalPrice: z.number().int().min(1),
      status: QuoteStatusSchema,
      paymentLinkExpiresAt: z.string().datetime().nullable(),
    })
    .nullable(),
  message: z.string().nullable().optional(),
});
export type ResolveQuotePaymentTokenResponse = z.infer<
  typeof ResolveQuotePaymentTokenResponseSchema
>;

export const QuotePaymentProviderSchema = z.enum(["PAYSTACK", "STRIPE", "BANK_TRANSFER"]);
export type QuotePaymentProvider = z.infer<typeof QuotePaymentProviderSchema>;

/**
 * POST /api/v1/pay/:token
 */
export const PayQuoteByTokenSchema = z.object({
  provider: QuotePaymentProviderSchema,
});
export type PayQuoteByTokenInput = z.infer<typeof PayQuoteByTokenSchema>;

export const PayQuoteByTokenResponseSchema = z.object({
  quoteId: z.string().cuid(),
  orderId: z.string().cuid().nullable(),
  status: z.enum(["PAID", "PENDING_PAYMENT", "PENDING_PAYMENT_APPROVAL"]),
  redirectTo: z.string().min(1),
  skipFormatting: z.literal(true),
});
export type PayQuoteByTokenResponse = z.infer<typeof PayQuoteByTokenResponseSchema>;
