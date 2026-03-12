import { z } from "zod";

// ==========================================
// Production Delay Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const ProductionDelayOverrideStateSchema = z.enum([
  "auto",
  "force_active",
  "force_inactive",
]);
export type ProductionDelayOverrideState = z.infer<typeof ProductionDelayOverrideStateSchema>;

export const ProductionDelayResolvedStateSourceSchema = z.enum(["auto", "manual_override", "none"]);
export type ProductionDelayResolvedStateSource = z.infer<
  typeof ProductionDelayResolvedStateSourceSchema
>;

export const ProductionDelayEventSourceSchema = z.enum(["AUTO", "MANUAL"]);
export type ProductionDelayEventSource = z.infer<typeof ProductionDelayEventSourceSchema>;

export const ProductionDelayActiveEventSchema = z.object({
  id: z.string().cuid(),
  source: ProductionDelayEventSourceSchema,
  activatedAt: z.string().datetime(),
});
export type ProductionDelayActiveEvent = z.infer<typeof ProductionDelayActiveEventSchema>;

/**
 * GET /api/v1/admin/system/production-status
 * POST /api/v1/admin/system/production-delay
 */
export const ProductionDelayStatusResponseSchema = z.object({
  threshold: z.number().int().min(1),
  backlogCount: z.number().int().min(0),
  affectedUserCount: z.number().int().min(0),
  autoDelayActive: z.boolean(),
  persistedDelayActive: z.boolean(),
  manualOverrideState: ProductionDelayOverrideStateSchema,
  isDelayActive: z.boolean(),
  resolvedDelayStateSource: ProductionDelayResolvedStateSourceSchema,
  activeEvent: ProductionDelayActiveEventSchema.nullable(),
});
export type ProductionDelayStatusResponse = z.infer<typeof ProductionDelayStatusResponseSchema>;

/**
 * POST /api/v1/admin/system/production-delay
 */
export const UpdateProductionDelayBodySchema = z.object({
  overrideState: ProductionDelayOverrideStateSchema,
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});
export type UpdateProductionDelayBodyInput = z.infer<typeof UpdateProductionDelayBodySchema>;
