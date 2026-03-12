import { z } from "zod";

export const IsoDateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Date must be in YYYY-MM-DD format",
});
export type IsoDateOnly = z.infer<typeof IsoDateOnlySchema>;

export const AdminSortDirectionSchema = z.enum(["asc", "desc"]);
export type AdminSortDirection = z.infer<typeof AdminSortDirectionSchema>;

export const AdminRefundTypeSchema = z.enum(["FULL", "PARTIAL", "CUSTOM"]);
export type AdminRefundType = z.infer<typeof AdminRefundTypeSchema>;

export const AdminAuditEntrySchema = z.object({
  auditId: z.string().cuid(),
  action: z.string().trim().min(1).max(120),
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().cuid(),
  recordedAt: z.string().datetime(),
  recordedBy: z.string().cuid(),
  note: z.string().trim().min(1).max(1000).nullable(),
  reason: z.string().trim().min(1).max(240).nullable(),
});
export type AdminAuditEntry = z.infer<typeof AdminAuditEntrySchema>;
