import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * A new order number, `BP-<year>-<up to 6 random base36 chars>`, checked against
 * existing orders inside the caller's transaction. Gives up after six
 * collisions rather than looping.
 */
export async function generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    const candidate = `BP-${new Date().getFullYear()}-${randomPart}`;

    const existing = await tx.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new ServiceUnavailableException("Unable to generate a unique order number");
}
