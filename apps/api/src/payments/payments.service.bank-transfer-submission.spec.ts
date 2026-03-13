/// <reference types="jest" />
import { PaymentProvider, PaymentStatus, PaymentType } from "../generated/prisma/enums.js";
import { PaymentsService } from "./payments.service.js";

type PaymentsServicePrivate = {
  generateReference: () => string;
  sendBankTransferAdminWhatsApp: (...args: never[]) => Promise<void>;
  sendBankTransferUserEmail: (...args: never[]) => Promise<void>;
  sendBankTransferAdminEmail: (...args: never[]) => Promise<void>;
};

function getPaymentsServicePrivate(service: PaymentsService) {
  return service as unknown as PaymentsServicePrivate;
}

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn(),
    notifyAdminsBankTransferReceived: jest.fn(),
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    {} as never,
    {} as never,
    { sendRegistrationLink: jest.fn() } as never,
    notificationsService as never,
    { assertBillingGateAccess: jest.fn() } as never
  );

  return {
    service,
    prisma,
    notificationsService,
  };
}

describe("PaymentsService bank transfer submission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates an awaiting-approval payment and fans out the bank transfer notifications", async () => {
    const { service, prisma, notificationsService } = createService();
    const servicePrivate = getPaymentsServicePrivate(service);

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.payment.create.mockResolvedValue({
      id: "payment_1",
      status: PaymentStatus.AWAITING_APPROVAL,
    });

    jest.spyOn(servicePrivate, "generateReference").mockReturnValue("BT-2026-0001");
    const sendAdminWhatsApp = jest
      .spyOn(servicePrivate, "sendBankTransferAdminWhatsApp")
      .mockResolvedValue(undefined);
    const sendUserEmail = jest
      .spyOn(servicePrivate, "sendBankTransferUserEmail")
      .mockResolvedValue(undefined);
    const sendAdminEmail = jest
      .spyOn(servicePrivate, "sendBankTransferAdminEmail")
      .mockResolvedValue(undefined);

    const result = await service.submitBankTransfer({
      payerName: "Ada Okafor",
      payerEmail: "ada@example.com",
      payerPhone: "+2348012345678",
      amount: 125000,
      currency: "NGN",
      receiptUrl: "https://example.com/receipts/bt-2026-0001.jpg",
      metadata: {
        locale: "fr",
        packageName: "Legacy",
        addons: [{ name: "ISBN Registration" }, { name: "Express Formatting" }],
      },
    } as never);

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: PaymentProvider.BANK_TRANSFER,
        type: PaymentType.INITIAL,
        amount: 125000,
        currency: "NGN",
        status: PaymentStatus.AWAITING_APPROVAL,
        providerRef: "BT-2026-0001",
        receiptUrl: "https://example.com/receipts/bt-2026-0001.jpg",
        payerName: "Ada Okafor",
        payerEmail: "ada@example.com",
        payerPhone: "+2348012345678",
        metadata: expect.objectContaining({
          locale: "fr",
          packageName: "Legacy",
          fullName: "Ada Okafor",
          phone: "+2348012345678",
          payerEmail: "ada@example.com",
          email: "ada@example.com",
        }),
      }),
    });
    expect(notificationsService.notifyAdminsBankTransferReceived).toHaveBeenCalledWith({
      reference: "BT-2026-0001",
      orderNumber: "BT-2026-0001",
      payerName: "Ada Okafor",
      amountLabel: "₦125,000",
    });
    expect(sendAdminWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "BT-2026-0001",
        orderNumber: "BT-2026-0001",
        packageName: "Legacy",
        addons: ["ISBN Registration", "Express Formatting"],
        payerName: "Ada Okafor",
        payerEmail: "ada@example.com",
        payerPhone: "+2348012345678",
        amount: 125000,
        receiptUrl: "https://example.com/receipts/bt-2026-0001.jpg",
        locale: "fr",
      })
    );
    expect(sendUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "BT-2026-0001",
        orderNumber: "BT-2026-0001",
        packageName: "Legacy",
        addons: ["ISBN Registration", "Express Formatting"],
        payerName: "Ada Okafor",
        payerEmail: "ada@example.com",
        payerPhone: "+2348012345678",
        amount: 125000,
        receiptUrl: "https://example.com/receipts/bt-2026-0001.jpg",
        locale: "fr",
      })
    );
    expect(sendAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "BT-2026-0001",
        orderNumber: "BT-2026-0001",
        packageName: "Legacy",
        addons: ["ISBN Registration", "Express Formatting"],
        payerName: "Ada Okafor",
        payerEmail: "ada@example.com",
        payerPhone: "+2348012345678",
        amount: 125000,
        receiptUrl: "https://example.com/receipts/bt-2026-0001.jpg",
        locale: "fr",
      })
    );
    expect(result).toEqual({
      id: "payment_1",
      status: PaymentStatus.AWAITING_APPROVAL,
      message:
        "Your payment is being verified. You will receive an email once approved. " +
        "This typically takes less than 30 minutes.",
    });
  });
});
