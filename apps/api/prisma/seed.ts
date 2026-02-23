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

async function main() {
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

  console.log("\n✅ Seeding complete — 3 packages created.\n");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
