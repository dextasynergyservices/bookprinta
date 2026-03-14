/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { AdminUsersController } from "./admin-users.controller.js";
import { UsersService } from "./users.service.js";

const usersServiceMock = {
  findAdminUsers: jest.fn(),
  findAdminUserById: jest.fn(),
  updateAdminUser: jest.fn(),
};

describe("AdminUsersController", () => {
  let controller: AdminUsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
    jest.resetAllMocks();
  });

  it("delegates GET /admin/users to the service with the validated query", async () => {
    const query = {
      limit: 20,
      q: "ada",
      role: "EDITOR",
      isVerified: true,
      sortBy: "createdAt",
      sortDirection: "desc",
    } as const;
    usersServiceMock.findAdminUsers.mockResolvedValue({
      items: [
        {
          id: "cmadminuser00000000000000001",
          fullName: "Ada Okafor",
          email: "ada@example.com",
          role: "EDITOR",
          isVerified: true,
          isActive: true,
          createdAt: "2026-03-12T14:45:00.000Z",
          detailUrl: "/admin/users/cmadminuser00000000000000001",
        },
      ],
      nextCursor: null,
      hasMore: false,
      totalItems: 1,
      limit: 20,
      sortBy: "createdAt",
      sortDirection: "desc",
      sortableFields: ["fullName", "email", "role", "isVerified", "createdAt"],
    });

    await expect(controller.findAdminUsers(query)).resolves.toMatchObject({
      totalItems: 1,
      items: [
        expect.objectContaining({
          fullName: "Ada Okafor",
          role: "EDITOR",
        }),
      ],
    });

    expect(usersServiceMock.findAdminUsers).toHaveBeenCalledWith(query);
  });

  it("delegates GET /admin/users/:id to the service with the route user id", async () => {
    const userId = "cmadminuser00000000000000001";
    usersServiceMock.findAdminUserById.mockResolvedValue({
      profile: {
        id: userId,
        firstName: "Ada",
        lastName: "Okafor",
        fullName: "Ada Okafor",
        email: "ada@example.com",
        phoneNumber: "+2348000000000",
        role: "EDITOR",
        isVerified: true,
        isActive: true,
        preferredLanguage: "en",
        bio: null,
        profileImageUrl: null,
        whatsAppNumber: null,
        websiteUrl: null,
        purchaseLinks: [],
        socialLinks: [],
        isProfileComplete: false,
        notificationPreferences: {
          email: true,
          whatsApp: false,
          inApp: true,
        },
        createdAt: "2026-03-10T09:30:00.000Z",
        updatedAt: "2026-03-12T14:45:00.000Z",
      },
      orders: [],
      books: [],
      payments: [],
    });

    await expect(controller.findAdminUserById(userId)).resolves.toMatchObject({
      profile: expect.objectContaining({
        id: userId,
        fullName: "Ada Okafor",
      }),
    });

    expect(usersServiceMock.findAdminUserById).toHaveBeenCalledWith(userId);
  });

  it("delegates PATCH /admin/users/:id to the service with the user id, body, and acting admin", async () => {
    const userId = "cmadminuser00000000000000001";
    const adminId = "cmadmin000000000000000001";
    const body = {
      role: "ADMIN",
      isVerified: false,
    } as const;
    usersServiceMock.updateAdminUser.mockResolvedValue({
      userId,
      previousState: {
        role: "EDITOR",
        isVerified: true,
        isActive: true,
      },
      currentState: {
        role: "ADMIN",
        isVerified: false,
        isActive: true,
      },
      updatedAt: "2026-03-14T10:45:00.000Z",
      audit: {
        auditId: "cmaudit000000000000000101",
        action: "ADMIN_USER_ROLE_UPDATED",
        entityType: "USER",
        entityId: userId,
        recordedAt: "2026-03-14T10:45:00.000Z",
        recordedBy: adminId,
        note: null,
        reason: null,
      },
    });

    await expect(controller.updateAdminUser(userId, body, adminId)).resolves.toMatchObject({
      userId,
      currentState: expect.objectContaining({
        role: "ADMIN",
        isVerified: false,
      }),
      audit: expect.objectContaining({
        action: "ADMIN_USER_ROLE_UPDATED",
      }),
    });

    expect(usersServiceMock.updateAdminUser).toHaveBeenCalledWith(userId, body, adminId);
  });
});
