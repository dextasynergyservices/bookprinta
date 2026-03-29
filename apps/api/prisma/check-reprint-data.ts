import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Check for ANY reprint payments
  const reprintPayments = await prisma.payment.findMany({
    where: { type: "REPRINT" },
    select: {
      id: true,
      status: true,
      orderId: true,
      providerRef: true,
      processedAt: true,
      amount: true,
      metadata: true,
      userId: true,
      createdAt: true,
    },
  });
  console.log("=== REPRINT PAYMENTS ===");
  console.log(JSON.stringify(reprintPayments, null, 2));

  // Check for any reprint orders
  const reprintOrders = await prisma.order.findMany({
    where: { orderType: "REPRINT" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      originalBookId: true,
      copies: true,
      createdAt: true,
    },
  });
  console.log("\n=== REPRINT ORDERS ===");
  console.log(JSON.stringify(reprintOrders, null, 2));

  // Also check recent payments in general (last 5)
  const recentPayments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      type: true,
      status: true,
      orderId: true,
      providerRef: true,
      amount: true,
      createdAt: true,
    },
  });
  console.log("\n=== LAST 5 PAYMENTS ===");
  console.log(JSON.stringify(recentPayments, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
