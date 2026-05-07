-- Add composite indexes on Notification for fast per-user unread count and paginated inbox.
-- Addresses fix 1.4 (missing [userId, isRead] index) and fix 4.1 (notification query bottleneck).

-- Primary fix: [userId, isRead] — covers getUnreadCount + Redis cache-miss fallback
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- Secondary: [userId, createdAt] — covers findUserNotifications ORDER BY createdAt DESC
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- Fix 1.5: [userId, type] — covers hasProductionDelayBanner EXISTS check (LIMIT 1 by type)
CREATE INDEX "Notification_userId_type_idx" ON "Notification"("userId", "type");
