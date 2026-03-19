-- Add analytics-friendly composite indexes for admin dashboard aggregations.
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

CREATE INDEX "Book_status_createdAt_idx" ON "Book"("status", "createdAt");

CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX "Payment_provider_status_createdAt_idx" ON "Payment"("provider", "status", "createdAt");
CREATE INDEX "Payment_type_status_createdAt_idx" ON "Payment"("type", "status", "createdAt");
