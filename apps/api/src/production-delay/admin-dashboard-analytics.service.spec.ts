/// <reference types="jest" />
import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { AdminDashboardAnalyticsService } from "./admin-dashboard-analytics.service.js";

const orderCount = jest.fn();
const orderFindMany = jest.fn();
const orderGroupBy = jest.fn();
const paymentCount = jest.fn();
const paymentAggregate = jest.fn();
const paymentFindMany = jest.fn();
const paymentGroupBy = jest.fn();
const bookCount = jest.fn();

const redisGet = jest.fn();
const redisSet = jest.fn();
const redisClient = {
  get: redisGet,
  set: redisSet,
};

const prismaMock = {
  order: {
    count: orderCount,
    findMany: orderFindMany,
    groupBy: orderGroupBy,
  },
  payment: {
    count: paymentCount,
    aggregate: paymentAggregate,
    findMany: paymentFindMany,
    groupBy: paymentGroupBy,
  },
  book: {
    count: bookCount,
  },
};

const redisServiceMock = {
  getClient: jest.fn(() => redisClient),
  isAvailable: jest.fn(() => true),
};

describe("AdminDashboardAnalyticsService", () => {
  let service: AdminDashboardAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardAnalyticsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: RedisService,
          useValue: redisServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminDashboardAnalyticsService>(AdminDashboardAnalyticsService);

    jest.resetAllMocks();
    redisServiceMock.getClient.mockReturnValue(redisClient);
    redisServiceMock.isAvailable.mockReturnValue(true);
  });

  it("computes stats with previous-period deltas and SLA-at-risk count", async () => {
    redisGet.mockResolvedValue(null);

    orderCount.mockResolvedValueOnce(120).mockResolvedValueOnce(100);
    paymentAggregate
      .mockResolvedValueOnce({ _sum: { amount: "500000.50" } })
      .mockResolvedValueOnce({ _sum: { amount: "400000.00" } });
    bookCount.mockResolvedValueOnce(22).mockResolvedValueOnce(20);
    paymentCount.mockResolvedValueOnce(11).mockResolvedValueOnce(8).mockResolvedValueOnce(4);

    const result = await service.getDashboardStats({ range: "30d" });

    expect(result.totalOrders).toEqual({ value: 120, deltaPercent: 20 });
    expect(result.totalRevenueNgn).toEqual({ value: 500000.5, deltaPercent: 25 });
    expect(result.activeBooksInProduction).toEqual({ value: 22, deltaPercent: 10 });
    expect(result.pendingBankTransfers).toEqual({ value: 11, deltaPercent: 37.5 });
    expect(result.slaAtRiskCount).toBe(4);
    expect(result.range.key).toBe("30d");
    expect(redisSet).toHaveBeenCalled();
  });

  it("returns cached stats payload when present", async () => {
    const cached = {
      totalOrders: { value: 12, deltaPercent: 0 },
      totalRevenueNgn: { value: 9000, deltaPercent: null },
      activeBooksInProduction: { value: 3, deltaPercent: 0 },
      pendingBankTransfers: { value: 1, deltaPercent: -50 },
      slaAtRiskCount: 0,
      range: {
        key: "7d",
        from: "2026-03-12T00:00:00.000Z",
        to: "2026-03-19T00:00:00.000Z",
        previousFrom: "2026-03-05T00:00:00.000Z",
        previousTo: "2026-03-12T00:00:00.000Z",
      },
      lastUpdatedAt: "2026-03-19T10:00:00.000Z",
    };

    redisGet.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getDashboardStats({ range: "7d" });

    expect(result).toEqual(cached);
    expect(orderCount).not.toHaveBeenCalled();
    expect(paymentAggregate).not.toHaveBeenCalled();
  });

  it("builds charts datasets and SLA trend buckets", async () => {
    redisGet.mockResolvedValue(null);

    orderFindMany.mockResolvedValue([
      { createdAt: new Date("2026-03-17T10:00:00.000Z") },
      { createdAt: new Date("2026-03-18T10:00:00.000Z") },
    ]);

    paymentFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-03-17T11:00:00.000Z"),
        approvedAt: new Date("2026-03-17T11:10:00.000Z"),
        amount: "10000",
        provider: "PAYSTACK",
        status: "SUCCESS",
        type: "INITIAL",
      },
      {
        createdAt: new Date("2026-03-18T12:00:00.000Z"),
        approvedAt: new Date("2026-03-18T12:40:00.000Z"),
        amount: "20000",
        provider: "BANK_TRANSFER",
        status: "SUCCESS",
        type: "INITIAL",
      },
      {
        createdAt: new Date("2026-03-18T14:00:00.000Z"),
        approvedAt: null,
        amount: "0",
        provider: "BANK_TRANSFER",
        status: "AWAITING_APPROVAL",
        type: "INITIAL",
      },
    ]);

    orderGroupBy.mockResolvedValue([
      { status: "PAID", _count: { _all: 5 } },
      { status: "IN_PRODUCTION", _count: { _all: 2 } },
    ]);

    paymentGroupBy.mockResolvedValue([
      { provider: "PAYSTACK", _count: { _all: 7 } },
      { provider: "BANK_TRANSFER", _count: { _all: 3 } },
    ]);

    const result = await service.getDashboardCharts({ range: "7d" });

    expect(result.revenueAndOrdersTrend.length).toBeGreaterThan(0);
    expect(result.revenueAndOrdersTrend.some((point) => point.orders > 0)).toBe(true);
    expect(result.revenueAndOrdersTrend.some((point) => point.revenueNgn > 0)).toBe(true);
    expect(result.paymentMethodDistribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "PAYSTACK", value: 7 }),
        expect.objectContaining({ label: "BANK_TRANSFER", value: 3 }),
      ])
    );
    expect(result.orderStatusDistribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "PAID", value: 5 }),
        expect.objectContaining({ label: "IN_PRODUCTION", value: 2 }),
      ])
    );
    expect(result.bankTransferSlaTrend.some((point) => point.over30m > 0)).toBe(true);
    expect(result.range.key).toBe("7d");
  });

  it("requires from and to for custom ranges", async () => {
    await expect(service.getDashboardStats({ range: "custom" })).rejects.toThrow(
      BadRequestException
    );
  });
});
