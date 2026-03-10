import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizePhoneNumber } from "../src/auth/phone-number.util.js";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🔧 Backfilling phoneNumberNormalized...\n");

  const users = await prisma.user.findMany({
    where: {
      OR: [{ phoneNumber: { not: null } }, { phoneNumberNormalized: { not: null } }],
    },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      phoneNumberNormalized: true,
    },
  });

  let updatedCount = 0;
  const duplicates = new Map<string, string[]>();

  for (const user of users) {
    const normalized = normalizePhoneNumber(user.phoneNumber);

    if (normalized) {
      const existing = duplicates.get(normalized) ?? [];
      existing.push(user.email);
      duplicates.set(normalized, existing);
    }

    if (user.phoneNumberNormalized === normalized) {
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneNumberNormalized: normalized,
      },
    });
    updatedCount += 1;
  }

  const duplicateEntries = [...duplicates.entries()].filter(([, emails]) => emails.length > 1);

  console.log(`  - Users scanned: ${users.length}`);
  console.log(`  - Users updated: ${updatedCount}`);
  if (duplicateEntries.length > 0) {
    console.log(`  - Duplicate normalized phone values detected: ${duplicateEntries.length}`);
    for (const [phone, emails] of duplicateEntries) {
      console.log(`    * ${phone}: ${emails.join(", ")}`);
    }
  } else {
    console.log("  - Duplicate normalized phone values detected: 0");
  }

  console.log("\n✅ Phone normalization backfill complete.\n");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Phone normalization backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
