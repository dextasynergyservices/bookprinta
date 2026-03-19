/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProductionDelayService } from "./production-delay.service.js";
import { ProductionDelayDeliveryService } from "./production-delay-delivery.service.js";
import { ProductionDelayMonitorService } from "./production-delay-monitor.service.js";

const txSystemSettingUpsert = jest.fn();
const txProductionDelayEventCreate = jest.fn();
const txProductionDelayEventUpdate = jest.fn();

const mockPrismaService = {
  $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      systemSetting: {
        upsert: txSystemSettingUpsert,
      },
      productionDelayEvent: {
        create: txProductionDelayEventCreate,
        update: txProductionDelayEventUpdate,
      },
      book: {},
    })
  ),
};

const mockProductionDelayService = {
  resolveStatus: jest.fn(),
};

const mockProductionDelayDeliveryService = {
  processRunResult: jest.fn(),
};

describe("ProductionDelayMonitorService", () => {
  let service: ProductionDelayMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionDelayMonitorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ProductionDelayService, useValue: mockProductionDelayService },
        {
          provide: ProductionDelayDeliveryService,
          useValue: mockProductionDelayDeliveryService,
        },
      ],
    }).compile();

    service = module.get<ProductionDelayMonitorService>(ProductionDelayMonitorService);
    jest.clearAllMocks();
  });

  it("opens an AUTO event when the threshold is crossed without an active event", async () => {
    mockProductionDelayService.resolveStatus.mockResolvedValue({
      threshold: 20,
      backlogCount: 24,
      autoDelayActive: true,
      persistedDelayActive: false,
      manualOverrideState: "auto",
      isDelayActive: true,
      resolvedDelayStateSource: "auto",
      activeEvent: null,
      affectedBooks: [],
      affectedUsers: [
        {
          userId: "cmuser1",
          email: "ada@example.com",
          firstName: "Ada",
          preferredLanguage: "en",
          emailNotificationsEnabled: true,
          books: [],
        },
      ],
    });
    txProductionDelayEventCreate.mockResolvedValue({ id: "cmdelay1" });

    const result = await service.runScheduledCheck();

    expect(txSystemSettingUpsert).toHaveBeenCalledWith({
      where: { key: "production_delay_active" },
      update: expect.objectContaining({ value: "true" }),
      create: expect.objectContaining({ key: "production_delay_active", value: "true" }),
    });
    expect(txProductionDelayEventCreate).toHaveBeenCalledWith({
      data: {
        source: "AUTO",
        status: "ACTIVE",
        threshold: 20,
        backlogCountOnStart: 24,
        affectedUserCount: 1,
        lastEvaluatedAt: expect.any(Date),
      },
      select: {
        id: true,
      },
    });
    expect(result.action).toBe("opened_auto_event");
    expect(result.activeEventId).toBe("cmdelay1");
    expect(mockProductionDelayDeliveryService.processRunResult).toHaveBeenCalledWith(result);
  });

  it("resolves an AUTO event when the backlog is no longer active in auto mode", async () => {
    mockProductionDelayService.resolveStatus.mockResolvedValue({
      threshold: 20,
      backlogCount: 5,
      autoDelayActive: false,
      persistedDelayActive: true,
      manualOverrideState: "auto",
      isDelayActive: false,
      resolvedDelayStateSource: "none",
      activeEvent: {
        id: "cmdelay2",
        source: "AUTO",
        activatedAt: "2026-03-11T10:00:00.000Z",
      },
      affectedBooks: [],
      affectedUsers: [],
    });

    const result = await service.runScheduledCheck();

    expect(txProductionDelayEventUpdate).toHaveBeenCalledWith({
      where: { id: "cmdelay2" },
      data: {
        status: "RESOLVED",
        resolvedAt: expect.any(Date),
        lastEvaluatedAt: expect.any(Date),
        backlogCountOnResolve: 5,
        affectedUserCount: 0,
      },
    });
    expect(result.action).toBe("resolved_auto_event");
    expect(result.activeEventId).toBeNull();
    expect(mockProductionDelayDeliveryService.processRunResult).toHaveBeenCalledWith(result);
  });

  it("does not open a new AUTO event while force_inactive override suppresses an active backlog", async () => {
    mockProductionDelayService.resolveStatus.mockResolvedValue({
      threshold: 20,
      backlogCount: 25,
      autoDelayActive: true,
      persistedDelayActive: false,
      manualOverrideState: "force_inactive",
      isDelayActive: false,
      resolvedDelayStateSource: "manual_override",
      activeEvent: null,
      affectedBooks: [],
      affectedUsers: [],
    });

    const result = await service.runScheduledCheck();

    expect(txProductionDelayEventCreate).not.toHaveBeenCalled();
    expect(txProductionDelayEventUpdate).not.toHaveBeenCalled();
    expect(result.action).toBe("none");
    expect(result.activeEventId).toBeNull();
    expect(mockProductionDelayDeliveryService.processRunResult).toHaveBeenCalledWith(result);
  });

  it("opens a MANUAL event when force_active override is enabled without an active event", async () => {
    mockProductionDelayService.resolveStatus.mockResolvedValue({
      threshold: 20,
      backlogCount: 3,
      autoDelayActive: false,
      persistedDelayActive: false,
      manualOverrideState: "force_active",
      isDelayActive: true,
      resolvedDelayStateSource: "manual_override",
      activeEvent: null,
      affectedBooks: [],
      affectedUsers: [],
    });
    txProductionDelayEventCreate.mockResolvedValue({ id: "cmdelay3" });

    const result = await service.runScheduledCheck();

    expect(txProductionDelayEventCreate).toHaveBeenCalledWith({
      data: {
        source: "MANUAL",
        status: "ACTIVE",
        threshold: 20,
        backlogCountOnStart: 3,
        affectedUserCount: 0,
        lastEvaluatedAt: expect.any(Date),
      },
      select: {
        id: true,
      },
    });
    expect(result.action).toBe("opened_manual_event");
    expect(result.activeEventId).toBe("cmdelay3");
    expect(mockProductionDelayDeliveryService.processRunResult).toHaveBeenCalledWith(result);
  });

  it("records admin metadata when a manual event is opened from an admin override", async () => {
    mockProductionDelayService.resolveStatus.mockResolvedValue({
      threshold: 20,
      backlogCount: 3,
      autoDelayActive: false,
      persistedDelayActive: false,
      manualOverrideState: "force_active",
      isDelayActive: true,
      resolvedDelayStateSource: "manual_override",
      activeEvent: null,
      affectedBooks: [],
      affectedUsers: [],
    });
    txProductionDelayEventCreate.mockResolvedValue({ id: "cmdelay4" });

    await service.runCheck({
      actorId: "cmadmin1",
      notes: "Manual production delay trigger",
    });

    expect(txProductionDelayEventCreate).toHaveBeenCalledWith({
      data: {
        source: "MANUAL",
        status: "ACTIVE",
        threshold: 20,
        backlogCountOnStart: 3,
        affectedUserCount: 0,
        lastEvaluatedAt: expect.any(Date),
        triggeredBy: "cmadmin1",
        notes: "Manual production delay trigger",
      },
      select: {
        id: true,
      },
    });
  });

  it("records admin metadata when a manual override resolves an active event", async () => {
    mockProductionDelayService.resolveStatus.mockResolvedValue({
      threshold: 20,
      backlogCount: 0,
      autoDelayActive: false,
      persistedDelayActive: true,
      manualOverrideState: "force_inactive",
      isDelayActive: false,
      resolvedDelayStateSource: "manual_override",
      activeEvent: {
        id: "cmdelay5",
        source: "MANUAL",
        activatedAt: "2026-03-11T10:00:00.000Z",
      },
      affectedBooks: [],
      affectedUsers: [],
    });

    await service.runCheck({
      actorId: "cmadmin2",
      notes: "Delay cleared manually",
    });

    expect(txProductionDelayEventUpdate).toHaveBeenCalledWith({
      where: { id: "cmdelay5" },
      data: {
        status: "RESOLVED",
        resolvedAt: expect.any(Date),
        lastEvaluatedAt: expect.any(Date),
        backlogCountOnResolve: 0,
        affectedUserCount: 0,
        resolvedBy: "cmadmin2",
        notes: "Delay cleared manually",
      },
    });
  });
});
