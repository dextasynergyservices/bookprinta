import { z } from "zod";
import { BookTitleSchema, UserBookListItemSchema } from "./book.schema.ts";
import { NotificationUnreadCountResponseSchema } from "./notification.schema.ts";
import { BookStatusSchema, OrderStatusSchema, OrdersListItemSchema } from "./order.schema.ts";
import { SupportedLanguageSchema } from "./user.schema.ts";

// ==========================================
// Dashboard Schemas - Source of Truth
// Shared between frontend & backend
// ==========================================

export const DashboardPendingActionTypeSchema = z.enum([
  "UPLOAD_MANUSCRIPT",
  "REVIEW_PREVIEW",
  "PAY_EXTRA_PAGES",
  "COMPLETE_PROFILE",
  "REVIEW_BOOK",
  "RESOLVE_MANUSCRIPT_ISSUE",
]);
export type DashboardPendingActionType = z.infer<typeof DashboardPendingActionTypeSchema>;

export const DashboardPendingActionPrioritySchema = z.enum(["high", "medium", "low"]);
export type DashboardPendingActionPriority = z.infer<typeof DashboardPendingActionPrioritySchema>;

export const DashboardPendingActionSchema = z.object({
  type: DashboardPendingActionTypeSchema,
  priority: DashboardPendingActionPrioritySchema,
  href: z.string().trim().min(1),
  bookId: z.string().cuid().nullable(),
  orderId: z.string().cuid().nullable(),
  bookTitle: BookTitleSchema.nullable(),
  bookStatus: BookStatusSchema.nullable(),
  orderStatus: OrderStatusSchema.nullable(),
});
export type DashboardPendingAction = z.infer<typeof DashboardPendingActionSchema>;

export const DashboardPendingActionsSummarySchema = z.object({
  total: z.number().int().min(0),
  items: z.array(DashboardPendingActionSchema),
});
export type DashboardPendingActionsSummary = z.infer<typeof DashboardPendingActionsSummarySchema>;

export const DashboardOverviewProfileSchema = z.object({
  isProfileComplete: z.boolean(),
  preferredLanguage: SupportedLanguageSchema,
});
export type DashboardOverviewProfile = z.infer<typeof DashboardOverviewProfileSchema>;

export const DashboardOverviewNotificationsSchema = NotificationUnreadCountResponseSchema.extend({
  hasProductionDelayBanner: z.boolean(),
});
export type DashboardOverviewNotifications = z.infer<typeof DashboardOverviewNotificationsSchema>;

export const DashboardOverviewResponseSchema = z.object({
  activeBook: UserBookListItemSchema.nullable(),
  recentOrders: z.array(OrdersListItemSchema).max(5),
  notifications: DashboardOverviewNotificationsSchema,
  profile: DashboardOverviewProfileSchema,
  pendingActions: DashboardPendingActionsSummarySchema,
});
export type DashboardOverviewResponse = z.infer<typeof DashboardOverviewResponseSchema>;
