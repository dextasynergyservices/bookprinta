ALTER TABLE "Coupon"
ADD COLUMN IF NOT EXISTS "appliesToAll" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "CouponPackageScope" (
  "couponId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  CONSTRAINT "CouponPackageScope_pkey" PRIMARY KEY ("couponId", "packageId"),
  CONSTRAINT "CouponPackageScope_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CouponPackageScope_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CouponPackageScope_packageId_idx" ON "CouponPackageScope"("packageId");

CREATE TABLE IF NOT EXISTS "CouponCategoryScope" (
  "couponId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "CouponCategoryScope_pkey" PRIMARY KEY ("couponId", "categoryId"),
  CONSTRAINT "CouponCategoryScope_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CouponCategoryScope_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PackageCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CouponCategoryScope_categoryId_idx" ON "CouponCategoryScope"("categoryId");
