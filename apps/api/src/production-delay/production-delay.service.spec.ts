/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  ProductionDelayService,
  type ProductionDelayStatusResolution,
} from "./production-delay.service.js";
import { SystemSettingsCacheService } from "./system-settings-cache.service.js";

const mockPrismaService = {
  productionDelayEvent: {
    findFirst: jest.fn(),
  },
  book: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockSettingsCache = {
  getMany: jest.fn(),
};

describe("ProductionDelayService", () => {
  let service: ProductionDelayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionDelayService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SystemSettingsCacheService, useValue: mockSettingsCache },
      ],
    }).compile();

    service = module.get<ProductionDelayService>(ProductionDelayService);
    jest.resetAllMocks();
  });

  it("resolves active backlog books and users by auto threshold logic", async () => {
    mockSettingsCache.getMany.mockResolvedValue(
      new Map([
        ["production_backlog_threshold", "2"],
        ["production_delay_active", "false"],
        ["production_delay_override_state", "auto"],
      ])
    );
    mockPrismaService.productionDelayEvent.findFirst.mockResolvedValue(null);
    mockPrismaService.book.count.mockResolvedValue(2);
    mockPrismaService.book.findMany.mockResolvedValue([
      {
        id: "cmbook111111111111111111111111",
        orderId: "cmorder11111111111111111111111",
        userId: "cmuser111111111111111111111111",
        status: "APPROVED",
        productionStatus: "PRINTING",
        title: null,
        user: {
          email: "ada@example.com",
          firstName: "Ada",
          preferredLanguage: "en",
          emailNotificationsEnabled: true,
        },
        order: {
          customQuote: null,
        },
        files: [{ fileName: "my-first-book.docx" }],
      },
      {
        id: "cmbook222222222222222222222222",
        orderId: "cmorder22222222222222222222222",
        userId: "cmuser111111111111111111111111",
        status: "FORMATTING",
        productionStatus: null,
        title: "Second Book",
        user: {
          email: "ada@example.com",
          firstName: "Ada",
          preferredLanguage: "en",
          emailNotificationsEnabled: true,
        },
        order: {
          customQuote: null,
        },
        files: [],
      },
    ]);

    await expect(service.resolveStatus()).resolves.toEqual<ProductionDelayStatusResolution>({
      threshold: 2,
      backlogCount: 2,
      autoDelayActive: true,
      persistedDelayActive: false,
      manualOverrideState: "auto",
      isDelayActive: true,
      resolvedDelayStateSource: "auto",
      activeEvent: null,
      affectedBooks: [
        {
          bookId: "cmbook111111111111111111111111",
          orderId: "cmorder11111111111111111111111",
          userId: "cmuser111111111111111111111111",
          title: "my first book",
          lifecycleStatus: "PRINTING",
        },
        {
          bookId: "cmbook222222222222222222222222",
          orderId: "cmorder22222222222222222222222",
          userId: "cmuser111111111111111111111111",
          title: "Second Book",
          lifecycleStatus: "FORMATTING",
        },
      ],
      affectedUsers: [
        {
          userId: "cmuser111111111111111111111111",
          email: "ada@example.com",
          firstName: "Ada",
          preferredLanguage: "en",
          emailNotificationsEnabled: true,
          books: [
            {
              bookId: "cmbook111111111111111111111111",
              orderId: "cmorder11111111111111111111111",
              userId: "cmuser111111111111111111111111",
              title: "my first book",
              lifecycleStatus: "PRINTING",
            },
            {
              bookId: "cmbook222222222222222222222222",
              orderId: "cmorder22222222222222222222222",
              userId: "cmuser111111111111111111111111",
              title: "Second Book",
              lifecycleStatus: "FORMATTING",
            },
          ],
        },
      ],
    });
  });

  it("forces the delay active when manual override is enabled below threshold", async () => {
    mockSettingsCache.getMany.mockResolvedValue(
      new Map([
        ["production_backlog_threshold", "20"],
        ["production_delay_active", "false"],
        ["production_delay_override_state", "force_active"],
      ])
    );
    mockPrismaService.productionDelayEvent.findFirst.mockResolvedValue({
      id: "cmdelay111111111111111111111111",
      source: "MANUAL",
      activatedAt: new Date("2026-03-11T12:00:00.000Z"),
    });
    mockPrismaService.book.count.mockResolvedValue(1);
    mockPrismaService.book.findMany.mockResolvedValue([
      {
        id: "cmbook333333333333333333333333",
        orderId: "cmorder33333333333333333333333",
        userId: "cmuser222222222222222222222222",
        status: "APPROVED",
        productionStatus: "IN_PRODUCTION",
        title: "Manual Override Book",
        user: {
          email: "bisi@example.com",
          firstName: "Bisi",
          preferredLanguage: "fr",
        },
        order: {
          customQuote: null,
        },
        files: [],
      },
    ]);

    const result = await service.resolveStatus();

    expect(result.threshold).toBe(20);
    expect(result.backlogCount).toBe(1);
    expect(result.autoDelayActive).toBe(false);
    expect(result.manualOverrideState).toBe("force_active");
    expect(result.isDelayActive).toBe(true);
    expect(result.resolvedDelayStateSource).toBe("manual_override");
    expect(result.activeEvent).toEqual({
      id: "cmdelay111111111111111111111111",
      source: "MANUAL",
      activatedAt: "2026-03-11T12:00:00.000Z",
    });
  });

  it("forces the delay inactive when manual override disables an otherwise active backlog", async () => {
    mockSettingsCache.getMany.mockResolvedValue(
      new Map([
        ["production_backlog_threshold", "1"],
        ["production_delay_active", "true"],
        ["production_delay_override_state", "force_inactive"],
      ])
    );
    mockPrismaService.productionDelayEvent.findFirst.mockResolvedValue({
      id: "cmdelay222222222222222222222222",
      source: "AUTO",
      activatedAt: new Date("2026-03-11T13:00:00.000Z"),
    });
    mockPrismaService.book.count.mockResolvedValue(1);
    mockPrismaService.book.findMany.mockResolvedValue([
      {
        id: "cmbook444444444444444444444444",
        orderId: "cmorder44444444444444444444444",
        userId: "cmuser333333333333333333333333",
        status: "FORMATTING",
        productionStatus: null,
        title: null,
        user: {
          email: "chioma@example.com",
          firstName: "Chioma",
          preferredLanguage: "es",
        },
        order: {
          customQuote: {
            workingTitle: "Override Off Book",
          },
        },
        files: [],
      },
    ]);

    const result = await service.resolveStatus();

    expect(result.threshold).toBe(1);
    expect(result.backlogCount).toBe(1);
    expect(result.autoDelayActive).toBe(true);
    expect(result.persistedDelayActive).toBe(true);
    expect(result.manualOverrideState).toBe("force_inactive");
    expect(result.isDelayActive).toBe(false);
    expect(result.resolvedDelayStateSource).toBe("manual_override");
    expect(result.affectedBooks[0]).toMatchObject({
      title: "Override Off Book",
      lifecycleStatus: "FORMATTING",
    });
  });
});
