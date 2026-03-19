/// <reference types="jest" />
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Test, type TestingModule } from "@nestjs/testing";
import { ROLES_KEY } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard, RolesGuard } from "../auth/guards/index.js";
import { UserRole } from "../auth/index.js";
import { AdminDashboardAnalyticsService } from "./admin-dashboard-analytics.service.js";
import { AdminSystemController } from "./admin-system.controller.js";
import { AdminSystemLogsService } from "./admin-system-logs.service.js";
import { AdminSystemSettingsService } from "./admin-system-settings.service.js";
import { ProductionDelayAdminService } from "./production-delay-admin.service.js";

const productionDelayAdminServiceMock = {
  getProductionStatus: jest.fn(),
  updateProductionDelayOverride: jest.fn(),
};

const adminSystemSettingsServiceMock = {
  getPaymentGateways: jest.fn(),
  updatePaymentGateway: jest.fn(),
  getSettings: jest.fn(),
  updateSetting: jest.fn(),
};

const adminSystemLogsServiceMock = {
  listAuditLogs: jest.fn(),
  listErrorLogs: jest.fn(),
  applyErrorLogAction: jest.fn(),
};

const adminDashboardAnalyticsServiceMock = {
  getDashboardStats: jest.fn(),
  getDashboardCharts: jest.fn(),
};

describe("AdminSystemController", () => {
  let controller: AdminSystemController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSystemController],
      providers: [
        {
          provide: ProductionDelayAdminService,
          useValue: productionDelayAdminServiceMock,
        },
        {
          provide: AdminSystemSettingsService,
          useValue: adminSystemSettingsServiceMock,
        },
        {
          provide: AdminSystemLogsService,
          useValue: adminSystemLogsServiceMock,
        },
        {
          provide: AdminDashboardAnalyticsService,
          useValue: adminDashboardAnalyticsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AdminSystemController>(AdminSystemController);
    jest.resetAllMocks();
  });

  it("applies admin role guards at controller level", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminSystemController) as UserRole[];
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminSystemController) as unknown[];

    expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it("delegates GET /admin/system/audit-logs", async () => {
    adminSystemLogsServiceMock.listAuditLogs.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
      totalItems: 0,
      limit: 25,
    });

    const query = {
      action: "ADMIN_SYSTEM_SETTING_UPDATED",
      entityType: "SYSTEM_SETTING",
      limit: 25,
    } as const;

    await expect(controller.getAuditLogs(query)).resolves.toMatchObject({
      hasMore: false,
      totalItems: 0,
    });
    expect(adminSystemLogsServiceMock.listAuditLogs).toHaveBeenCalledWith(query);
  });

  it("delegates GET /admin/system/error-logs", async () => {
    adminSystemLogsServiceMock.listErrorLogs.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
      totalItems: 0,
      limit: 25,
    });

    const query = {
      severity: "error",
      status: "open",
      limit: 25,
    } as const;

    await expect(controller.getErrorLogs(query)).resolves.toMatchObject({
      hasMore: false,
      totalItems: 0,
    });
    expect(adminSystemLogsServiceMock.listErrorLogs).toHaveBeenCalledWith(query);
  });

  it("delegates GET /admin/system/dashboard/stats", async () => {
    adminDashboardAnalyticsServiceMock.getDashboardStats.mockResolvedValue({
      totalOrders: { value: 42, deltaPercent: 16.7 },
      totalRevenueNgn: { value: 245000, deltaPercent: 8.2 },
      activeBooksInProduction: { value: 9, deltaPercent: 12.5 },
      pendingBankTransfers: { value: 3, deltaPercent: -25 },
      slaAtRiskCount: 1,
      range: {
        key: "30d",
        from: "2026-02-17T00:00:00.000Z",
        to: "2026-03-19T00:00:00.000Z",
        previousFrom: "2026-01-18T00:00:00.000Z",
        previousTo: "2026-02-17T00:00:00.000Z",
      },
      lastUpdatedAt: "2026-03-19T10:00:00.000Z",
    });

    const query = { range: "30d" } as const;

    await expect(controller.getDashboardStats(query)).resolves.toMatchObject({
      slaAtRiskCount: 1,
    });
    expect(adminDashboardAnalyticsServiceMock.getDashboardStats).toHaveBeenCalledWith(query);
  });

  it("delegates GET /admin/system/dashboard/charts", async () => {
    adminDashboardAnalyticsServiceMock.getDashboardCharts.mockResolvedValue({
      revenueAndOrdersTrend: [],
      paymentMethodDistribution: [],
      orderStatusDistribution: [],
      bankTransferSlaTrend: [],
      range: {
        key: "7d",
        from: "2026-03-12T00:00:00.000Z",
        to: "2026-03-19T00:00:00.000Z",
        previousFrom: "2026-03-05T00:00:00.000Z",
        previousTo: "2026-03-12T00:00:00.000Z",
      },
      refreshedAt: "2026-03-19T10:00:00.000Z",
    });

    const query = { range: "7d" } as const;

    await expect(controller.getDashboardCharts(query)).resolves.toMatchObject({
      refreshedAt: "2026-03-19T10:00:00.000Z",
    });
    expect(adminDashboardAnalyticsServiceMock.getDashboardCharts).toHaveBeenCalledWith(query);
  });

  it("delegates PATCH /admin/system/error-logs/:id", async () => {
    adminSystemLogsServiceMock.applyErrorLogAction.mockResolvedValue({
      id: "fp-1",
      fingerprint: "fp-1",
      status: "acknowledged",
      ownerUserId: null,
      ownerName: null,
      note: null,
      updatedAt: "2026-03-19T10:00:00.000Z",
      updatedBy: "cmadmin1",
      actionApplied: "acknowledge",
    });

    const body = {
      action: "acknowledge",
    } as const;

    await expect(controller.applyErrorLogAction("fp-1", body, "cmadmin1")).resolves.toMatchObject({
      fingerprint: "fp-1",
      status: "acknowledged",
    });
    expect(adminSystemLogsServiceMock.applyErrorLogAction).toHaveBeenCalledWith(
      "fp-1",
      body,
      "cmadmin1"
    );
  });
});
