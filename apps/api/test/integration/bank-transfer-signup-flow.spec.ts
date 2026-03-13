/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { AuthService } from "../../src/auth/auth.service.js";
import {
  BookStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
  UserRole,
} from "../../src/generated/prisma/enums.js";
import { PaymentsService } from "../../src/payments/payments.service.js";

type UserRecord = {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  phoneNumberNormalized: string | null;
  preferredLanguage: "en" | "fr" | "es";
  isVerified: boolean;
  password: string | null;
  verificationCode: string | null;
  verificationToken: string | null;
  tokenExpiry: Date | null;
  refreshToken: string | null;
  refreshTokenExp: Date | null;
};

type PaymentRecord = {
  id: string;
  provider: PaymentProvider;
  type: PaymentType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  providerRef: string;
  receiptUrl: string | null;
  payerName: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  orderId: string | null;
  processedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OrderRecord = {
  id: string;
  orderNumber: string;
  userId: string;
  packageId: string;
  packageName: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type BookRecord = {
  id: string;
  orderId: string;
  userId: string;
  status: BookStatus;
  productionStatus: BookStatus;
  createdAt: Date;
};

type OrderAddonRecord = {
  orderId: string;
  addon: {
    name: string;
  };
};

type PackageRecord = {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  isActive: boolean;
  category: {
    isActive: boolean;
  };
};

type PaymentsServicePrivate = {
  sendBankTransferAdminWhatsApp: (...args: never[]) => Promise<void>;
  sendBankTransferUserEmail: (...args: never[]) => Promise<void>;
  sendBankTransferAdminEmail: (...args: never[]) => Promise<void>;
  generateReference: () => string;
  generateOrderNumber: () => Promise<string>;
};

type AuthServicePrivate = {
  generateVerificationCode: () => string;
};

function getPaymentsServicePrivate(service: PaymentsService) {
  return service as unknown as PaymentsServicePrivate;
}

function getAuthServicePrivate(service: AuthService) {
  return service as unknown as AuthServicePrivate;
}

function createFlowHarness() {
  process.env.FRONTEND_URL = "http://localhost:3000";
  process.env.JWT_SECRET = "integration-test-secret";
  process.env.NODE_ENV = "test";

  let paymentCounter = 0;
  let userCounter = 0;
  let orderCounter = 0;
  let bookCounter = 0;
  let auditCounter = 0;

  const users: UserRecord[] = [];
  const payments: PaymentRecord[] = [];
  const orders: OrderRecord[] = [];
  const books: BookRecord[] = [];
  const orderAddons: OrderAddonRecord[] = [];
  const packages: PackageRecord[] = [
    {
      id: "pkg_legacy",
      slug: "legacy",
      name: "Legacy",
      basePrice: 125000,
      isActive: true,
      category: {
        isActive: true,
      },
    },
  ];

  const registrationDeliveries: Array<Record<string, unknown>> = [];
  const verificationChallenges: Array<Record<string, unknown>> = [];
  const welcomeEmails: Array<Record<string, unknown>> = [];

  const nextId = (prefix: string, current: number) => `${prefix}_${current + 1}`;

  const findUser = (where: Record<string, unknown>) => {
    if (typeof where.id === "string") return users.find((user) => user.id === where.id) ?? null;
    if (typeof where.email === "string") {
      return users.find((user) => user.email === where.email) ?? null;
    }
    if (typeof where.verificationToken === "string") {
      return users.find((user) => user.verificationToken === where.verificationToken) ?? null;
    }
    return null;
  };

  const findOrder = (where: Record<string, unknown>) => {
    if (typeof where.id === "string") return orders.find((order) => order.id === where.id) ?? null;
    if (typeof where.orderNumber === "string") {
      return orders.find((order) => order.orderNumber === where.orderNumber) ?? null;
    }
    return null;
  };

  const findPayment = (where: Record<string, unknown>) => {
    if (typeof where.id === "string") {
      return payments.find((payment) => payment.id === where.id) ?? null;
    }
    if (typeof where.providerRef === "string") {
      return payments.find((payment) => payment.providerRef === where.providerRef) ?? null;
    }
    return null;
  };

  const hydrateOrder = (order: OrderRecord) => {
    const user = users.find((entry) => entry.id === order.userId) ?? null;
    const book = books.find((entry) => entry.orderId === order.id) ?? null;
    const addons = orderAddons
      .filter((entry) => entry.orderId === order.id)
      .map((entry) => ({ addon: entry.addon }));

    return {
      ...order,
      refundedAt: null,
      package: { name: order.packageName },
      user: user
        ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            preferredLanguage: user.preferredLanguage,
          }
        : null,
      addons,
      book: book
        ? {
            id: book.id,
            status: book.status,
            productionStatus: book.productionStatus,
            version: 1,
          }
        : null,
    };
  };

  const hydratePayment = (payment: PaymentRecord) => {
    const user = payment.userId
      ? (users.find((entry) => entry.id === payment.userId) ?? null)
      : null;
    const order = payment.orderId ? findOrder({ id: payment.orderId }) : null;

    return {
      ...payment,
      user: user
        ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            preferredLanguage: user.preferredLanguage,
          }
        : null,
      order: order ? hydrateOrder(order) : null,
    };
  };

  const tx = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findUser(where)),
      create: jest.fn(async ({ data }: { data: Partial<UserRecord> }) => {
        const user: UserRecord = {
          id: nextId("user", userCounter),
          email: String(data.email),
          role: (data.role as UserRole | undefined) ?? UserRole.USER,
          firstName: String(data.firstName ?? ""),
          lastName: (data.lastName as string | null | undefined) ?? null,
          phoneNumber: (data.phoneNumber as string | null | undefined) ?? null,
          phoneNumberNormalized: (data.phoneNumberNormalized as string | null | undefined) ?? null,
          preferredLanguage: (data.preferredLanguage as "en" | "fr" | "es" | undefined) ?? "en",
          isVerified: Boolean(data.isVerified ?? false),
          password: (data.password as string | null | undefined) ?? null,
          verificationCode: (data.verificationCode as string | null | undefined) ?? null,
          verificationToken: (data.verificationToken as string | null | undefined) ?? null,
          tokenExpiry: (data.tokenExpiry as Date | null | undefined) ?? null,
          refreshToken: (data.refreshToken as string | null | undefined) ?? null,
          refreshTokenExp: (data.refreshTokenExp as Date | null | undefined) ?? null,
        };

        userCounter += 1;
        users.push(user);
        return user;
      }),
      update: jest.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<UserRecord> }) => {
          const user = findUser(where);
          if (!user) {
            throw new Error(`User not found for update: ${JSON.stringify(where)}`);
          }

          Object.assign(user, data);
          return user;
        }
      ),
      findMany: jest.fn(async () => users),
    },
    order: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const order = findOrder(where);
        return order ? hydrateOrder(order) : null;
      }),
      create: jest.fn(async ({ data }: { data: Partial<OrderRecord> }) => {
        const createdAt = new Date("2026-03-13T12:00:00.000Z");
        const pkg = packages.find((entry) => entry.id === data.packageId) ?? packages[0];
        const order: OrderRecord = {
          id: nextId("order", orderCounter),
          orderNumber: String(data.orderNumber),
          userId: String(data.userId),
          packageId: String(data.packageId),
          packageName: pkg.name,
          status: (data.status as OrderStatus | undefined) ?? OrderStatus.PAID,
          totalAmount: Number(data.totalAmount ?? data.initialAmount ?? 0),
          currency: String(data.currency ?? "NGN"),
          version: 1,
          createdAt,
          updatedAt: createdAt,
        };

        orderCounter += 1;
        orders.push(order);
        return order;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const filtered = orders
          .filter((order) => (where.userId ? order.userId === where.userId : true))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
        return filtered[0] ? hydrateOrder(filtered[0]) : null;
      }),
    },
    book: {
      create: jest.fn(async ({ data }: { data: Partial<BookRecord> }) => {
        const createdAt = new Date("2026-03-13T12:01:00.000Z");
        const book: BookRecord = {
          id: nextId("book", bookCounter),
          orderId: String(data.orderId),
          userId: String(data.userId),
          status: (data.status as BookStatus | undefined) ?? BookStatus.PAYMENT_RECEIVED,
          productionStatus:
            (data.productionStatus as BookStatus | undefined) ?? BookStatus.PAYMENT_RECEIVED,
          createdAt,
        };

        bookCounter += 1;
        books.push(book);
        return book;
      }),
    },
    payment: {
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<PaymentRecord>;
        }) => {
          const payment = findPayment(where);
          if (!payment) {
            throw new Error(`Payment not found for update: ${JSON.stringify(where)}`);
          }

          Object.assign(payment, data, { updatedAt: new Date("2026-03-13T12:05:00.000Z") });
          return hydratePayment(payment);
        }
      ),
    },
    auditLog: {
      create: jest.fn(async () => ({ id: nextId("audit", auditCounter++) })),
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    addon: {
      findMany: jest.fn(async () => []),
    },
    orderAddon: {
      createMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        orderAddons.filter((entry) => entry.orderId === where.orderId)
      ),
    },
  };

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(async () => ({ isEnabled: true })),
    },
    package: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === "string") {
          return packages.find((entry) => entry.id === where.id && entry.isActive) ?? null;
        }
        if (typeof where.slug === "string") {
          return packages.find((entry) => entry.slug === where.slug && entry.isActive) ?? null;
        }
        return null;
      }),
    },
    payment: {
      create: jest.fn(async ({ data }: { data: Partial<PaymentRecord> }) => {
        const createdAt = new Date("2026-03-13T11:30:00.000Z");
        const payment: PaymentRecord = {
          id: nextId("payment", paymentCounter),
          provider: (data.provider as PaymentProvider | undefined) ?? PaymentProvider.BANK_TRANSFER,
          type: (data.type as PaymentType | undefined) ?? PaymentType.INITIAL,
          amount: Number(data.amount ?? 0),
          currency: String(data.currency ?? "NGN"),
          status: (data.status as PaymentStatus | undefined) ?? PaymentStatus.AWAITING_APPROVAL,
          providerRef: String(data.providerRef ?? ""),
          receiptUrl: (data.receiptUrl as string | null | undefined) ?? null,
          payerName: (data.payerName as string | null | undefined) ?? null,
          payerEmail: (data.payerEmail as string | null | undefined) ?? null,
          payerPhone: (data.payerPhone as string | null | undefined) ?? null,
          metadata: (data.metadata as Record<string, unknown> | null | undefined) ?? null,
          userId: (data.userId as string | null | undefined) ?? null,
          orderId: (data.orderId as string | null | undefined) ?? null,
          processedAt: (data.processedAt as Date | null | undefined) ?? null,
          approvedAt: (data.approvedAt as Date | null | undefined) ?? null,
          approvedBy: (data.approvedBy as string | null | undefined) ?? null,
          adminNote: (data.adminNote as string | null | undefined) ?? null,
          createdAt,
          updatedAt: createdAt,
        };

        paymentCounter += 1;
        payments.push(payment);
        return payment;
      }),
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const payment = findPayment(where);
        return payment ? hydratePayment(payment) : null;
      }),
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        payments
          .filter((payment) => {
            if (!where) return true;
            if (where.provider && payment.provider !== where.provider) return false;
            if (where.status && payment.status !== where.status) return false;
            return true;
          })
          .map((payment) => hydratePayment(payment))
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<PaymentRecord>;
        }) => {
          const payment = findPayment(where);
          if (!payment) {
            throw new Error(`Payment not found for update: ${JSON.stringify(where)}`);
          }

          Object.assign(payment, data, { updatedAt: new Date("2026-03-13T12:05:00.000Z") });
          return hydratePayment(payment);
        }
      ),
    },
    user: tx.user,
    order: tx.order,
    orderAddon: tx.orderAddon,
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  const signupNotificationsService = {
    sendRegistrationLink: jest.fn(async (payload: Record<string, unknown>) => {
      registrationDeliveries.push(payload);
      return { emailDelivered: true, whatsappDelivered: false };
    }),
    sendVerificationChallenge: jest.fn(async (payload: Record<string, unknown>) => {
      verificationChallenges.push(payload);
    }),
    sendWelcomeEmail: jest.fn(async (payload: Record<string, unknown>) => {
      welcomeEmails.push(payload);
    }),
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn().mockResolvedValue(undefined),
    notifyAdminsBankTransferReceived: jest.fn().mockResolvedValue(undefined),
    createSystemNotification: jest.fn().mockResolvedValue(undefined),
  };

  const paymentsService = new PaymentsService(
    prisma as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    {} as never,
    {} as never,
    signupNotificationsService as never,
    notificationsService as never,
    { assertBillingGateAccess: jest.fn() } as never
  );

  const authService = new AuthService(
    prisma as never,
    signupNotificationsService as never,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as never
  );

  const paymentsServicePrivate = getPaymentsServicePrivate(paymentsService);
  const authServicePrivate = getAuthServicePrivate(authService);

  jest.spyOn(paymentsServicePrivate, "sendBankTransferAdminWhatsApp").mockResolvedValue(undefined);
  jest.spyOn(paymentsServicePrivate, "sendBankTransferUserEmail").mockResolvedValue(undefined);
  jest.spyOn(paymentsServicePrivate, "sendBankTransferAdminEmail").mockResolvedValue(undefined);
  jest.spyOn(paymentsServicePrivate, "generateReference").mockReturnValue("BT-2026-0009");
  jest.spyOn(paymentsServicePrivate, "generateOrderNumber").mockResolvedValue("BP-2026-0099");
  jest.spyOn(authServicePrivate, "generateVerificationCode").mockReturnValue("123456");

  return {
    paymentsService,
    authService,
    signupNotificationsService,
    notificationsService,
    state: {
      users,
      payments,
      orders,
      registrationDeliveries,
      verificationChallenges,
      welcomeEmails,
    },
  };
}

describe("bank transfer signup flow integration", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("covers submit to approval to signup completion and destroys the token after successful verification", async () => {
    const {
      paymentsService,
      authService,
      signupNotificationsService,
      notificationsService,
      state,
    } = createFlowHarness();

    const submitResult = await paymentsService.submitBankTransfer({
      payerName: "Ada Okafor",
      payerEmail: "ada@example.com",
      payerPhone: "+2348012345678",
      amount: 125000,
      currency: "NGN",
      receiptUrl: "https://res.cloudinary.com/bookprinta/image/upload/v1/receipt.jpg",
      metadata: {
        locale: "fr",
        fullName: "Ada Okafor",
        phone: "+2348012345678",
        packageSlug: "legacy",
        packageName: "Legacy",
        totalPrice: 125000,
      },
    } as never);

    expect(submitResult).toEqual({
      id: "payment_1",
      status: PaymentStatus.AWAITING_APPROVAL,
      message:
        "Your payment is being verified. You will receive an email once approved. " +
        "This typically takes less than 30 minutes.",
    });
    expect(notificationsService.notifyAdminsBankTransferReceived).toHaveBeenCalledWith({
      reference: "BT-2026-0009",
      orderNumber: "BT-2026-0009",
      payerName: "Ada Okafor",
      amountLabel: "₦125,000",
    });

    const pendingQueue = await paymentsService.listAdminPendingBankTransfers();
    expect(pendingQueue.items.map((item) => item.id)).toEqual(["payment_1"]);
    expect(pendingQueue.items[0]).toEqual(
      expect.objectContaining({
        orderReference: "BT-2026-0009",
        status: PaymentStatus.AWAITING_APPROVAL,
      })
    );

    const approveResult = await paymentsService.approveBankTransfer({
      paymentId: "payment_1",
      adminId: "admin_1",
      adminNote: "Receipt confirmed against statement",
    });

    expect(approveResult).toEqual({
      id: "payment_1",
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
    });
    expect(state.payments[0]).toEqual(
      expect.objectContaining({
        id: "payment_1",
        status: PaymentStatus.SUCCESS,
        userId: "user_1",
        orderId: "order_1",
        approvedBy: "admin_1",
      })
    );
    expect(signupNotificationsService.sendRegistrationLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        locale: "fr",
        orderNumber: "BP-2026-0099",
      })
    );

    const signupToken = state.users[0]?.verificationToken;
    expect(signupToken).toEqual(expect.any(String));
    if (!signupToken) {
      throw new Error("Expected approval to generate a signup token.");
    }
    expect(state.orders[0]).toEqual(
      expect.objectContaining({
        id: "order_1",
        orderNumber: "BP-2026-0099",
        status: OrderStatus.PAID,
      })
    );

    const context = await authService.getSignupContext({
      token: signupToken,
    } as never);
    expect(context).toEqual({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      phoneNumber: "+2348012345678",
      nextStep: "password",
    });

    await expect(
      authService.finishSignup({
        token: signupToken,
        password: "Password123!",
        confirmPassword: "Password123!",
      } as never)
    ).resolves.toEqual({
      message: "Password set successfully. Please verify your email with the code sent.",
      email: "ada@example.com",
    });

    expect(state.users[0]).toEqual(
      expect.objectContaining({
        email: "ada@example.com",
        verificationToken: signupToken,
        verificationCode: "123456",
      })
    );
    expect(state.verificationChallenges).toHaveLength(1);

    await authService.verifyEmail({
      email: "ada@example.com",
      code: "123456",
    } as never);

    expect(state.users[0]).toEqual(
      expect.objectContaining({
        isVerified: true,
        verificationCode: null,
        verificationToken: null,
        tokenExpiry: null,
      })
    );
    expect(state.welcomeEmails).toHaveLength(1);

    await expect(
      authService.getSignupContext({
        token: signupToken,
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      authService.finishSignup({
        token: signupToken,
        password: "AnotherPassword123!",
        confirmPassword: "AnotherPassword123!",
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
