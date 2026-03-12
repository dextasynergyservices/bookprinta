import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedProductionDelaySettings } from "./production-delay-settings.seed.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  await seedProductionDelaySettings(prisma);
  console.log("🎉 Production delay settings seeding complete.\n");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Production delay settings seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
