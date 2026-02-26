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

async function seedPaymentGateways() {
  const gateways = buildGatewaySeedsFromEnv();

  console.log("🌱 Seeding payment gateways...\n");

  for (const gateway of gateways) {
    const result = await prisma.paymentGateway.upsert({
      where: { provider: gateway.provider as never },
      update: {
        name: gateway.name,
        isEnabled: gateway.isEnabled,
        isTestMode: gateway.isTestMode,
        publicKey: gateway.publicKey ?? null,
        secretKey: gateway.secretKey ?? null,
        priority: gateway.priority,
        instructions: gateway.instructions ?? null,
        bankDetails: gateway.bankDetails ?? undefined,
      },
      create: {
        provider: gateway.provider as never,
        name: gateway.name,
        isEnabled: gateway.isEnabled,
        isTestMode: gateway.isTestMode,
        publicKey: gateway.publicKey ?? null,
        secretKey: gateway.secretKey ?? null,
        priority: gateway.priority,
        instructions: gateway.instructions ?? null,
        bankDetails: gateway.bankDetails ?? undefined,
      },
    });

    const status = result.isEnabled ? "enabled" : "disabled";
    const mode = result.isTestMode ? "test" : "live";
    console.log(`  ✔ ${result.name} [${status}, ${mode}] (id: ${result.id})`);
  }

  console.log(`\n✅ ${gateways.length} payment gateways seeded.\n`);
}

async function main() {
  await seedPaymentGateways();
  console.log("🎉 Payment gateway seeding complete.\n");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Payment gateway seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
