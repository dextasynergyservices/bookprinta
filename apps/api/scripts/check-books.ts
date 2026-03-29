import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  // Find the user by email
  const user = await prisma.user.findFirst({
    where: { email: "edirineyuren@yahoo.com" },
    select: { id: true, email: true, firstName: true },
  });
  console.log("User:", user);

  // Get ALL books, showing both status and productionStatus
  const books = await prisma.book.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      productionStatus: true,
      pageCount: true,
      finalPdfUrl: true,
      userId: true,
    },
    take: 20,
  });

  for (const book of books) {
    console.log(`
Book ID:            ${book.id}
Title:              ${book.title}
status:             ${book.status}
productionStatus:   ${book.productionStatus}
Page Count:         ${book.pageCount}
Final PDF URL:      ${book.finalPdfUrl ? "present" : "NULL"}
User ID:            ${book.userId}
---`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
