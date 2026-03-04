import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const DEFAULT_QUOTE_COST_PER_PAGE = 10;
const DEFAULT_QUOTE_COVER_COST = 500;

const QUOTE_SETTINGS = [
  {
    key: "quote_cost_per_page",
    fallbackValue: DEFAULT_QUOTE_COST_PER_PAGE,
    envKey: "QUOTE_COST_PER_PAGE_SEED",
    description: "Cost per page in NGN for custom quote estimator",
  },
  {
    key: "quote_cover_cost",
    fallbackValue: DEFAULT_QUOTE_COVER_COST,
    envKey: "QUOTE_COVER_COST_SEED",
    description: "Cover cost in NGN for custom quote estimator",
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

async function seedQuoteSettings() {
  console.log("Seeding quote estimator settings...\n");

  for (const setting of QUOTE_SETTINGS) {
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

  console.log("\nQuote estimator settings seeded.\n");
}

async function main() {
  await seedQuoteSettings();
}

main()
  .catch((error: unknown) => {
    console.error("Quote settings seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
