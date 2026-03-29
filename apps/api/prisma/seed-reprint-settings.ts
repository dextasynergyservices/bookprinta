import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const DEFAULT_REPRINT_COST_PER_PAGE = 15;
const DEFAULT_REPRINT_COVER_COST = 300;

const REPRINT_SETTINGS = [
  {
    key: "reprint_cost_per_page",
    fallbackValue: DEFAULT_REPRINT_COST_PER_PAGE,
    envKey: "REPRINT_COST_PER_PAGE_SEED",
    description: "Cost per page in NGN for reprint orders",
  },
  {
    key: "reprint_cover_cost",
    fallbackValue: DEFAULT_REPRINT_COVER_COST,
    envKey: "REPRINT_COVER_COST_SEED",
    description: "Cover cost in NGN for reprint orders",
  },
] as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function parseSeedValue(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

async function seedReprintSettings() {
  console.log("Seeding reprint pricing settings...\n");

  for (const setting of REPRINT_SETTINGS) {
    const finalValue = parseSeedValue(process.env[setting.envKey], setting.fallbackValue);

    const result = await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        value: String(finalValue),
        description: setting.description,
      },
      create: {
        key: setting.key,
        value: String(finalValue),
        description: setting.description,
      },
    });

    console.log(`  - ${result.key} = ${result.value}`);
  }

  console.log("\nReprint pricing settings seeded.\n");
}

async function main() {
  await seedReprintSettings();
}

main()
  .catch((error: unknown) => {
    console.error("Reprint settings seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
