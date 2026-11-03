import { ConflictException, Injectable } from "@nestjs/common";
import { normalizePhoneNumber } from "../../auth/phone-number.util.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../prisma/prisma.service.js";

export const PHONE_ALREADY_IN_USE_MESSAGE =
  "This phone number is already linked to another account. Use another phone number or sign in to your existing account.";

export const EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE =
  "This email and phone number belong to different accounts. Sign in to the correct account or use a different phone number.";

export const DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE =
  "This account has been deactivated. Reactivate your account first using the recovery flow, or contact support or an administrator before continuing with payment or account setup.";

/**
 * Who a checkout may be attached to.
 *
 * Pay-first-sign-up-later means a guest checkout creates or reuses an account
 * from the email and phone typed at checkout, so before any money is taken
 * (and again inside fulfilment, where it can race) this refuses a checkout
 * that would collide with another person's account or a deactivated one.
 */
@Injectable()
export class CheckoutIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCheckoutIdentityConflict(params: {
    email: string;
    phone: string | null;
    tx?: Prisma.TransactionClient | PrismaService;
    allowUserId?: string | null;
  }): Promise<void> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(params.phone);
    if (!normalizedEmail) return;

    const db = params.tx ?? this.prisma;
    const emailUser = await db.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (emailUser && emailUser.id !== params.allowUserId && !emailUser.isActive) {
      throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
    }

    if (!normalizedPhone) {
      return;
    }

    const phoneUsers = await db.user.findMany({
      where: {
        phoneNumberNormalized: normalizedPhone,
      },
      select: {
        id: true,
        email: true,
      },
      take: 3,
    });

    const emailOwnerId = emailUser && emailUser.id !== params.allowUserId ? emailUser.id : null;
    const conflictingPhoneUsers = phoneUsers.filter((user) => user.id !== params.allowUserId);

    if (conflictingPhoneUsers.length === 0) {
      return;
    }

    if (emailOwnerId && conflictingPhoneUsers.every((user) => user.id === emailOwnerId)) {
      return;
    }

    if (emailOwnerId) {
      throw new ConflictException(EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE);
    }

    throw new ConflictException(PHONE_ALREADY_IN_USE_MESSAGE);
  }
}
