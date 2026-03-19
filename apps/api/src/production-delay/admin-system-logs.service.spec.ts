/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { AdminSystemLogsService } from "./admin-system-logs.service.js";

const auditLogFindMany = jest.fn();
const auditLogCount = jest.fn();
const auditLogCreate = jest.fn();
const systemSettingFindMany = jest.fn();
const systemSettingFindUnique = jest.fn();
const systemSettingUpsert = jest.fn();
const userFindUnique = jest.fn();

const prismaMock = {
  auditLog: {
    findMany: auditLogFindMany,
    count: auditLogCount,
    create: auditLogCreate,
  },
  systemSetting: {
    findMany: systemSettingFindMany,
    findUnique: systemSettingFindUnique,
    upsert: systemSettingUpsert,
  },
  user: {
    findUnique: userFindUnique,
  },
};

describe("AdminSystemLogsService", () => {
  let service: AdminSystemLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSystemLogsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AdminSystemLogsService>(AdminSystemLogsService);

    jest.resetAllMocks();
    delete process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_ORG;
    delete process.env.SENTRY_PROJECT;
  });

  it("returns audit logs with filters and cursor pagination", async () => {
    auditLogFindMany.mockResolvedValue([
      {
        id: "cmaudit3",
        userId: "cmadmin1",
        user: {
          id: "cmadmin1",
          firstName: "Ada",
          lastName: "Admin",
          email: "ada@example.com",
        },
        action: "ADMIN_SYSTEM_SETTING_UPDATED",
        entityType: "SYSTEM_SETTING",
        entityId: "production_backlog_threshold",
        ipAddress: "127.0.0.1",
        userAgent: "Jest",
        details: { key: "production_backlog_threshold" },
        createdAt: new Date("2026-03-19T10:00:00.000Z"),
      },
      {
        id: "cmaudit2",
        userId: "cmadmin2",
        user: {
          id: "cmadmin2",
          firstName: "Bola",
          lastName: "Boss",
          email: "bola@example.com",
        },
        action: "ADMIN_SYSTEM_SETTING_UPDATED",
        entityType: "SYSTEM_SETTING",
        entityId: "maintenance_mode",
        ipAddress: "127.0.0.2",
        userAgent: "Jest",
        details: { key: "maintenance_mode" },
        createdAt: new Date("2026-03-19T09:00:00.000Z"),
      },
      {
        id: "cmaudit1",
        userId: null,
        user: null,
        action: "ADMIN_PAYMENT_GATEWAY_UPDATED",
        entityType: "PAYMENT_GATEWAY",
        entityId: "cmgateway1",
        ipAddress: "127.0.0.3",
        userAgent: "Jest",
        details: {},
        createdAt: new Date("2026-03-19T08:00:00.000Z"),
      },
    ]);

    auditLogCount.mockResolvedValue(14);

    const result = await service.listAuditLogs({
      action: "UPDATED",
      entityType: "SYSTEM_SETTING",
      q: "maintenance",
      limit: 2,
    });

    expect(auditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
      })
    );
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe("cmaudit2");
    expect(result.totalItems).toBe(14);
    expect(result.items[0]).toMatchObject({
      id: "cmaudit3",
      actorName: "Ada Admin",
      entityType: "SYSTEM_SETTING",
    });
  });

  it("returns normalized error logs with status filtering and cursor pagination", async () => {
    auditLogFindMany.mockResolvedValue([
      {
        id: "cmerr3",
        userId: null,
        action: "SYSTEM_ERROR_EVENT",
        entityType: "SYSTEM_ERROR_LOG",
        entityId: "fp-gateway-timeout",
        details: {
          timestamp: "2026-03-19T10:00:00.000Z",
          severity: "error",
          service: "payments",
          message: "Gateway timeout",
          fingerprint: "fp-gateway-timeout",
          environment: "production",
          suggestedAction: "Retry payment verification pipeline.",
        },
        ipAddress: null,
        userAgent: null,
        createdAt: new Date("2026-03-19T10:00:00.000Z"),
      },
      {
        id: "cmerr2",
        userId: null,
        action: "SYSTEM_ERROR_EVENT",
        entityType: "SYSTEM_ERROR_LOG",
        entityId: "fp-warning-job",
        details: {
          timestamp: "2026-03-19T09:30:00.000Z",
          severity: "warn",
          service: "jobs",
          message: "Queue backlog high",
          fingerprint: "fp-warning-job",
          environment: "production",
        },
        ipAddress: null,
        userAgent: null,
        createdAt: new Date("2026-03-19T09:30:00.000Z"),
      },
    ]);

    systemSettingFindMany.mockResolvedValue([
      {
        key: "error_log_state:fp-gateway-timeout",
        value: JSON.stringify({
          status: "acknowledged",
          ownerUserId: "cmowner1",
          ownerName: "Ops Owner",
          note: "Watching retries",
          updatedAt: "2026-03-19T10:10:00.000Z",
          updatedBy: "cmadmin1",
        }),
      },
    ]);

    const result = await service.listErrorLogs({
      severity: "error",
      status: "acknowledged",
      service: "payments",
      q: "timeout",
      limit: 1,
    });

    expect(result.totalItems).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      fingerprint: "fp-gateway-timeout",
      status: "acknowledged",
      ownerUserId: "cmowner1",
      service: "payments",
    });

    const nextPage = await service.listErrorLogs({
      severity: "warn",
      limit: 1,
      cursor: "fp-warning-job",
    });

    expect(nextPage.items).toHaveLength(0);
    expect(nextPage.hasMore).toBe(false);
  });

  it("applies assign owner and resolve actions for error logs", async () => {
    systemSettingFindUnique.mockResolvedValue({
      key: "error_log_state:fp-gateway-timeout",
      value: JSON.stringify({
        status: "open",
        ownerUserId: null,
        ownerName: null,
        note: null,
        updatedAt: "2026-03-19T09:00:00.000Z",
        updatedBy: "cmadmin0",
      }),
    });

    userFindUnique.mockResolvedValue({
      firstName: "Musa",
      lastName: "Maintainer",
      email: "musa@example.com",
    });

    systemSettingUpsert.mockResolvedValue(undefined);
    auditLogCreate.mockResolvedValue(undefined);

    const assigned = await service.applyErrorLogAction(
      "fp-gateway-timeout",
      {
        action: "assign_owner",
        ownerUserId: "cmaowner0001",
      },
      "cmadmin2"
    );

    expect(assigned).toMatchObject({
      fingerprint: "fp-gateway-timeout",
      ownerUserId: "cmaowner0001",
      ownerName: "Musa Maintainer",
      actionApplied: "assign_owner",
    });

    const resolved = await service.applyErrorLogAction(
      "fp-gateway-timeout",
      {
        action: "mark_resolved",
      },
      "cmadmin2"
    );

    expect(resolved.status).toBe("resolved");
    expect(systemSettingUpsert).toHaveBeenCalled();
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_ERROR_LOG_ACTION_APPLIED",
          entityType: "SYSTEM_ERROR_LOG",
        }),
      })
    );
  });
});
