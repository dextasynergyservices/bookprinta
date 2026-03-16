/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

const dashboardServiceMock = {
  getUserDashboardOverview: jest.fn(),
};

describe("DashboardController", () => {
  let controller: DashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: dashboardServiceMock,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    jest.resetAllMocks();
  });

  it("delegates GET /dashboard/overview to the service for the current user", async () => {
    dashboardServiceMock.getUserDashboardOverview.mockResolvedValue({
      activeBook: null,
      recentOrders: [],
      notifications: {
        unreadCount: 2,
        hasProductionDelayBanner: true,
      },
      profile: {
        isProfileComplete: false,
        preferredLanguage: "en",
      },
      pendingActions: {
        total: 1,
        items: [
          {
            type: "COMPLETE_PROFILE",
            priority: "medium",
            href: "/dashboard/profile",
            bookId: null,
            orderId: null,
            bookTitle: null,
            bookStatus: null,
            orderStatus: null,
          },
        ],
      },
    });

    await expect(controller.getOverview("cmuser111111111111111111111111")).resolves.toEqual({
      activeBook: null,
      recentOrders: [],
      notifications: {
        unreadCount: 2,
        hasProductionDelayBanner: true,
      },
      profile: {
        isProfileComplete: false,
        preferredLanguage: "en",
      },
      pendingActions: {
        total: 1,
        items: [
          {
            type: "COMPLETE_PROFILE",
            priority: "medium",
            href: "/dashboard/profile",
            bookId: null,
            orderId: null,
            bookTitle: null,
            bookStatus: null,
            orderStatus: null,
          },
        ],
      },
    });

    expect(dashboardServiceMock.getUserDashboardOverview).toHaveBeenCalledWith(
      "cmuser111111111111111111111111"
    );
  });
});
