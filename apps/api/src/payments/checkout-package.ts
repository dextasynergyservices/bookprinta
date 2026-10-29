import type { PrismaService } from "../prisma/prisma.service.js";
import { asString, type CheckoutMetadata } from "./payment-metadata.js";

/**
 * The active BookPrinta package a checkout refers to: by id first, then by slug
 * (or the legacy `tier` name). Inactive packages, and packages in an inactive
 * category, never match.
 *
 * Also the ownership test for Paystack charges on the shared account: a charge
 * whose package does not resolve is not one of ours.
 */
export async function resolvePackageFromCheckoutMetadata(
  prisma: Pick<PrismaService, "package">,
  checkout: CheckoutMetadata
) {
  const packageId = asString(checkout.packageId);
  if (packageId) {
    const byId = await prisma.package.findFirst({
      where: {
        id: packageId,
        isActive: true,
        category: { isActive: true },
      },
    });
    if (byId) return byId;
  }

  const packageSlug = asString(checkout.packageSlug) || asString(checkout.tier);
  if (!packageSlug) return null;

  return prisma.package.findFirst({
    where: {
      slug: packageSlug,
      isActive: true,
      category: { isActive: true },
    },
  });
}
