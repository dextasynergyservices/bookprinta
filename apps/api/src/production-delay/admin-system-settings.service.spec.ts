/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { AdminSystemSettingsService } from "./admin-system-settings.service.js";

const paymentGatewayFindMany = jest.fn();
const paymentGatewayFindUnique = jest.fn();
const paymentGatewayUpdate = jest.fn();
const paymentGatewayUpsert = jest.fn();
const systemSettingFindMany = jest.fn();
const systemSettingFindUnique = jest.fn();
const systemSettingUpsert = jest.fn();
const auditLogCreate = jest.fn();

const mockPrismaService = {
  paymentGateway: {
    findMany: paymentGatewayFindMany,
    findUnique: paymentGatewayFindUnique,
    update: paymentGatewayUpdate,
    upsert: paymentGatewayUpsert,
  },
  systemSetting: {
    findMany: systemSettingFindMany,
    findUnique: systemSettingFindUnique,
    upsert: systemSettingUpsert,
  },
  auditLog: {
    create: auditLogCreate,
  },
};

describe("AdminSystemSettingsService", () => {
  let service: AdminSystemSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSystemSettingsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminSystemSettingsService>(AdminSystemSettingsService);
    jest.clearAllMocks();

    paymentGatewayUpsert.mockResolvedValue(undefined);
  });

  it("returns masked gateway credentials without plaintext leaks", async () => {
    paymentGatewayFindMany.mockResolvedValue([
      {
        id: "cmgateway1",
        provider: "PAYSTACK",
        name: "Paystack",
        isEnabled: true,
        isTestMode: true,
        priority: 1,
        instructions: null,
        bankDetails: null,
        publicKey: "pk_test_1234567890",
        secretKey: "sk_test_1234567890",
        updatedAt: new Date("2026-03-19T10:00:00.000Z"),
      },
    ]);

    const result = await service.getPaymentGateways();

    const publicCredential = result.gateways[0]?.credentials.find(
      (item) => item.field === "publicKey"
    );
    const secretCredential = result.gateways[0]?.credentials.find(
      (item) => item.field === "secretKey"
    );

    expect(publicCredential?.maskedValue).toContain("*");
    expect(secretCredential?.maskedValue).toContain("*");
    expect(publicCredential?.maskedValue).not.toContain("pk_test_1234567890");
    expect(secretCredential?.maskedValue).not.toContain("sk_test_1234567890");
  });

  it("blocks admin role from updating super-admin-only keys", async () => {
    await expect(
      service.updateSetting(
        "maintenance_mode",
        {
          value: true,
          confirmDangerousOperation: true,
          changeReason: "Maintenance window",
        },
        {
          adminId: "cmadmin1",
          adminRole: "ADMIN",
        }
      )
    ).rejects.toThrow("Only SUPER_ADMIN can update this setting");
  });

  it("requires dangerous-operation confirmation for maintenance mode", async () => {
    await expect(
      service.updateSetting(
        "maintenance_mode",
        {
          value: true,
          changeReason: "Maintenance window",
        },
        {
          adminId: "cmsuperadmin1",
          adminRole: "SUPER_ADMIN",
        }
      )
    ).rejects.toThrow("confirmDangerousOperation must be true when enabling maintenance mode");
  });

  it("updates a setting with coercion and writes an audit log", async () => {
    systemSettingFindUnique.mockResolvedValue({
      key: "production_backlog_threshold",
      value: "20",
      description: "Backlog threshold",
      updatedBy: "cmadmin0",
      updatedAt: new Date("2026-03-18T09:00:00.000Z"),
    });

    systemSettingUpsert.mockResolvedValue({
      key: "production_backlog_threshold",
      value: "30",
      description: "Backlog threshold",
      updatedBy: "cmadmin2",
      updatedAt: new Date("2026-03-19T09:00:00.000Z"),
    });

    const result = await service.updateSetting(
      "production_backlog_threshold",
      {
        value: "30",
        changeReason: "Seasonal volume increase",
      },
      {
        adminId: "cmadmin2",
        adminRole: "ADMIN",
        ipAddress: "127.0.0.1",
      }
    );

    expect(result.value).toBe(30);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation and reason when disabling payment gateway", async () => {
    paymentGatewayFindUnique.mockResolvedValue({
      id: "cmgateway2",
      provider: "STRIPE",
      name: "Stripe",
      isEnabled: true,
      isTestMode: true,
      priority: 2,
      instructions: null,
      bankDetails: null,
      publicKey: null,
      secretKey: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-19T00:00:00.000Z"),
    });

    await expect(
      service.updatePaymentGateway(
        "cmgateway2",
        {
          isEnabled: false,
          changeReason: undefined,
        },
        {
          adminId: "cmadmin3",
          adminRole: "ADMIN",
        }
      )
    ).rejects.toThrow("confirmDangerousOperation must be true when disabling a payment gateway");
  });

  it("rejects when changeReason is missing for gateway disable", async () => {
    paymentGatewayFindUnique.mockResolvedValue({
      id: "cmgateway3",
      provider: "PAYPAL",
      name: "PayPal",
      isEnabled: true,
      isTestMode: false,
      priority: 3,
      instructions: null,
      bankDetails: null,
      publicKey: null,
      secretKey: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-19T00:00:00.000Z"),
    });

    await expect(
      service.updatePaymentGateway(
        "cmgateway3",
        {
          isEnabled: false,
          confirmDangerousOperation: true,
          changeReason: undefined,
        },
        {
          adminId: "cmadmin3",
          adminRole: "ADMIN",
        }
      )
    ).rejects.toThrow("changeReason is required when disabling a payment gateway");
  });

  it("allows gateway test-mode toggle without dangerous-op confirmation", async () => {
    const mockGateway = {
      id: "cmgateway4",
      provider: "PAYSTACK",
      name: "Paystack",
      isEnabled: true,
      isTestMode: true,
      priority: 1,
      instructions: null,
      bankDetails: null,
      publicKey: "pk_test_abc",
      secretKey: "sk_test_abc",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-19T00:00:00.000Z"),
    };

    paymentGatewayFindUnique.mockResolvedValue(mockGateway);
    paymentGatewayUpdate.mockResolvedValue({ ...mockGateway, isTestMode: false });

    const result = await service.updatePaymentGateway(
      "cmgateway4",
      { isTestMode: false, changeReason: undefined },
      { adminId: "cmadmin4", adminRole: "ADMIN" }
    );

    expect(result.isTestMode).toBe(false);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);

    const auditCall = auditLogCreate.mock.calls[0][0];
    expect(auditCall.data.details.nextState.isTestMode).toBe(false);
    expect(auditCall.data.details.previousState.isTestMode).toBe(true);
  });

  it("credential update records field names in audit log but not values", async () => {
    const mockGateway = {
      id: "cmgateway5",
      provider: "STRIPE",
      name: "Stripe",
      isEnabled: true,
      isTestMode: true,
      priority: 2,
      instructions: null,
      bankDetails: null,
      publicKey: null,
      secretKey: null,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-19T00:00:00.000Z"),
    };

    paymentGatewayFindUnique.mockResolvedValue(mockGateway);
    paymentGatewayUpdate.mockResolvedValue({
      ...mockGateway,
      publicKey: "pk_live_xyz",
      secretKey: "sk_live_xyz",
    });

    await service.updatePaymentGateway(
      "cmgateway5",
      {
        credentials: [
          { field: "publicKey", value: "pk_live_xyz" },
          { field: "secretKey", value: "sk_live_xyz" },
        ],
        changeReason: undefined,
      },
      { adminId: "cmadmin5", adminRole: "SUPER_ADMIN" }
    );

    const auditCall = auditLogCreate.mock.calls[0][0];
    expect(auditCall.data.details.changedCredentialFields).toEqual(
      expect.arrayContaining(["publicKey", "secretKey"])
    );
    // Confirm no actual credential values appear in the audit details
    const auditDetails = JSON.stringify(auditCall.data.details);
    expect(auditDetails).not.toContain("pk_live_xyz");
    expect(auditDetails).not.toContain("sk_live_xyz");
  });

  it("rejects unknown setting key via Zod schema", async () => {
    await expect(
      service.updateSetting(
        "completely_invalid_key",
        { value: "test", changeReason: undefined },
        { adminId: "cmadmin1", adminRole: "ADMIN" }
      )
    ).rejects.toThrow();
  });

  it("returns default value for setting not yet in DB", async () => {
    systemSettingFindUnique.mockResolvedValue(null);
    systemSettingUpsert.mockResolvedValue({
      key: "production_backlog_threshold",
      value: "25",
      description: "Backlog threshold",
      updatedBy: "cmadmin2",
      updatedAt: new Date("2026-03-19T09:00:00.000Z"),
    });

    const result = await service.updateSetting(
      "production_backlog_threshold",
      {
        value: "25",
        changeReason: "Adjusting threshold",
      },
      { adminId: "cmadmin2", adminRole: "ADMIN" }
    );

    // previousValue should be the default (20), not null
    const auditCall = auditLogCreate.mock.calls[0][0];
    expect(auditCall.data.details.previousValue).toBe(20);
    expect(result.value).toBe(25);
  });

  it("blocks ADMIN from updating reprint_minimum_copies (requiresSuperAdmin)", async () => {
    await expect(
      service.updateSetting(
        "reprint_minimum_copies",
        { value: 10, changeReason: undefined },
        { adminId: "cmadmin1", adminRole: "ADMIN" }
      )
    ).rejects.toThrow("Only SUPER_ADMIN can update this setting");
  });

  it("allows SUPER_ADMIN to update reprint_minimum_copies", async () => {
    systemSettingFindUnique.mockResolvedValue({
      key: "reprint_minimum_copies",
      value: "25",
      description: "Minimum copies",
      updatedBy: "cmsuper1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    systemSettingUpsert.mockResolvedValue({
      key: "reprint_minimum_copies",
      value: "25",
      description: "Minimum copies",
      updatedBy: "cmsuper1",
      updatedAt: new Date("2026-03-19T09:00:00.000Z"),
    });

    const result = await service.updateSetting(
      "reprint_minimum_copies",
      { value: 25, changeReason: undefined },
      { adminId: "cmsuper1", adminRole: "SUPER_ADMIN" }
    );

    expect(result.value).toBe(25);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
  });

  it("requires changeReason for production_delay_active", async () => {
    systemSettingFindUnique.mockResolvedValue(null);

    await expect(
      service.updateSetting(
        "production_delay_active",
        { value: true, changeReason: undefined },
        { adminId: "cmadmin1", adminRole: "ADMIN" }
      )
    ).rejects.toThrow("changeReason is required for critical operational changes");
  });

  it("returns validation error for invalid content_contact_blocks payload", async () => {
    await expect(
      service.updateSetting(
        "content_contact_blocks",
        {
          value: {
            heading: "Contact BookPrinta",
            supportEmail: "support@bookprinta.com",
            supportPhone: "+2348012345678",
            whatsappNumber: "",
            officeAddress: "Lagos, Nigeria",
          },
          changeReason: undefined,
        },
        {
          adminId: "cmadmin1",
          adminRole: "ADMIN",
        }
      )
    ).rejects.toThrow("Phone number must be 7-20 digits and can start with +");
  });

  it("getSettings returns all keys with correct isSensitive metadata", async () => {
    systemSettingFindMany.mockResolvedValue([]);

    const result = await service.getSettings();

    expect(result.items.length).toBeGreaterThan(0);
    // Every item must expose the sensitivity flag
    for (const item of result.items) {
      expect(typeof item.isSensitive).toBe("boolean");
      expect(typeof item.requiresSuperAdmin).toBe("boolean");
    }

    // maintenance_mode must be requiresSuperAdmin
    const maintenanceItem = result.items.find((item) => item.key === "maintenance_mode");
    expect(maintenanceItem?.requiresSuperAdmin).toBe(true);

    // reprint_minimum_copies must be requiresSuperAdmin
    const reprintItem = result.items.find((item) => item.key === "reprint_minimum_copies");
    expect(reprintItem?.requiresSuperAdmin).toBe(true);
  });

  it("exposes the live reprint pricing keys used by the checkout and reprint flows", async () => {
    systemSettingFindMany.mockResolvedValue([
      {
        key: "reprint_cost_per_page",
        value: "18",
        description: "Reprint per-page cost",
        updatedBy: "cmadmin1",
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
      },
      {
        key: "reprint_cover_cost",
        value: "450",
        description: "Reprint cover cost",
        updatedBy: "cmadmin1",
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
      },
    ]);

    const result = await service.getSettings();

    expect(result.items.find((item) => item.key === "reprint_cost_per_page")?.value).toBe(18);
    expect(result.items.find((item) => item.key === "reprint_cover_cost")?.value).toBe(450);
    expect(result.items.map((item) => item.key)).not.toContain("reprint_cost_per_page_a4");
  });

  it("includes business social links in the public marketing settings response", async () => {
    systemSettingFindMany.mockResolvedValue([
      {
        key: "business_social_links",
        value: JSON.stringify([
          { label: "Facebook", url: "https://facebook.com/bookprinta-ng" },
          { label: "YouTube", url: "https://youtube.com/@bookprinta" },
        ]),
      },
      {
        key: "business_support_email",
        value: "support@bookprinta.com",
      },
      {
        key: "business_support_phone",
        value: "+2348000000000",
      },
      {
        key: "business_office_address",
        value: "Lagos, Nigeria",
      },
      {
        key: "content_contact_blocks",
        value: JSON.stringify({
          heading: "Contact BookPrinta",
          supportEmail: "support@bookprinta.com",
          supportPhone: "+2348000000000",
          officeAddress: "Lagos, Nigeria",
        }),
      },
      {
        key: "content_homepage_hero_copy",
        value: JSON.stringify({
          title: "Your Book. Beautifully Printed.",
          subtitle: "Publish fearlessly.",
          primaryCtaLabel: "Start Publishing",
          secondaryCtaLabel: "Get Custom Quote",
        }),
      },
      {
        key: "business_website_url",
        value: "https://bookprinta.com",
      },
    ]);

    const result = await service.getPublicMarketingSettings();

    expect(result.businessProfile.socialLinks).toEqual([
      { label: "Facebook", url: "https://facebook.com/bookprinta-ng" },
      { label: "YouTube", url: "https://youtube.com/@bookprinta" },
    ]);
  });

  it("returns 404 when updating a non-existent gateway", async () => {
    paymentGatewayFindUnique.mockResolvedValue(null);

    await expect(
      service.updatePaymentGateway(
        "non-existent-id",
        { isTestMode: true, changeReason: undefined },
        { adminId: "cmadmin1", adminRole: "ADMIN" }
      )
    ).rejects.toThrow("Payment gateway not found");
  });

  it("audit log for setting update records category and valueType", async () => {
    systemSettingFindUnique.mockResolvedValue({
      key: "comms_sender_name",
      value: "BookPrinta",
      description: "Sender name",
      updatedBy: "cmadmin1",
      updatedAt: new Date("2026-03-18T09:00:00.000Z"),
    });
    systemSettingUpsert.mockResolvedValue({
      key: "comms_sender_name",
      value: "BookPrinta Pro",
      description: "Sender name",
      updatedBy: "cmadmin2",
      updatedAt: new Date("2026-03-19T09:00:00.000Z"),
    });

    await service.updateSetting(
      "comms_sender_name",
      { value: "BookPrinta Pro", changeReason: undefined },
      { adminId: "cmadmin2", adminRole: "ADMIN", ipAddress: "10.0.0.1", userAgent: "test-agent" }
    );

    const auditCall = auditLogCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe("ADMIN_SYSTEM_SETTING_UPDATED");
    expect(auditCall.data.entityType).toBe("SYSTEM_SETTING");
    expect(auditCall.data.entityId).toBe("comms_sender_name");
    expect(auditCall.data.ipAddress).toBe("10.0.0.1");
    expect(auditCall.data.userAgent).toBe("test-agent");
    expect(auditCall.data.details.category).toBe("notification_comms");
    expect(auditCall.data.details.valueType).toBe("string");
    expect(auditCall.data.details.previousValue).toBe("BookPrinta");
    expect(auditCall.data.details.nextValue).toBe("BookPrinta Pro");
  });
});
