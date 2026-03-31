import type {
  AdminPublicMarketingSettingsResponse,
  AdminSystemGatewayCredentialField,
  AdminSystemPaymentGateway,
  AdminSystemPaymentGatewayListResponse,
  AdminSystemSettingKey,
  AdminSystemSettingsCategory,
  AdminSystemSettingsListResponse,
  AdminSystemSettingValueType,
  AdminSystemUpdatePaymentGatewayBodyInput,
  AdminSystemUpdateSettingBodyInput,
} from "@bookprinta/shared";
import {
  AdminSystemSettingKeySchema,
  AdminSystemSettingMutationSchema,
  AdminSystemUpdatePaymentGatewayBodySchema,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import type { PaymentProvider } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";

type AdminActorContext = {
  adminId: string;
  adminRole: string;
  ipAddress?: string;
  userAgent?: string;
};

type SettingDefinition = {
  category: AdminSystemSettingsCategory;
  valueType: AdminSystemSettingValueType;
  description: string;
  defaultValue: unknown;
  isSensitive?: boolean;
  isWriteOnly?: boolean;
  requiresSuperAdmin?: boolean;
};

const SUPER_ADMIN_ROLE = "SUPER_ADMIN";
const CRITICAL_OPERATION_KEYS = new Set<AdminSystemSettingKey>([
  "maintenance_mode",
  "production_delay_active",
]);

const GATEWAY_DISABLE_CONFIRMATION_ERROR =
  "confirmDangerousOperation must be true when disabling a payment gateway";
const GATEWAY_DISABLE_REASON_ERROR = "changeReason is required when disabling a payment gateway";

const SETTING_DEFINITIONS: Record<AdminSystemSettingKey, SettingDefinition> = {
  business_website_url: {
    category: "business_profile",
    valueType: "url",
    description: "Public website URL used across contact and footer surfaces",
    defaultValue: "https://bookprinta.com",
  },
  business_support_email: {
    category: "business_profile",
    valueType: "email",
    description: "Support inbox for contact and transactional support messages",
    defaultValue: "support@bookprinta.com",
  },
  business_support_phone: {
    category: "business_profile",
    valueType: "phone",
    description: "Primary support phone number",
    defaultValue: "+2348000000000",
  },
  business_whatsapp_number: {
    category: "business_profile",
    valueType: "phone",
    description: "Public WhatsApp support line",
    defaultValue: "+2348000000000",
  },
  business_office_address: {
    category: "business_profile",
    valueType: "string",
    description: "Business office address",
    defaultValue: "Lagos, Nigeria",
  },
  business_social_links: {
    category: "business_profile",
    valueType: "list",
    description: "Public social profiles",
    defaultValue: [],
  },
  quote_cost_per_page: {
    category: "quote_pricing",
    valueType: "decimal",
    description: "Default quote price per page in NGN",
    defaultValue: 10,
  },
  quote_cover_cost: {
    category: "quote_pricing",
    valueType: "decimal",
    description: "Default cover price in NGN for quote flow",
    defaultValue: 500,
  },
  reprint_cost_per_page: {
    category: "quote_pricing",
    valueType: "decimal",
    description: "Reprint per-page cost in NGN",
    defaultValue: 15,
  },
  reprint_cover_cost: {
    category: "quote_pricing",
    valueType: "decimal",
    description: "Reprint cover cost in NGN",
    defaultValue: 300,
  },
  reprint_minimum_copies: {
    category: "quote_pricing",
    valueType: "integer",
    description: "Minimum copies required for reprint same flow",
    defaultValue: 25,
    requiresSuperAdmin: true,
  },
  comms_sender_name: {
    category: "notification_comms",
    valueType: "string",
    description: "Default sender display name for outgoing emails",
    defaultValue: "BookPrinta",
  },
  comms_sender_email: {
    category: "notification_comms",
    valueType: "email",
    description: "Default sender email for transactional messaging",
    defaultValue: "hello@bookprinta.com",
  },
  comms_whatsapp_template_toggles: {
    category: "notification_comms",
    valueType: "json_object",
    description: "Feature toggles for WhatsApp templates",
    defaultValue: {},
  },
  comms_escalation_recipients: {
    category: "notification_comms",
    valueType: "list",
    description: "Escalation recipients for critical incidents",
    defaultValue: [],
  },
  maintenance_mode: {
    category: "operational",
    valueType: "boolean",
    description: "Global maintenance mode flag",
    defaultValue: false,
    requiresSuperAdmin: true,
  },
  production_backlog_threshold: {
    category: "operational",
    valueType: "integer",
    description: "Backlog threshold that activates production delay banner",
    defaultValue: 20,
  },
  production_delay_active: {
    category: "operational",
    valueType: "boolean",
    description: "Manual production delay active flag",
    defaultValue: false,
  },
  payment_gateway_priorities: {
    category: "operational",
    valueType: "json_object",
    description: "Payment gateway priority ordering",
    defaultValue: {
      PAYSTACK: 1,
      STRIPE: 2,
      PAYPAL: 3,
      BANK_TRANSFER: 0,
    },
  },
  content_about_blocks: {
    category: "content_controls",
    valueType: "json_object",
    description: "Editable content blocks for About page",
    defaultValue: {
      heading: "About BookPrinta",
      summary: "BookPrinta helps authors publish better books.",
      sections: [],
    },
  },
  content_contact_blocks: {
    category: "content_controls",
    valueType: "json_object",
    description: "Editable contact page content blocks",
    defaultValue: {
      heading: "Contact BookPrinta",
      supportEmail: "support@bookprinta.com",
      supportPhone: "+2348000000000",
      officeAddress: "Lagos, Nigeria",
    },
  },
  content_faq_entries: {
    category: "content_controls",
    valueType: "list",
    description: "Editable FAQ entries",
    defaultValue: [],
  },
  content_legal_page_versions: {
    category: "content_controls",
    valueType: "json_object",
    description: "Version metadata for legal pages",
    defaultValue: {
      terms: [],
      privacy: [],
    },
  },
  content_homepage_hero_copy: {
    category: "content_controls",
    valueType: "json_object",
    description: "Editable hero copy for homepage",
    defaultValue: {
      title: "Your Book. Beautifully Printed.",
      subtitle: "Publish fearlessly \u2014 from as low as 25 copies.",
      primaryCtaLabel: "Start Publishing",
      secondaryCtaLabel: "Get Custom Quote",
    },
  },
  seo_metadata_defaults: {
    category: "seo_controls",
    valueType: "json_object",
    description: "Default metadata template values",
    defaultValue: {
      titleTemplate: "%s | BookPrinta",
      defaultDescription: "BookPrinta helps Nigerian authors publish professional books.",
      defaultRobots: "index,follow",
    },
  },
  seo_og_fallback_image_url: {
    category: "seo_controls",
    valueType: "url",
    description: "Fallback OG image URL",
    defaultValue: "https://bookprinta.com/og-default.png",
  },
  seo_canonical_base_url: {
    category: "seo_controls",
    valueType: "url",
    description: "Canonical base URL for website",
    defaultValue: "https://bookprinta.com",
  },
};

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  PAYSTACK: "Paystack",
  STRIPE: "Stripe",
  PAYPAL: "PayPal",
  BANK_TRANSFER: "Bank Transfer",
};

const PROVIDER_CREDENTIAL_FIELDS: Record<
  PaymentProvider,
  Array<{ field: AdminSystemGatewayCredentialField; label: string }>
> = {
  PAYSTACK: [
    { field: "publicKey", label: "Public Key" },
    { field: "secretKey", label: "Secret Key" },
  ],
  STRIPE: [
    { field: "publicKey", label: "Public Key" },
    { field: "secretKey", label: "Secret Key" },
    { field: "webhookSecret", label: "Webhook Secret" },
  ],
  PAYPAL: [
    { field: "clientId", label: "Client ID" },
    { field: "clientSecret", label: "Client Secret" },
  ],
  BANK_TRANSFER: [{ field: "apiKey", label: "API Key" }],
};

@Injectable()
export class AdminSystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildValidationException(error: ZodError, fallbackMessage: string): BadRequestException {
    const fieldErrors: Record<string, string> = {};

    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "value";

      if (!fieldErrors[path]) {
        fieldErrors[path] = issue.message;
      }
    }

    const firstErrorMessage = Object.values(fieldErrors)[0];

    return new BadRequestException({
      message: firstErrorMessage || fallbackMessage,
      fieldErrors,
    });
  }

  async getPaymentGateways(): Promise<AdminSystemPaymentGatewayListResponse> {
    await this.ensureDefaultGateways();

    const gateways = await this.prisma.paymentGateway.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    return {
      gateways: gateways.map((gateway) => this.serializeGateway(gateway)),
      refreshedAt: new Date().toISOString(),
    };
  }

  async updatePaymentGateway(
    paymentGatewayId: string,
    input: AdminSystemUpdatePaymentGatewayBodyInput,
    actor: AdminActorContext
  ): Promise<AdminSystemPaymentGateway> {
    const payloadResult = AdminSystemUpdatePaymentGatewayBodySchema.safeParse(input);
    if (!payloadResult.success) {
      throw this.buildValidationException(
        payloadResult.error,
        "Invalid payment gateway update payload"
      );
    }

    const payload = payloadResult.data;
    const current = await this.prisma.paymentGateway.findUnique({
      where: { id: paymentGatewayId },
    });

    if (!current) {
      throw new NotFoundException("Payment gateway not found");
    }

    if (payload.isEnabled === false && payload.confirmDangerousOperation !== true) {
      throw new BadRequestException(GATEWAY_DISABLE_CONFIRMATION_ERROR);
    }

    if (payload.isEnabled === false && !payload.changeReason) {
      throw new BadRequestException(GATEWAY_DISABLE_REASON_ERROR);
    }

    let nextBankDetails: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =
      this.normalizeJsonObject(current.bankDetails) as Prisma.InputJsonValue;

    if (payload.bankDetails !== undefined) {
      nextBankDetails = payload.bankDetails
        ? (this.normalizeJsonObject(payload.bankDetails) as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    const changedCredentialFields: string[] = [];
    let publicKey = current.publicKey;
    let secretKey = current.secretKey;

    if (payload.credentials && payload.credentials.length > 0) {
      const bankDetailsObject = this.normalizeJsonObject(nextBankDetails);
      const credentialsObject = this.normalizeJsonObject(bankDetailsObject.credentials);

      for (const credential of payload.credentials) {
        changedCredentialFields.push(credential.field);

        if (credential.field === "publicKey") {
          publicKey = credential.value;
          continue;
        }

        if (credential.field === "secretKey") {
          secretKey = credential.value;
          continue;
        }

        credentialsObject[credential.field] = credential.value;
      }

      bankDetailsObject.credentials = credentialsObject;
      nextBankDetails = bankDetailsObject as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.paymentGateway.update({
      where: { id: paymentGatewayId },
      data: {
        ...(payload.isEnabled !== undefined ? { isEnabled: payload.isEnabled } : {}),
        ...(payload.isTestMode !== undefined ? { isTestMode: payload.isTestMode } : {}),
        ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
        ...(payload.instructions !== undefined ? { instructions: payload.instructions } : {}),
        publicKey,
        secretKey,
        bankDetails: nextBankDetails,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.adminId,
        action: "ADMIN_PAYMENT_GATEWAY_UPDATED",
        entityType: "PAYMENT_GATEWAY",
        entityId: updated.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        details: {
          provider: updated.provider,
          previousState: {
            isEnabled: current.isEnabled,
            isTestMode: current.isTestMode,
            priority: current.priority,
          },
          nextState: {
            isEnabled: updated.isEnabled,
            isTestMode: updated.isTestMode,
            priority: updated.priority,
          },
          // ─────────────────────────────────────────────────────────────
          // Security: Log which credential fields were updated, but never
          // log the actual credential values (publicKey, secretKey, etc.).
          // Log only the field names to maintain an audit trail of when
          // credentials changed, without exposing the values themselves.
          // ─────────────────────────────────────────────────────────────
          changedCredentialFields,
          changeReason: payload.changeReason ?? null,
          dangerousOperationConfirmed: payload.confirmDangerousOperation ?? false,
        } as Prisma.InputJsonValue,
      },
    });

    return this.serializeGateway(updated);
  }

  async getSettings(): Promise<AdminSystemSettingsListResponse> {
    const keys = Object.keys(SETTING_DEFINITIONS) as AdminSystemSettingKey[];
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: keys,
        },
      },
      orderBy: {
        key: "asc",
      },
    });

    const rowMap = new Map(rows.map((row) => [row.key, row]));

    const items = keys.map((key) => {
      const definition = SETTING_DEFINITIONS[key];
      const row = rowMap.get(key);
      const typedValue = row
        ? this.parseStoredValue(row.value, definition.valueType, definition.defaultValue)
        : definition.defaultValue;

      return {
        key,
        category: definition.category,
        valueType: definition.valueType,
        // ────────────────────────────────────────────────────────────
        // Security: Redact sensitive setting values in the response.
        // Sensitive settings are marked with isSensitive: true in
        // SETTING_DEFINITIONS. Admin frontend should not display or log
        // the raw values of these settings.
        // ────────────────────────────────────────────────────────────
        value: definition.isSensitive ? "[REDACTED]" : typedValue,
        description: definition.description,
        isSensitive: Boolean(definition.isSensitive),
        isWriteOnly: Boolean(definition.isWriteOnly),
        requiresSuperAdmin: Boolean(definition.requiresSuperAdmin),
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      };
    });

    return {
      items,
      refreshedAt: new Date().toISOString(),
    };
  }

  async getPublicMarketingSettings(): Promise<AdminPublicMarketingSettingsResponse> {
    const publicKeys: AdminSystemSettingKey[] = [
      "content_homepage_hero_copy",
      "content_contact_blocks",
      "business_website_url",
      "business_support_email",
      "business_support_phone",
      "business_whatsapp_number",
      "business_office_address",
      "business_social_links",
    ];

    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: publicKeys,
        },
      },
    });

    const rowMap = new Map(rows.map((row) => [row.key, row]));
    const resolveTypedValue = <T>(key: AdminSystemSettingKey): T => {
      const definition = SETTING_DEFINITIONS[key];
      const row = rowMap.get(key);

      const typedValue = row
        ? this.parseStoredValue(row.value, definition.valueType, definition.defaultValue)
        : definition.defaultValue;

      return typedValue as T;
    };

    const hero = this.normalizeJsonObject(
      resolveTypedValue<Record<string, unknown>>("content_homepage_hero_copy")
    );
    const contact = this.normalizeJsonObject(
      resolveTypedValue<Record<string, unknown>>("content_contact_blocks")
    );
    const rawSocialLinks = resolveTypedValue<unknown[]>("business_social_links");
    const socialLinks = Array.isArray(rawSocialLinks)
      ? rawSocialLinks
          .map((entry) => this.normalizeJsonObject(entry))
          .map((entry) => ({
            label: String(entry.label ?? "").trim(),
            url: String(entry.url ?? "").trim(),
          }))
          .filter((entry) => entry.label.length > 0 && entry.url.length > 0)
      : [];

    const normalizeOptionalPhone = (value: unknown): string | undefined => {
      const normalized = String(value ?? "").trim();
      return normalized.length > 0 ? normalized : undefined;
    };

    return {
      hero: {
        title: String(hero.title ?? "").trim() || "Your Book. Beautifully Printed.",
        subtitle:
          String(hero.subtitle ?? "").trim() ||
          "Publish fearlessly \u2014 from as low as 25 copies.",
        primaryCtaLabel: String(hero.primaryCtaLabel ?? "").trim() || "Start Publishing",
        secondaryCtaLabel: String(hero.secondaryCtaLabel ?? "").trim() || "Get Custom Quote",
      },
      contact: {
        heading: String(contact.heading ?? "").trim() || "Contact BookPrinta",
        supportEmail: String(contact.supportEmail ?? "").trim() || "support@bookprinta.com",
        supportPhone: String(contact.supportPhone ?? "").trim() || "+2348000000000",
        whatsappNumber: normalizeOptionalPhone(contact.whatsappNumber),
        officeAddress: String(contact.officeAddress ?? "").trim() || "Lagos, Nigeria",
      },
      businessProfile: {
        websiteUrl:
          String(resolveTypedValue<unknown>("business_website_url") ?? "").trim() ||
          "https://bookprinta.com",
        supportEmail:
          String(resolveTypedValue<unknown>("business_support_email") ?? "").trim() ||
          "support@bookprinta.com",
        supportPhone:
          String(resolveTypedValue<unknown>("business_support_phone") ?? "").trim() ||
          "+2348000000000",
        whatsappNumber: normalizeOptionalPhone(
          resolveTypedValue<unknown>("business_whatsapp_number")
        ),
        officeAddress:
          String(resolveTypedValue<unknown>("business_office_address") ?? "").trim() ||
          "Lagos, Nigeria",
        socialLinks,
      },
      refreshedAt: new Date().toISOString(),
    };
  }

  async updateSetting(
    keyInput: string,
    input: AdminSystemUpdateSettingBodyInput,
    actor: AdminActorContext
  ): Promise<AdminSystemSettingsListResponse["items"][number]> {
    const keyResult = AdminSystemSettingKeySchema.safeParse(keyInput);
    if (!keyResult.success) {
      throw this.buildValidationException(keyResult.error, "Invalid setting key");
    }

    const key = keyResult.data;
    const definition = SETTING_DEFINITIONS[key];

    if (definition.requiresSuperAdmin && actor.adminRole !== SUPER_ADMIN_ROLE) {
      throw new ForbiddenException("Only SUPER_ADMIN can update this setting");
    }

    const payloadResult = AdminSystemSettingMutationSchema.safeParse({
      key,
      value: this.coerceValueByType(input.value, definition.valueType),
      confirmDangerousOperation: input.confirmDangerousOperation,
      changeReason: input.changeReason,
    });

    if (!payloadResult.success) {
      throw this.buildValidationException(payloadResult.error, "Invalid setting update payload");
    }

    const payload = payloadResult.data;

    if (CRITICAL_OPERATION_KEYS.has(key) && !payload.changeReason) {
      throw new BadRequestException("changeReason is required for critical operational changes");
    }

    const current = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    const previousValue = current
      ? this.parseStoredValue(current.value, definition.valueType, definition.defaultValue)
      : definition.defaultValue;

    const serializedValue = this.serializeValue(payload.value, definition.valueType);

    const updated = await this.prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: serializedValue,
        description: definition.description,
        updatedBy: actor.adminId,
      },
      create: {
        key,
        value: serializedValue,
        description: definition.description,
        updatedBy: actor.adminId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.adminId,
        action: "ADMIN_SYSTEM_SETTING_UPDATED",
        entityType: "SYSTEM_SETTING",
        entityId: key,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        details: {
          key,
          category: definition.category,
          valueType: definition.valueType,
          previousValue: definition.isSensitive ? "[REDACTED]" : previousValue,
          nextValue: definition.isSensitive ? "[REDACTED]" : payload.value,
          changeReason: payload.changeReason ?? null,
          dangerousOperationConfirmed: payload.confirmDangerousOperation ?? false,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      key,
      category: definition.category,
      valueType: definition.valueType,
      value: this.parseStoredValue(updated.value, definition.valueType, definition.defaultValue),
      description: definition.description,
      isSensitive: Boolean(definition.isSensitive),
      isWriteOnly: Boolean(definition.isWriteOnly),
      requiresSuperAdmin: Boolean(definition.requiresSuperAdmin),
      updatedBy: updated.updatedBy ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  private async ensureDefaultGateways(): Promise<void> {
    const defaults: Array<{ provider: PaymentProvider; priority: number }> = [
      { provider: "BANK_TRANSFER", priority: 0 },
      { provider: "PAYSTACK", priority: 1 },
      { provider: "STRIPE", priority: 2 },
      { provider: "PAYPAL", priority: 3 },
    ];

    await Promise.all(
      defaults.map(({ provider, priority }) =>
        this.prisma.paymentGateway.upsert({
          where: { provider },
          update: {
            name: PROVIDER_LABELS[provider],
          },
          create: {
            provider,
            name: PROVIDER_LABELS[provider],
            isEnabled: provider === "BANK_TRANSFER" || provider === "PAYSTACK",
            isTestMode: provider !== "BANK_TRANSFER",
            priority,
          },
        })
      )
    );
  }

  private serializeGateway(gateway: {
    id: string;
    provider: PaymentProvider;
    name: string;
    isEnabled: boolean;
    isTestMode: boolean;
    priority: number;
    instructions: string | null;
    bankDetails: unknown;
    publicKey: string | null;
    secretKey: string | null;
    updatedAt: Date;
  }): AdminSystemPaymentGateway {
    const bankDetails = this.normalizeJsonObject(gateway.bankDetails);
    const credentialStore = this.normalizeJsonObject(bankDetails.credentials);

    const credentials = PROVIDER_CREDENTIAL_FIELDS[gateway.provider].map(({ field, label }) => {
      const rawValue = this.resolveCredentialValue(
        field,
        gateway.publicKey,
        gateway.secretKey,
        credentialStore
      );

      return {
        field,
        label,
        isConfigured: typeof rawValue === "string" && rawValue.trim().length > 0,
        maskedValue: this.maskSecret(rawValue),
        isWriteOnly: true,
        updatedAt: gateway.updatedAt.toISOString(),
      };
    });

    return {
      id: gateway.id,
      provider: gateway.provider,
      name: gateway.name,
      isEnabled: gateway.isEnabled,
      isTestMode: gateway.isTestMode,
      priority: gateway.priority,
      instructions: gateway.instructions,
      bankDetails: Object.keys(bankDetails).length > 0 ? bankDetails : null,
      credentials,
      updatedAt: gateway.updatedAt.toISOString(),
    };
  }

  private resolveCredentialValue(
    field: string,
    publicKey: string | null,
    secretKey: string | null,
    credentialStore: Record<string, unknown>
  ): string | null {
    if (field === "publicKey") {
      return publicKey;
    }

    if (field === "secretKey") {
      return secretKey;
    }

    const value = credentialStore[field];
    return typeof value === "string" ? value : null;
  }

  private maskSecret(value: string | null): string | null {
    if (!value || value.trim().length === 0) {
      return null;
    }

    const normalized = value.trim();
    if (normalized.length <= 8) {
      return `${normalized.slice(0, 1)}***${normalized.slice(-1)}`;
    }

    return `${normalized.slice(0, 4)}********${normalized.slice(-4)}`;
  }

  private coerceValueByType(value: unknown, valueType: AdminSystemSettingValueType): unknown {
    if (valueType === "integer") {
      if (typeof value === "number") return Math.trunc(value);
      if (typeof value === "string" && value.trim().length > 0) return Number.parseInt(value, 10);
    }

    if (valueType === "decimal") {
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim().length > 0) return Number(value);
    }

    if (valueType === "boolean") {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        if (value.toLowerCase() === "true") return true;
        if (value.toLowerCase() === "false") return false;
      }
    }

    if (
      (valueType === "string" ||
        valueType === "url" ||
        valueType === "email" ||
        valueType === "phone") &&
      typeof value !== "string"
    ) {
      return String(value ?? "").trim();
    }

    return value;
  }

  private serializeValue(value: unknown, valueType: AdminSystemSettingValueType): string {
    if (valueType === "list" || valueType === "json_object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private parseStoredValue(
    rawValue: string,
    valueType: AdminSystemSettingValueType,
    fallback: unknown
  ): unknown {
    try {
      switch (valueType) {
        case "boolean":
          return rawValue === "true";
        case "integer": {
          const parsed = Number.parseInt(rawValue, 10);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        case "decimal": {
          const parsed = Number(rawValue);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        case "list":
        case "json_object": {
          const parsed = JSON.parse(rawValue) as unknown;
          return parsed;
        }
        default:
          return rawValue;
      }
    } catch {
      return fallback;
    }
  }

  private normalizeJsonObject(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
