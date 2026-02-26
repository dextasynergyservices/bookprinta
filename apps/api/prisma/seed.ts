import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { buildGatewaySeedsFromEnv } from "./payment-gateways.seed.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ──────────────────────────────────────────────
// Package Category + Package seed data
// ──────────────────────────────────────────────

interface PackageTemplateSeed {
  tier: 1 | 2 | 3;
  basePrice: number;
  pageLimit: number;
  description: string;
  includesISBN: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
}

interface PackageCategorySeed {
  name: string;
  slug: string;
  description: string;
  copies: number;
  tierPrices?: Partial<Record<PackageTemplateSeed["tier"], number>>;
  sortOrder: number;
  isActive: boolean;
  packageNamePrefix: string;
  packageSlugPrefix: string;
}

const packageTemplates: PackageTemplateSeed[] = [
  {
    tier: 1,
    basePrice: 75_000,
    pageLimit: 100,
    description: "For authors starting out",
    includesISBN: false,
    isActive: true,
    sortOrder: 0,
    features: [
      "300gsm Cover",
      "80gsm pages",
      "Up to 100 pages",
      "Paperback cover",
      "White/Cream pages",
      "Matte/Gloss cover",
      "Website listing",
    ],
  },
  {
    tier: 2,
    basePrice: 125_000,
    pageLimit: 150,
    description: "For authors who want more",
    includesISBN: true,
    isActive: true,
    sortOrder: 1,
    features: [
      "300gsm Cover",
      "80gsm pages",
      "Up to 150 pages",
      "Paperback cover",
      "White/Cream pages",
      "Matte/Gloss cover",
      "ISBN & barcode",
      "3 e-Marketing Flyers",
      "25 Promo Bookmarks",
      "Website listing",
    ],
  },
  {
    tier: 3,
    basePrice: 200_000,
    pageLimit: 200,
    description: "For authors concerned about legacy",
    includesISBN: true,
    isActive: true,
    sortOrder: 2,
    features: [
      "300gsm Cover",
      "80gsm pages",
      "Up to 200 pages",
      "Paperback cover",
      "White/Cream pages",
      "Matte/Gloss cover",
      "ISBN & barcode",
      "3 e-Marketing Flyers",
      "50 Promo Flyers",
      "25 Promo Bookmarks",
      "Website listing",
      "E-book (PDF + ePub)",
      "Featured spotlight (New Book Ad on Website, 3 Posts on official Socials)",
    ],
  },
];

const packageCategories: PackageCategorySeed[] = [
  {
    name: "Author Lunch",
    slug: "author-lunch",
    description: "For author-focused publishing bundles with fixed default copies.",
    copies: 25,
    sortOrder: 0,
    isActive: true,
    packageNamePrefix: "Author Launch",
    packageSlugPrefix: "author-launch",
  },
  {
    name: "Dexta Lunch",
    slug: "dexta-lunch",
    description: "For Dexta-focused publishing bundles with fixed default copies.",
    copies: 35,
    tierPrices: {
      1: 250_000,
      2: 300_000,
      3: 350_000,
    },
    sortOrder: 1,
    isActive: true,
    packageNamePrefix: "Dexta Launch",
    packageSlugPrefix: "dexta-launch",
  },
];

const copyProfiles: Record<number, { A4: number; A5: number; A6: number }> = {
  25: { A4: 12, A5: 25, A6: 50 },
  35: { A4: 15, A5: 35, A6: 70 },
};

function getCopyProfile(copies: number): { A4: number; A5: number; A6: number } {
  const profile = copyProfiles[copies];
  if (profile) return profile;
  return { A4: copies, A5: copies, A6: copies };
}

function getCopyFeature(copies: number): string {
  const profile = getCopyProfile(copies);
  return `${profile.A5} copies, A5 size (or ${profile.A6} copies, A6 size, or ${profile.A4} copies, A4 size)`;
}

// ──────────────────────────────────────────────
// Addon seed data (Cover Design → Content Formatting → ISBN + Barcode)
// ──────────────────────────────────────────────
// Notes:
// - "fixed" addons: `price` is the flat NGN cost, `pricePerWord` is null.
// - "per_word" addons: `price` is 0.00 (placeholder — actual cost = wordCount × pricePerWord
//   at checkout), `pricePerWord` is the per-word rate.
// - ISBN + Barcode price is only charged when the user's selected package has
//   includesISBN: false. When true (Glow Up, Legacy), the addon is auto-selected,
//   disabled, and its price is NOT added to the order total. That logic lives in the
//   checkout UI / pricing calculator, not here.
// ──────────────────────────────────────────────

interface AddonSeed {
  name: string;
  slug: string;
  description: string;
  pricingType: string;
  price: number;
  pricePerWord: number | null;
  sortOrder: number;
  isActive: boolean;
}

const addons: AddonSeed[] = [
  {
    name: "Cover Design",
    slug: "cover-design",
    description:
      "Professional cover design by our in-house design team. Includes 2 revision rounds.",
    pricingType: "fixed",
    price: 45_000.0,
    pricePerWord: null,
    sortOrder: 1,
    isActive: true,
  },
  {
    name: "Content Formatting",
    slug: "content-formatting",
    description:
      "We format your raw manuscript into a professionally typeset, print-ready layout. Priced per word.",
    pricingType: "per_word",
    price: 0.0,
    pricePerWord: 0.5,
    sortOrder: 2,
    isActive: true,
  },
  {
    name: "ISBN + Barcode",
    slug: "isbn-barcode",
    description:
      "Official ISBN registration and barcode for your book, enabling distribution to bookstores and libraries.",
    pricingType: "fixed",
    price: 15_000.0,
    pricePerWord: null,
    sortOrder: 3,
    isActive: true,
  },
];

async function seedPackageCatalog() {
  console.log("🌱 Seeding package categories and packages...\n");

  const categoryBySlug = new Map<string, { id: string; copies: number; sortOrder: number }>();

  for (const category of packageCategories) {
    const result = await prisma.packageCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        copies: category.copies,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        copies: category.copies,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      },
    });

    categoryBySlug.set(category.slug, {
      id: result.id,
      copies: result.copies,
      sortOrder: result.sortOrder,
    });

    console.log(`  ✔ Category: ${result.name} (${result.copies} copies, id: ${result.id})`);
  }

  for (const category of packageCategories) {
    const categoryMeta = categoryBySlug.get(category.slug);
    if (!categoryMeta) continue;

    for (const template of packageTemplates) {
      const packageName = `${category.packageNamePrefix} ${template.tier}`;
      const packageSlug = `${category.packageSlugPrefix}-${template.tier}`;
      const copyProfile = getCopyProfile(categoryMeta.copies);
      const basePrice = category.tierPrices?.[template.tier] ?? template.basePrice;

      const result = await prisma.package.upsert({
        where: { slug: packageSlug },
        update: {
          categoryId: categoryMeta.id,
          name: packageName,
          description: template.description,
          basePrice,
          pageLimit: template.pageLimit,
          includesISBN: template.includesISBN,
          isActive: template.isActive,
          sortOrder: categoryMeta.sortOrder * 10 + template.sortOrder,
          features: {
            items: [getCopyFeature(categoryMeta.copies), ...template.features],
            copies: copyProfile,
          },
        },
        create: {
          categoryId: categoryMeta.id,
          name: packageName,
          slug: packageSlug,
          description: template.description,
          basePrice,
          pageLimit: template.pageLimit,
          includesISBN: template.includesISBN,
          isActive: template.isActive,
          sortOrder: categoryMeta.sortOrder * 10 + template.sortOrder,
          features: {
            items: [getCopyFeature(categoryMeta.copies), ...template.features],
            copies: copyProfile,
          },
        },
      });

      console.log(`  ✔ Package: ${result.name} (category: ${category.name}, id: ${result.id})`);
    }
  }

  const legacyResult = await prisma.package.updateMany({
    where: { slug: { in: ["first-draft", "glow-up", "legacy"] } },
    data: { isActive: false },
  });

  if (legacyResult.count > 0) {
    console.log(
      `  ℹ Deactivated ${legacyResult.count} legacy packages (First Draft, Glow Up, Legacy).`
    );
  }

  console.log("\n✅ 2 package categories and 6 packages seeded.\n");
}

async function seedAddons() {
  console.log("🌱 Seeding addons...\n");

  for (const addon of addons) {
    const result = await prisma.addon.upsert({
      where: { slug: addon.slug },
      update: {},
      create: {
        name: addon.name,
        slug: addon.slug,
        description: addon.description,
        pricingType: addon.pricingType,
        price: addon.price,
        pricePerWord: addon.pricePerWord,
        sortOrder: addon.sortOrder,
        isActive: addon.isActive,
      },
    });

    console.log(`  ✔ ${result.name} [${result.pricingType}] (id: ${result.id})`);
  }

  console.log("\n✅ 3 addons seeded.\n");
}

// ──────────────────────────────────────────────
// Payment Gateway seed data
// ──────────────────────────────────────────────
// Shared with prisma/seed-payment-gateways.ts so both full and targeted
// seed runs produce the same gateway records.
// ──────────────────────────────────────────────

const gateways = buildGatewaySeedsFromEnv();

async function seedGateways() {
  console.log("🌱 Seeding payment gateways...\n");

  for (const gw of gateways) {
    const result = await prisma.paymentGateway.upsert({
      where: { provider: gw.provider as never },
      update: {
        name: gw.name,
        isEnabled: gw.isEnabled,
        isTestMode: gw.isTestMode,
        publicKey: gw.publicKey ?? null,
        secretKey: gw.secretKey ?? null,
        priority: gw.priority,
        instructions: gw.instructions ?? null,
        bankDetails: gw.bankDetails ?? undefined,
      },
      create: {
        provider: gw.provider as never,
        name: gw.name,
        isEnabled: gw.isEnabled,
        isTestMode: gw.isTestMode,
        publicKey: gw.publicKey ?? null,
        secretKey: gw.secretKey ?? null,
        priority: gw.priority,
        instructions: gw.instructions ?? null,
        bankDetails: gw.bankDetails ?? undefined,
      },
    });

    const status = result.isEnabled ? "enabled" : "disabled";
    const mode = result.isTestMode ? "test" : "live";
    console.log(`  ✔ ${result.name} [${status}, ${mode}] (id: ${result.id})`);
  }

  console.log("\n✅ 4 payment gateways seeded.\n");
}

async function main() {
  await seedPackageCatalog();
  await seedAddons();
  await seedGateways();
  console.log("🎉 All seeding complete.\n");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
