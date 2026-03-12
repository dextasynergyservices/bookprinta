/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  ProductionDelayService,
  type ProductionDelayStatusResolution,
} from "./production-delay.service.js";
import { ProductionDelayAdminService } from "./production-delay-admin.service.js";
import { ProductionDelayMonitorService } from "./production-delay-monitor.service.js";

const systemSettingUpsert = jest.fn();

const mockPrismaService = {
  systemSetting: {
    upsert: systemSettingUpsert,
  },
};

const mockProductionDelayService = {
  resolveStatus: jest.fn(),
};

const mockProductionDelayMonitorService = {
  runCheck: jest.fn(),
};

describe("ProductionDelayAdminService", () => {
  let service: ProductionDelayAdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionDelayAdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ProductionDelayService, useValue: mockProductionDelayService },
        { provide: ProductionDelayMonitorService, useValue: mockProductionDelayMonitorService },
      ],
    }).compile();

    service = module.get<ProductionDelayAdminService>(ProductionDelayAdminService);
    jest.clearAllMocks();
  });

  it("returns the resolved production delay status for admin tooling", async () => {
    mockProductionDelayService.resolveStatus.mockResolvedValue(createResolution());

    await expect(service.getProductionStatus()).resolves.toEqual({
      threshold: 20,
      backlogCount: 24,
      affectedUserCount: 2,
      autoDelayActive: true,
      persistedDelayActive: false,
      manualOverrideState: "auto",
      isDelayActive: true,
      resolvedDelayStateSource: "auto",
      activeEvent: {
        id: "cmevent1",
        source: "AUTO",
        activatedAt: "2026-03-11T10:00:00.000Z",
      },
    });
  });

  it("updates the override setting and reruns the shared monitor path for admin control", async () => {
    mockProductionDelayMonitorService.runCheck.mockResolvedValue({
      action: "opened_manual_event",
      activeEventId: "cmevent2",
      resolution: createResolution({
        manualOverrideState: "force_active",
        resolvedDelayStateSource: "manual_override",
      }),
    });

    const result = await service.updateProductionDelayOverride("cmadmin1", {
      overrideState: "force_active",
      notes: "Manual trigger from admin panel",
    });

    expect(systemSettingUpsert).toHaveBeenCalledWith({
      where: {
        key: "production_delay_override_state",
      },
      update: {
        value: "force_active",
        description:
          "Admin override mode for production delay alerts: auto | force_active | force_inactive",
        updatedBy: "cmadmin1",
      },
      create: {
        key: "production_delay_override_state",
        value: "force_active",
        description:
          "Admin override mode for production delay alerts: auto | force_active | force_inactive",
        updatedBy: "cmadmin1",
      },
    });
    expect(mockProductionDelayMonitorService.runCheck).toHaveBeenCalledWith({
      actorId: "cmadmin1",
      notes: "Manual trigger from admin panel",
    });
    expect(result).toEqual({
      threshold: 20,
      backlogCount: 24,
      affectedUserCount: 2,
      autoDelayActive: true,
      persistedDelayActive: false,
      manualOverrideState: "force_active",
      isDelayActive: true,
      resolvedDelayStateSource: "manual_override",
      activeEvent: {
        id: "cmevent1",
        source: "AUTO",
        activatedAt: "2026-03-11T10:00:00.000Z",
      },
    });
  });

  it("can return control to automatic threshold evaluation", async () => {
    mockProductionDelayMonitorService.runCheck.mockResolvedValue({
      action: "resolved_manual_event",
      activeEventId: null,
      resolution: createResolution({
        manualOverrideState: "auto",
        autoDelayActive: false,
        isDelayActive: false,
        resolvedDelayStateSource: "none",
        activeEvent: null,
        affectedUsers: [],
        backlogCount: 3,
      }),
    });

    const result = await service.updateProductionDelayOverride("cmadmin2", {
      overrideState: "auto",
      notes: undefined,
    });

    expect(mockProductionDelayMonitorService.runCheck).toHaveBeenCalledWith({
      actorId: "cmadmin2",
      notes: undefined,
    });
    expect(result).toEqual({
      threshold: 20,
      backlogCount: 3,
      affectedUserCount: 0,
      autoDelayActive: false,
      persistedDelayActive: false,
      manualOverrideState: "auto",
      isDelayActive: false,
      resolvedDelayStateSource: "none",
      activeEvent: null,
    });
  });
});

function createResolution(
  overrides: Partial<ProductionDelayStatusResolution> = {}
): ProductionDelayStatusResolution {
  return {
    ...baseResolution(),
    ...overrides,
  };
}

function baseResolution(): ProductionDelayStatusResolution {
  return {
    threshold: 20,
    backlogCount: 24,
    autoDelayActive: true,
    persistedDelayActive: false,
    manualOverrideState: "auto",
    isDelayActive: true,
    resolvedDelayStateSource: "auto",
    activeEvent: {
      id: "cmevent1",
      source: "AUTO",
      activatedAt: "2026-03-11T10:00:00.000Z",
    },
    affectedBooks: [],
    affectedUsers: [
      {
        userId: "cmuser1",
        email: "ada@example.com",
        firstName: "Ada",
        preferredLanguage: "en",
        books: [],
      },
      {
        userId: "cmuser2",
        email: "chi@example.com",
        firstName: "Chi",
        preferredLanguage: "fr",
        books: [],
      },
    ],
  };
}
