/// <reference types="jest" />
import { BadRequestException } from "@nestjs/common";
import { UsersService } from "./users.service.js";

describe("UsersService admin user management", () => {
  const prisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
    },
    book: {
      findMany: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cloudinary = {
    generateSignature: jest.fn(),
    delete: jest.fn(),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(prisma as never, cloudinary as never);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        user: {
          update: prisma.user.update,
        },
        auditLog: {
          create: prisma.auditLog.create,
        },
      })
    );
  });

  it("lists admin users with cursor pagination, search, and filters", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: "cmuser_1",
        firstName: "Ada",
        lastName: "Okafor",
        email: "ada@example.com",
        role: "EDITOR",
        isVerified: true,
        isActive: true,
        isDeleted: false,
        createdAt: new Date("2026-03-10T10:00:00.000Z"),
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.findAdminUsers({
      cursor: "cmuser_cursor_1",
      limit: 20,
      q: "Ada Okafor",
      role: "EDITOR",
      isVerified: true,
      sortBy: "createdAt",
      sortDirection: "desc",
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        cursor: { id: "cmuser_cursor_1" },
        skip: 1,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { role: "EDITOR" },
            { isVerified: true },
            expect.objectContaining({
              OR: expect.any(Array),
            }),
          ]),
        }),
        select: expect.any(Object),
      })
    );
    expect(result).toEqual({
      items: [
        {
          id: "cmuser_1",
          fullName: "Ada Okafor",
          email: "ada@example.com",
          role: "EDITOR",
          isVerified: true,
          isActive: true,
          isDeleted: false,
          createdAt: "2026-03-10T10:00:00.000Z",
          detailUrl: "/admin/users/cmuser_1",
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
  });

  it("returns the full admin user detail payload with orders, books, and payments", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser_1",
      firstName: "Ada",
      lastName: "Okafor",
      email: "ada@example.com",
      phoneNumber: "+2348012345678",
      role: "MANAGER",
      isVerified: false,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      preferredLanguage: "fr",
      bio: " Author bio ",
      profileImageUrl:
        "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser_1/profile-photo.png",
      whatsAppNumber: "+2348012345678",
      websiteUrl: "https://author.example.com",
      purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
      socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
      isProfileComplete: true,
      emailNotificationsEnabled: true,
      whatsAppNotificationsEnabled: false,
      inAppNotificationsEnabled: true,
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt: new Date("2026-03-12T12:00:00.000Z"),
    });
    prisma.order.findMany.mockResolvedValue([
      {
        id: "cmorder_1",
        orderNumber: "BP-2026-0001",
        orderType: "STANDARD",
        status: "PAID",
        totalAmount: { toString: () => "125000" },
        currency: "NGN",
        createdAt: new Date("2026-03-10T11:00:00.000Z"),
        package: {
          id: "cmpkg_1",
          name: "Legacy",
          slug: "legacy",
        },
        book: {
          status: "PAYMENT_RECEIVED",
        },
      },
    ]);
    prisma.book.findMany.mockResolvedValue([
      {
        id: "cmbook_1",
        title: "My Story",
        status: "PAYMENT_RECEIVED",
        productionStatus: "PAYMENT_RECEIVED",
        orderId: "cmorder_1",
        createdAt: new Date("2026-03-10T11:05:00.000Z"),
        updatedAt: new Date("2026-03-11T08:00:00.000Z"),
        order: {
          orderNumber: "BP-2026-0001",
        },
      },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: "cmpayment_1",
        orderId: "cmorder_1",
        provider: "PAYSTACK",
        type: "PAYMENT",
        status: "SUCCESS",
        amount: { toString: () => "125000" },
        currency: "NGN",
        providerRef: "pay_ref_1",
        receiptUrl: null,
        approvedAt: null,
        processedAt: new Date("2026-03-10T11:01:00.000Z"),
        createdAt: new Date("2026-03-10T11:00:30.000Z"),
        updatedAt: new Date("2026-03-10T11:01:00.000Z"),
        order: {
          orderNumber: "BP-2026-0001",
        },
      },
    ]);

    await expect(service.findAdminUserById("cmuser_1")).resolves.toEqual({
      profile: {
        id: "cmuser_1",
        firstName: "Ada",
        lastName: "Okafor",
        fullName: "Ada Okafor",
        email: "ada@example.com",
        phoneNumber: "+2348012345678",
        role: "MANAGER",
        isVerified: false,
        isActive: true,
        isDeleted: false,
        deletedAt: null,
        preferredLanguage: "fr",
        bio: "Author bio",
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser_1/profile-photo.png",
        whatsAppNumber: "+2348012345678",
        websiteUrl: "https://author.example.com",
        purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
        socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
        isProfileComplete: true,
        notificationPreferences: {
          email: true,
          whatsApp: false,
          inApp: true,
        },
        createdAt: "2026-03-10T10:00:00.000Z",
        updatedAt: "2026-03-12T12:00:00.000Z",
      },
      orders: [
        {
          id: "cmorder_1",
          orderNumber: "BP-2026-0001",
          orderType: "STANDARD",
          orderStatus: "PAID",
          bookStatus: "PAYMENT_RECEIVED",
          package: {
            id: "cmpkg_1",
            name: "Legacy",
            slug: "legacy",
          },
          totalAmount: 125000,
          currency: "NGN",
          createdAt: "2026-03-10T11:00:00.000Z",
          detailUrl: "/admin/orders/cmorder_1",
        },
      ],
      books: [
        {
          id: "cmbook_1",
          title: "My Story",
          status: "PAYMENT_RECEIVED",
          productionStatus: "PAYMENT_RECEIVED",
          orderId: "cmorder_1",
          orderNumber: "BP-2026-0001",
          createdAt: "2026-03-10T11:05:00.000Z",
          updatedAt: "2026-03-11T08:00:00.000Z",
          detailUrl: "/admin/books/cmbook_1",
          orderDetailUrl: "/admin/orders/cmorder_1",
        },
      ],
      payments: [
        {
          id: "cmpayment_1",
          orderId: "cmorder_1",
          orderNumber: "BP-2026-0001",
          provider: "PAYSTACK",
          type: "PAYMENT",
          status: "SUCCESS",
          amount: 125000,
          currency: "NGN",
          providerRef: "pay_ref_1",
          receiptUrl: null,
          approvedAt: null,
          processedAt: "2026-03-10T11:01:00.000Z",
          createdAt: "2026-03-10T11:00:30.000Z",
          updatedAt: "2026-03-10T11:01:00.000Z",
          orderDetailUrl: "/admin/orders/cmorder_1",
        },
      ],
    });
  });

  it("updates role and verification state and records an audit entry", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser_1",
      email: "ada@example.com",
      role: "USER",
      isVerified: false,
      isActive: true,
      isDeleted: false,
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    });
    prisma.user.update.mockResolvedValue({
      id: "cmuser_1",
      role: "EDITOR",
      isVerified: true,
      isActive: true,
      isDeleted: false,
      updatedAt: new Date("2026-03-14T12:00:00.000Z"),
    });
    prisma.auditLog.create.mockResolvedValue({
      id: "cmaudit_1",
      action: "ADMIN_USER_ROLE_UPDATED",
      entityType: "USER",
      entityId: "cmuser_1",
      details: {
        changedFields: ["role", "isVerified"],
        previousState: {
          role: "USER",
          isVerified: false,
          isActive: true,
          isDeleted: false,
        },
        currentState: {
          role: "EDITOR",
          isVerified: true,
          isActive: true,
          isDeleted: false,
        },
      },
      createdAt: new Date("2026-03-14T12:00:01.000Z"),
    });

    await expect(
      service.updateAdminUser(
        "cmuser_1",
        {
          role: "EDITOR",
          isVerified: true,
        },
        "cmadmin_1"
      )
    ).resolves.toEqual({
      userId: "cmuser_1",
      previousState: {
        role: "USER",
        isVerified: false,
        isActive: true,
        isDeleted: false,
      },
      currentState: {
        role: "EDITOR",
        isVerified: true,
        isActive: true,
        isDeleted: false,
      },
      updatedAt: "2026-03-14T12:00:00.000Z",
      audit: {
        auditId: "cmaudit_1",
        action: "ADMIN_USER_ROLE_UPDATED",
        entityType: "USER",
        entityId: "cmuser_1",
        recordedAt: "2026-03-14T12:00:01.000Z",
        recordedBy: "cmadmin_1",
        note: null,
        reason: null,
      },
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "cmuser_1" },
      data: {
        role: "EDITOR",
        isVerified: true,
      },
      select: expect.any(Object),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_USER_ROLE_UPDATED",
          entityType: "USER",
          entityId: "cmuser_1",
          details: expect.objectContaining({
            changedFields: ["role", "isVerified"],
            previousState: {
              role: "USER",
              isVerified: false,
              isActive: true,
              isDeleted: false,
            },
            currentState: {
              role: "EDITOR",
              isVerified: true,
              isActive: true,
              isDeleted: false,
            },
          }),
        }),
      })
    );
  });

  it("deactivates a user, clears refresh tokens, and records the audit trail", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser_2",
      email: "admin@example.com",
      role: "ADMIN",
      isVerified: true,
      isActive: true,
      isDeleted: false,
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    });
    prisma.user.update.mockResolvedValue({
      id: "cmuser_2",
      role: "ADMIN",
      isVerified: true,
      isActive: false,
      isDeleted: false,
      updatedAt: new Date("2026-03-14T13:00:00.000Z"),
    });
    prisma.auditLog.create.mockResolvedValue({
      id: "cmaudit_2",
      action: "ADMIN_USER_DEACTIVATED",
      entityType: "USER",
      entityId: "cmuser_2",
      details: {
        changedFields: ["isActive"],
      },
      createdAt: new Date("2026-03-14T13:00:01.000Z"),
    });

    const result = await service.updateAdminUser(
      "cmuser_2",
      {
        isActive: false,
      },
      "cmadmin_1"
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "cmuser_2" },
      data: {
        isActive: false,
        refreshToken: null,
        refreshTokenExp: null,
      },
      select: expect.any(Object),
    });
    expect(result.currentState.isActive).toBe(false);
    expect(result.audit.action).toBe("ADMIN_USER_DEACTIVATED");
  });

  it("rejects admin updates when the payload would not change the user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser_3",
      email: "user3@example.com",
      role: "USER",
      isVerified: false,
      isActive: true,
      isDeleted: false,
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    });

    await expect(
      service.updateAdminUser(
        "cmuser_3",
        {
          role: "USER",
        },
        "cmadmin_1"
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("permanently deletes a user by anonymizing PII and writes an audit trail", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser_4",
      email: "author@example.com",
      role: "USER",
      isVerified: true,
      isActive: true,
      isDeleted: false,
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    });
    prisma.user.update.mockResolvedValue({ id: "cmuser_4" });
    prisma.auditLog.create.mockResolvedValue({
      id: "cmaudit_4",
      action: "ADMIN_USER_PERMANENTLY_DELETED",
      entityType: "USER",
      entityId: "cmuser_4",
      details: {
        changedFields: ["isDeleted", "isActive", "email", "firstName", "lastName"],
      },
      createdAt: new Date("2026-03-14T14:00:01.000Z"),
    });

    const result = await service.deleteAdminUser("cmuser_4", "cmadmin_1");

    expect(result.userId).toBe("cmuser_4");
    expect(result.deleted).toBe(true);
    expect(result.isDeleted).toBe(true);
    expect(result.anonymizedEmail).toBe("deleted_cmuser_4@bookprinta.local");
    expect(result.deletedAt).toBeDefined();
    expect(result.audit.action).toBe("ADMIN_USER_PERMANENTLY_DELETED");
    expect(result.audit.recordedBy).toBe("cmadmin_1");

    // Verify PII anonymization in the transaction
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmuser_4" },
        data: expect.objectContaining({
          email: "deleted_cmuser_4@bookprinta.local",
          firstName: "Deleted",
          lastName: "User",
          password: null,
          phoneNumber: null,
          phoneNumberNormalized: null,
          bio: null,
          profileImageUrl: null,
          whatsAppNumber: null,
          websiteUrl: null,
          purchaseLinks: [],
          socialLinks: [],
          isActive: false,
          isDeleted: true,
          refreshToken: null,
          refreshTokenExp: null,
          verificationToken: null,
          verificationCode: null,
          resetToken: null,
        }),
      })
    );

    // Verify audit records the previous email
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_USER_PERMANENTLY_DELETED",
          details: expect.objectContaining({
            previousState: expect.objectContaining({
              email: "author@example.com",
              isDeleted: false,
            }),
            currentState: expect.objectContaining({
              isDeleted: true,
              email: "deleted_cmuser_4@bookprinta.local",
            }),
          }),
        }),
      })
    );
  });

  it("rejects delete when user is already permanently deleted", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser_5",
      email: "deleted_cmuser_5@bookprinta.local",
      role: "USER",
      isVerified: true,
      isActive: false,
      isDeleted: true,
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    });

    await expect(service.deleteAdminUser("cmuser_5", "cmadmin_1")).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("reactivates an inactive user via the dedicated admin action", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: "cmuser_6",
        email: "user6@example.com",
        role: "USER",
        isVerified: true,
        isActive: false,
        isDeleted: false,
        updatedAt: new Date("2026-03-10T10:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "cmuser_6",
        email: "user6@example.com",
        role: "USER",
        isVerified: true,
        isActive: false,
        isDeleted: false,
        updatedAt: new Date("2026-03-10T10:00:00.000Z"),
      });
    prisma.user.update.mockResolvedValue({
      id: "cmuser_6",
      role: "USER",
      isVerified: true,
      isActive: true,
      isDeleted: false,
      updatedAt: new Date("2026-03-14T16:00:00.000Z"),
    });
    prisma.auditLog.create.mockResolvedValue({
      id: "cmaudit_6",
      action: "ADMIN_USER_REACTIVATED",
      entityType: "USER",
      entityId: "cmuser_6",
      details: {
        changedFields: ["isActive"],
      },
      createdAt: new Date("2026-03-14T16:00:01.000Z"),
    });

    await expect(service.reactivateAdminUser("cmuser_6", "cmadmin_1")).resolves.toEqual({
      userId: "cmuser_6",
      previousState: {
        role: "USER",
        isVerified: true,
        isActive: false,
        isDeleted: false,
      },
      currentState: {
        role: "USER",
        isVerified: true,
        isActive: true,
        isDeleted: false,
      },
      updatedAt: "2026-03-14T16:00:00.000Z",
      audit: {
        auditId: "cmaudit_6",
        action: "ADMIN_USER_REACTIVATED",
        entityType: "USER",
        entityId: "cmuser_6",
        recordedAt: "2026-03-14T16:00:01.000Z",
        recordedBy: "cmadmin_1",
        note: null,
        reason: null,
      },
    });
  });

  it("rejects reactivation when user is already active", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser_7",
      email: "user7@example.com",
      role: "USER",
      isVerified: true,
      isActive: true,
      isDeleted: false,
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    });

    await expect(service.reactivateAdminUser("cmuser_7", "cmadmin_1")).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
