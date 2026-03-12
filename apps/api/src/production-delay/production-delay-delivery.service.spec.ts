/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import type { BookStatus } from "../generated/prisma/enums.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ProductionDelayAffectedUser } from "./production-delay.service.js";
import { ProductionDelayDeliveryService } from "./production-delay-delivery.service.js";
import type { ProductionDelayMonitorRunResult } from "./production-delay-monitor.service.js";

const mockResendSend = jest.fn();
const mockRenderProductionDelayEmail = jest.fn();

jest.mock("@bookprinta/emails/render", () => ({
  renderProductionDelayEmail: (...args: unknown[]) => mockRenderProductionDelayEmail(...args),
}));

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}));

const txRecipientCreateMany = jest.fn();
const txRecipientUpdateMany = jest.fn();
const txRecipientFindMany = jest.fn();
const topLevelRecipientFindMany = jest.fn();
const topLevelRecipientUpdateMany = jest.fn();

const mockPrismaService = {
  $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      productionDelayEventRecipient: {
        createMany: txRecipientCreateMany,
        updateMany: txRecipientUpdateMany,
        findMany: txRecipientFindMany,
      },
      notification: {},
      user: {},
    })
  ),
  productionDelayEventRecipient: {
    findMany: topLevelRecipientFindMany,
    updateMany: topLevelRecipientUpdateMany,
  },
};

const mockNotificationsService = {
  createProductionDelayNotifications: jest.fn(),
  createSystemNotification: jest.fn(),
};

const originalResendApiKey = process.env.RESEND_API_KEY;
const originalFrontendUrl = process.env.FRONTEND_URL;
const originalDefaultFromEmail = process.env.DEFAULT_FROM_EMAIL;

describe("ProductionDelayDeliveryService", () => {
  let service: ProductionDelayDeliveryService;

  beforeEach(async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.DEFAULT_FROM_EMAIL = "BookPrinta <info@bookprinta.com>";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionDelayDeliveryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ProductionDelayDeliveryService>(ProductionDelayDeliveryService);
    jest.clearAllMocks();
    mockRenderProductionDelayEmail.mockResolvedValue({
      html: "<p>Production delay</p>",
      subject: "Production update",
    });
    mockResendSend.mockResolvedValue({ error: null });
  });

  afterAll(() => {
    process.env.RESEND_API_KEY = originalResendApiKey;
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.DEFAULT_FROM_EMAIL = originalDefaultFromEmail;
  });

  it("creates one-time in-app notifications and emails when a delay event becomes active", async () => {
    txRecipientFindMany.mockResolvedValue([
      {
        id: "cmrecipient1",
        userId: "cmuser1",
        delayNotificationCreatedAt: null,
        emailSentAt: null,
      },
    ]);

    await service.processRunResult(
      createMonitorRunResult({
        activeEventId: "cmevent1",
        action: "opened_auto_event",
        resolution: {
          isDelayActive: true,
          affectedUsers: [createAffectedUser()],
        },
      })
    );

    expect(txRecipientCreateMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: "cmevent1",
          userId: "cmuser1",
          firstAffectedAt: expect.any(Date),
          lastAffectedAt: expect.any(Date),
        },
      ],
      skipDuplicates: true,
    });
    expect(txRecipientUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        eventId: "cmevent1",
        userId: {
          in: ["cmuser1"],
        },
      },
      data: {
        lastAffectedAt: expect.any(Date),
      },
    });
    expect(mockNotificationsService.createProductionDelayNotifications).toHaveBeenCalledWith(
      {
        recipients: [
          {
            userId: "cmuser1",
            orderId: "cmorder1",
            bookId: "cmbook1",
            actionHref: "/dashboard/orders/cmorder1",
          },
        ],
      },
      expect.any(Object)
    );
    expect(txRecipientUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: {
          in: ["cmrecipient1"],
        },
      },
      data: {
        delayNotificationCreatedAt: expect.any(Date),
      },
    });
    expect(mockRenderProductionDelayEmail).toHaveBeenCalledWith({
      locale: "en",
      userName: "Ada",
      affectedBooks: ["The Lagos Chronicle"],
      dashboardUrl: "http://localhost:3000/en/dashboard",
    });
    expect(mockResendSend).toHaveBeenCalledWith({
      from: "BookPrinta <info@bookprinta.com>",
      to: "ada@example.com",
      subject: "Production update",
      html: "<p>Production delay</p>",
    });
    expect(topLevelRecipientUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "cmrecipient1",
        emailSentAt: null,
      },
      data: {
        emailSentAt: expect.any(Date),
      },
    });
  });

  it("does not recreate notifications or resend email for recipients already handled in the same event", async () => {
    txRecipientFindMany.mockResolvedValue([
      {
        id: "cmrecipient1",
        userId: "cmuser1",
        delayNotificationCreatedAt: new Date("2026-03-11T10:00:00.000Z"),
        emailSentAt: new Date("2026-03-11T10:05:00.000Z"),
      },
    ]);

    await service.processRunResult(
      createMonitorRunResult({
        activeEventId: "cmevent1",
        action: "updated_active_event",
        resolution: {
          isDelayActive: true,
          affectedUsers: [createAffectedUser()],
        },
      })
    );

    expect(mockNotificationsService.createProductionDelayNotifications).not.toHaveBeenCalled();
    expect(mockRenderProductionDelayEmail).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(topLevelRecipientUpdateMany).not.toHaveBeenCalled();
  });

  it("attaches and notifies only new users who join an already-active event", async () => {
    txRecipientFindMany.mockResolvedValue([
      {
        id: "cmrecipient-existing",
        userId: "cmuser1",
        delayNotificationCreatedAt: new Date("2026-03-11T10:00:00.000Z"),
        emailSentAt: new Date("2026-03-11T10:05:00.000Z"),
      },
      {
        id: "cmrecipient-new",
        userId: "cmuser2",
        delayNotificationCreatedAt: null,
        emailSentAt: null,
      },
    ]);

    await service.processRunResult(
      createMonitorRunResult({
        activeEventId: "cmevent1",
        action: "updated_active_event",
        resolution: {
          isDelayActive: true,
          affectedUsers: [
            createAffectedUser(),
            createAffectedUser({
              userId: "cmuser2",
              email: "chi@example.com",
              firstName: "Chi",
              preferredLanguage: "fr",
              books: [
                {
                  bookId: "cmbook2",
                  orderId: "cmorder2",
                  userId: "cmuser2",
                  title: "Nuit de Lagos",
                  lifecycleStatus: "PRINTING",
                },
              ],
            }),
          ],
        },
      })
    );

    expect(mockNotificationsService.createProductionDelayNotifications).toHaveBeenCalledWith(
      {
        recipients: [
          {
            userId: "cmuser2",
            orderId: "cmorder2",
            bookId: "cmbook2",
            actionHref: "/dashboard/orders/cmorder2",
          },
        ],
      },
      expect.any(Object)
    );
    expect(mockRenderProductionDelayEmail).toHaveBeenCalledWith({
      locale: "fr",
      userName: "Chi",
      affectedBooks: ["Nuit de Lagos"],
      dashboardUrl: "http://localhost:3000/fr/dashboard",
    });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockResendSend).toHaveBeenCalledWith({
      from: "BookPrinta <info@bookprinta.com>",
      to: "chi@example.com",
      subject: "Production update",
      html: "<p>Production delay</p>",
    });
  });

  it("creates one-off resolution notifications for unresolved recipients when an event ends", async () => {
    topLevelRecipientFindMany.mockResolvedValue([
      {
        id: "cmrecipient1",
        userId: "cmuser1",
        resolutionNotificationCreatedAt: null,
      },
    ]);

    await service.processRunResult(
      createMonitorRunResult({
        activeEventId: null,
        action: "resolved_auto_event",
        resolution: {
          isDelayActive: false,
          activeEvent: {
            id: "cmevent1",
            source: "AUTO",
            activatedAt: "2026-03-11T09:00:00.000Z",
          },
        },
      })
    );

    expect(mockNotificationsService.createSystemNotification).toHaveBeenCalledTimes(1);
    expect(mockNotificationsService.createSystemNotification).toHaveBeenCalledWith(
      {
        userId: "cmuser1",
        titleKey: "notifications.production_delay_resolved.title",
        messageKey: "notifications.production_delay_resolved.message",
        fallbackTitle: "Production update",
        fallbackMessage:
          "Production demand has stabilized and printing timelines are returning to normal.",
        action: {
          kind: "navigate",
          href: "/dashboard",
        },
        presentation: {
          tone: "default",
        },
      },
      expect.any(Object)
    );
    expect(txRecipientUpdateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["cmrecipient1"],
        },
      },
      data: {
        resolutionNotificationCreatedAt: expect.any(Date),
      },
    });
  });
});

function createAffectedUser(
  overrides: Partial<ProductionDelayAffectedUser> = {}
): ProductionDelayAffectedUser {
  return {
    userId: overrides.userId ?? "cmuser1",
    email: overrides.email ?? "ada@example.com",
    firstName: overrides.firstName ?? "Ada",
    preferredLanguage: overrides.preferredLanguage ?? "en",
    books: overrides.books ?? [
      {
        bookId: "cmbook1",
        orderId: "cmorder1",
        userId: overrides.userId ?? "cmuser1",
        title: "The Lagos Chronicle",
        lifecycleStatus: "PRINTING" as BookStatus,
      },
    ],
  };
}

function createMonitorRunResult(
  overrides: {
    activeEventId?: ProductionDelayMonitorRunResult["activeEventId"];
    action?: ProductionDelayMonitorRunResult["action"];
    resolution?: Partial<ProductionDelayMonitorRunResult["resolution"]>;
  } = {}
): ProductionDelayMonitorRunResult {
  return {
    activeEventId: overrides.activeEventId ?? null,
    action: overrides.action ?? "none",
    resolution: {
      threshold: 20,
      backlogCount: 24,
      autoDelayActive: true,
      persistedDelayActive: false,
      manualOverrideState: "auto",
      isDelayActive: true,
      resolvedDelayStateSource: "auto",
      activeEvent: null,
      affectedBooks: [],
      affectedUsers: [],
      ...overrides.resolution,
    },
  };
}
