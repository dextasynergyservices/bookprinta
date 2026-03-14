import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const activationBackfillConfirmation = process.env.USER_IS_ACTIVE_BACKFILL_CONFIRM?.trim();
if (activationBackfillConfirmation !== "reactivate-all-users") {
  throw new Error(
    "USER_IS_ACTIVE_BACKFILL_CONFIRM must be set to 'reactivate-all-users' before running this rollout-only backfill."
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Backfilling User.isActive rollout default...\n");

  const beforeCount = await prisma.user.count({
    where: {
      isActive: false,
    },
  });

  const result = await prisma.user.updateMany({
    where: {
      isActive: false,
    },
    data: {
      isActive: true,
    },
  });

  const afterCount = await prisma.user.count({
    where: {
      isActive: false,
    },
  });

  console.log(`  - Users inactive before backfill: ${beforeCount}`);
  console.log(`  - Users reactivated by backfill: ${result.count}`);
  console.log(`  - Users inactive after backfill: ${afterCount}`);
  console.log("\nUser.isActive backfill complete.\n");
}

main()
  .catch((error: unknown) => {
    console.error("User.isActive backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
