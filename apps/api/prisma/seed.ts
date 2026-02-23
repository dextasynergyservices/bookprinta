import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ──────────────────────────────────────────────
// Package seed data (First Draft → Glow Up → Legacy)
// ──────────────────────────────────────────────

interface PackageSeed {
  name: string;
  basePrice: number;
  pageLimit: number;
  description: string;
  includesISBN: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
}

const packages: PackageSeed[] = [
  {
    name: "First Draft",
    basePrice: 75_000,
    pageLimit: 100,
    description: "For authors starting out",
    includesISBN: false,
    isActive: true,
    sortOrder: 0,
    features: [
      "25 copies, A5 size (or 50 copies, A6 size, or 12 copies, A4 size)",
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
    name: "Glow Up",
    basePrice: 125_000,
    pageLimit: 150,
    description: "For authors who want more",
    includesISBN: true,
    isActive: true,
    sortOrder: 1,
    features: [
      "35 copies, A5 size (or 70 copies, A6 size, or 15 copies, A4 size)",
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
    name: "Legacy",
    basePrice: 200_000,
    pageLimit: 200,
    description: "For authors concerned about legacy",
    includesISBN: true,
    isActive: true,
    sortOrder: 2,
    features: [
      "50 copies, A5 size (or 100 copies, A6 size, or 25 copies, A4 size)",
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

async function seedPackages() {
  console.log("🌱 Seeding packages...\n");

  for (const pkg of packages) {
    const result = await prisma.package.upsert({
      where: { name: pkg.name },
      update: {},
      create: {
        name: pkg.name,
        basePrice: pkg.basePrice,
        pageLimit: pkg.pageLimit,
        description: pkg.description,
        includesISBN: pkg.includesISBN,
        isActive: pkg.isActive,
        sortOrder: pkg.sortOrder,
        features: pkg.features,
      },
    });

    console.log(`  ✔ ${result.name} (id: ${result.id})`);
  }

  console.log("\n✅ 3 packages seeded.\n");
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

async function main() {
  await seedPackages();
  await seedAddons();
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
