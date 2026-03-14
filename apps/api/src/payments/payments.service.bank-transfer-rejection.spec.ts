/// <reference types="jest" />
import { BadRequestException } from "@nestjs/common";
import { PaymentProvider, PaymentStatus } from "../generated/prisma/enums.js";
import { PaymentsService } from "./payments.service.js";

type PaymentsServicePrivate = {
  sendBankTransferRejectedEmail: (...args: never[]) => Promise<boolean>;
};

function getPaymentsServicePrivate(service: PaymentsService) {
  return service as unknown as PaymentsServicePrivate;
}

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const tx = {
    payment: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (trx: typeof tx) => unknown) => callback(tx)),
  };

  const signupNotificationsService = {
    sendRegistrationLink: jest.fn(),
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn(),
    notifyAdminsBankTransferReceived: jest.fn(),
    createSystemNotification: jest.fn(),
  };

  const service = new PaymentsService(
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

  return {
    service,
    prisma,
    tx,
    notificationsService,
  };
}

describe("PaymentsService bank transfer rejection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a user notification and sends a localized rejection email for linked payments", async () => {
    const { service, prisma, tx, notificationsService } = createService();
    const sendRejectionEmail = jest
      .spyOn(getPaymentsServicePrivate(service), "sendBankTransferRejectedEmail")
      .mockResolvedValue(true);

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_3",
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      providerRef: "BT-003",
      processedAt: null,
      payerEmail: "ada@example.com",
      payerName: "Ada Okafor",
      userId: "user_1",
      orderId: "order_3",
      metadata: {
        locale: "es",
        fullName: "Ada Okafor",
      },
      order: {
        id: "order_3",
        orderNumber: "BP-2026-0003",
      },
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Okafor",
        preferredLanguage: "fr",
      },
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({ id: "audit_3" });
    notificationsService.createSystemNotification.mockResolvedValue(undefined);

    const result = await service.rejectBankTransfer({
      paymentId: "payment_3",
      adminId: "admin_3",
      adminNote: "Receipt amount does not match our statement.",
    });

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_3" },
        data: expect.objectContaining({
          status: PaymentStatus.FAILED,
          approvedBy: "admin_3",
          adminNote: "Receipt amount does not match our statement.",
          processedAt: expect.any(Date),
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_BANK_TRANSFER_REJECTED",
          entityType: "PAYMENT",
          entityId: "payment_3",
          details: expect.objectContaining({
            reason: "Receipt amount does not match our statement.",
            orderId: "order_3",
            orderNumber: "BP-2026-0003",
            linkedUserId: "user_1",
            emailTarget: "ada@example.com",
          }),
        }),
      })
    );
    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        orderId: "order_3",
        titleKey: "notifications.bank_transfer_rejected.title",
        messageKey: "notifications.bank_transfer_rejected.message",
        params: {
          orderNumber: "BP-2026-0003",
          reference: "BT-003",
        },
        action: {
          kind: "navigate",
          href: "/dashboard/orders/order_3",
        },
        presentation: {
          tone: "warning",
        },
      }),
      tx
    );
    expect(sendRejectionEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      userName: "Ada Okafor",
      locale: "es",
      orderNumber: "BP-2026-0003",
      paymentReference: "BT-003",
      rejectionReason: "Receipt amount does not match our statement.",
    });
    expect(result).toEqual({
      id: "payment_3",
      status: PaymentStatus.FAILED,
      message: "Bank transfer rejected.",
    });
  });

  it("still sends the rejection email when the payment is not linked to a user account yet", async () => {
    const { service, prisma, tx, notificationsService } = createService();
    const sendRejectionEmail = jest
      .spyOn(getPaymentsServicePrivate(service), "sendBankTransferRejectedEmail")
      .mockResolvedValue(true);

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_4",
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      providerRef: "BT-004",
      processedAt: null,
      payerEmail: "guest@example.com",
      payerName: null,
      userId: null,
      orderId: null,
      metadata: {
        locale: "fr",
        fullName: "Guest Checkout",
      },
      order: null,
      user: null,
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({ id: "audit_4" });

    const result = await service.rejectBankTransfer({
      paymentId: "payment_4",
      adminId: "admin_4",
      adminNote: "Receipt image is unreadable.",
    });

    expect(notificationsService.createSystemNotification).not.toHaveBeenCalled();
    expect(sendRejectionEmail).toHaveBeenCalledWith({
      email: "guest@example.com",
      userName: "Guest Checkout",
      locale: "fr",
      orderNumber: "BT-004",
      paymentReference: "BT-004",
      rejectionReason: "Receipt image is unreadable.",
    });
    expect(result).toEqual({
      id: "payment_4",
      status: PaymentStatus.FAILED,
      message: "Bank transfer rejected.",
    });
  });

  it("rejects blank admin notes before touching the database", async () => {
    const { service, prisma } = createService();

    await expect(
      service.rejectBankTransfer({
        paymentId: "payment_5",
        adminId: "admin_5",
        adminNote: "   ",
      })
    ).rejects.toThrow(BadRequestException);

    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });
});
