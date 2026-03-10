import { z } from "zod";

// ==========================================
// Notification Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const NotificationTypeSchema = z.enum([
  "ORDER_STATUS",
  "BANK_TRANSFER_RECEIVED",
  "PRODUCTION_DELAY",
  "REVIEW_REQUEST",
  "SYSTEM",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationToneSchema = z.enum(["default", "warning"]);
export type NotificationTone = z.infer<typeof NotificationToneSchema>;

export const NotificationPersistentBannerSchema = z.enum(["production_delay"]);
export type NotificationPersistentBanner = z.infer<typeof NotificationPersistentBannerSchema>;

export const NotificationNoActionSchema = z.object({
  kind: z.literal("none"),
});
export type NotificationNoAction = z.infer<typeof NotificationNoActionSchema>;

export const NotificationNavigateActionSchema = z.object({
  kind: z.literal("navigate"),
  href: z.string().min(1),
});
export type NotificationNavigateAction = z.infer<typeof NotificationNavigateActionSchema>;

export const NotificationOpenReviewDialogActionSchema = z.object({
  kind: z.literal("open_review_dialog"),
  bookId: z.string().cuid(),
});
export type NotificationOpenReviewDialogAction = z.infer<
  typeof NotificationOpenReviewDialogActionSchema
>;

export const NotificationActionSchema = z.discriminatedUnion("kind", [
  NotificationNoActionSchema,
  NotificationNavigateActionSchema,
  NotificationOpenReviewDialogActionSchema,
]);
export type NotificationAction = z.infer<typeof NotificationActionSchema>;

export const NotificationEntitySchema = z.object({
  orderId: z.string().cuid().optional(),
  bookId: z.string().cuid().optional(),
});
export type NotificationEntity = z.infer<typeof NotificationEntitySchema>;

export const NotificationPresentationSchema = z.object({
  tone: NotificationToneSchema.optional(),
  persistentBanner: NotificationPersistentBannerSchema.optional(),
});
export type NotificationPresentation = z.infer<typeof NotificationPresentationSchema>;

export const NotificationTemplateParamsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number().finite()])
);
export type NotificationTemplateParams = z.infer<typeof NotificationTemplateParamsSchema>;

export const NotificationDataSchema = z.object({
  titleKey: z.string().min(1),
  messageKey: z.string().min(1),
  params: NotificationTemplateParamsSchema.optional(),
  entity: NotificationEntitySchema.optional(),
  action: NotificationActionSchema.optional(),
  presentation: NotificationPresentationSchema.optional(),
});
export type NotificationData = z.infer<typeof NotificationDataSchema>;

export const NotificationItemSchema = z.object({
  id: z.string().cuid(),
  type: NotificationTypeSchema,
  isRead: z.boolean(),
  createdAt: z.string().datetime(),
  data: NotificationDataSchema,
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

/**
 * GET /api/v1/notifications?page=1&limit=20
 */
export const NotificationsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationsListQueryInput = z.infer<typeof NotificationsListQuerySchema>;

export const NotificationsPaginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasPreviousPage: z.boolean(),
  hasNextPage: z.boolean(),
});
export type NotificationsPagination = z.infer<typeof NotificationsPaginationSchema>;

/**
 * GET /api/v1/notifications
 */
export const NotificationsListResponseSchema = z.object({
  items: z.array(NotificationItemSchema),
  pagination: NotificationsPaginationSchema,
});
export type NotificationsListResponse = z.infer<typeof NotificationsListResponseSchema>;

/**
 * GET /api/v1/notifications/unread-count
 */
export const NotificationUnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0),
});
export type NotificationUnreadCountResponse = z.infer<typeof NotificationUnreadCountResponseSchema>;

/**
 * Common path param for /notifications/:id routes
 */
export const NotificationIdParamsSchema = z.object({
  id: z.string().cuid(),
});
export type NotificationIdParamsInput = z.infer<typeof NotificationIdParamsSchema>;

/**
 * PATCH /api/v1/notifications/:id/read
 */
export const NotificationMarkReadResponseSchema = z.object({
  notification: NotificationItemSchema,
});
export type NotificationMarkReadResponse = z.infer<typeof NotificationMarkReadResponseSchema>;

/**
 * PATCH /api/v1/notifications/read-all
 */
export const NotificationMarkAllReadResponseSchema = z.object({
  updatedCount: z.number().int().min(0),
});
export type NotificationMarkAllReadResponse = z.infer<typeof NotificationMarkAllReadResponseSchema>;
