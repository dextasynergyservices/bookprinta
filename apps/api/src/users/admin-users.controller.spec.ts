/// <reference types="jest" />
import { AdminUsersController } from "./admin-users.controller.js";
import { UsersService } from "./users.service.js";

const usersServiceMock = {
  findAdminUsers: jest.fn(),
  findAdminUserById: jest.fn(),
  updateAdminUser: jest.fn(),
  deleteAdminUser: jest.fn(),
  reactivateAdminUser: jest.fn(),
};

describe("AdminUsersController", () => {
  let controller: AdminUsersController;

  beforeEach(() => {
    controller = new AdminUsersController(usersServiceMock as unknown as UsersService);
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

    const result = await controller.findAdminUsers(query);

    expect(result).toMatchObject({
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

    const result = await controller.findAdminUserById(userId);

    expect(result).toMatchObject({
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

    const result = await controller.updateAdminUser(userId, body, adminId);

    expect(result).toMatchObject({
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

  it("delegates POST /admin/users/:id/reactivate to the service", async () => {
    const userId = "cmadminuser00000000000000001";
    const adminId = "cmadmin000000000000000001";
    usersServiceMock.reactivateAdminUser.mockResolvedValue({
      userId,
      previousState: {
        role: "USER",
        isVerified: true,
        isActive: false,
      },
      currentState: {
        role: "USER",
        isVerified: true,
        isActive: true,
      },
      updatedAt: "2026-03-14T10:45:00.000Z",
      audit: {
        auditId: "cmaudit000000000000000102",
        action: "ADMIN_USER_REACTIVATED",
        entityType: "USER",
        entityId: userId,
        recordedAt: "2026-03-14T10:45:00.000Z",
        recordedBy: adminId,
        note: null,
        reason: null,
      },
    });

    const result = await controller.reactivateAdminUser(userId, adminId);

    expect(result).toMatchObject({
      userId,
      currentState: expect.objectContaining({
        isActive: true,
      }),
      audit: expect.objectContaining({
        action: "ADMIN_USER_REACTIVATED",
      }),
    });

    expect(usersServiceMock.reactivateAdminUser).toHaveBeenCalledWith(userId, adminId);
  });
});
