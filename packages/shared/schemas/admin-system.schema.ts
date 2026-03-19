import { z } from "zod";

export const AdminSystemSettingsCategorySchema = z.enum([
  "business_profile",
  "quote_pricing",
  "notification_comms",
  "operational",
  "content_controls",
  "seo_controls",
]);
export type AdminSystemSettingsCategory = z.infer<typeof AdminSystemSettingsCategorySchema>;

export const AdminSystemSettingValueTypeSchema = z.enum([
  "boolean",
  "integer",
  "decimal",
  "url",
  "email",
  "phone",
  "string",
  "list",
  "json_object",
]);
export type AdminSystemSettingValueType = z.infer<typeof AdminSystemSettingValueTypeSchema>;

export const AdminSystemSettingKeySchema = z.enum([
  "business_website_url",
  "business_support_email",
  "business_support_phone",
  "business_whatsapp_number",
  "business_office_address",
  "business_social_links",
  "quote_cost_per_page",
  "quote_cover_cost",
  "reprint_cost_per_page_a4",
  "reprint_cost_per_page_a5",
  "reprint_cost_per_page_a6",
  "reprint_minimum_copies",
  "comms_sender_name",
  "comms_sender_email",
  "comms_whatsapp_template_toggles",
  "comms_escalation_recipients",
  "maintenance_mode",
  "production_backlog_threshold",
  "production_delay_active",
  "payment_gateway_priorities",
  "content_about_blocks",
  "content_contact_blocks",
  "content_faq_entries",
  "content_legal_page_versions",
  "content_homepage_hero_copy",
  "seo_metadata_defaults",
  "seo_og_fallback_image_url",
  "seo_canonical_base_url",
]);
export type AdminSystemSettingKey = z.infer<typeof AdminSystemSettingKeySchema>;

const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,20}$/, "Phone number must be 7-20 digits and can start with +");

const DecimalMoneySchema = z
  .number()
  .finite()
  .min(0, "Value must be greater than or equal to 0")
  .max(10_000_000, "Value must be less than or equal to 10,000,000");

const SocialLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().url().max(400),
});

const FaqEntrySchema = z.object({
  question: z.string().trim().min(1).max(240),
  answer: z.string().trim().min(1).max(4000),
});

const AboutBlocksSchema = z.object({
  heading: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(2000),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        body: z.string().trim().min(1).max(4000),
      })
    )
    .max(20),
});

const ContactBlocksSchema = z.object({
  heading: z.string().trim().min(1).max(180),
  supportEmail: z.string().email(),
  supportPhone: PhoneSchema,
  whatsappNumber: PhoneSchema.optional(),
  officeAddress: z.string().trim().min(3).max(500),
});

const PublicBusinessProfileSchema = z.object({
  websiteUrl: z.string().url().max(400),
  supportEmail: z.string().email().max(240),
  supportPhone: PhoneSchema,
  whatsappNumber: PhoneSchema.optional(),
  officeAddress: z.string().trim().min(3).max(500),
  socialLinks: z.array(SocialLinkSchema).max(20),
});

const PublicHeroCopySchema = z.object({
  title: z.string().trim().min(1).max(180),
  subtitle: z.string().trim().min(1).max(500),
  primaryCtaLabel: z.string().trim().min(1).max(80),
  secondaryCtaLabel: z.string().trim().min(1).max(80),
});
const PublicContactBlocksSchema = ContactBlocksSchema;

export const AdminPublicMarketingSettingsResponseSchema = z.object({
  hero: PublicHeroCopySchema,
  contact: PublicContactBlocksSchema,
  businessProfile: PublicBusinessProfileSchema,
  refreshedAt: z.string().datetime(),
});
export type AdminPublicMarketingSettingsResponse = z.infer<
  typeof AdminPublicMarketingSettingsResponseSchema
>;

const LegalVersionItemSchema = z.object({
  version: z.string().trim().min(1).max(40),
  publishedAt: z.string().datetime(),
  checksum: z.string().trim().min(6).max(128),
});

const HomepageHeroCopySchema = z.object({
  title: z.string().trim().min(1).max(180),
  subtitle: z.string().trim().min(1).max(500),
  primaryCtaLabel: z.string().trim().min(1).max(80),
  secondaryCtaLabel: z.string().trim().min(1).max(80),
});

const MetadataDefaultsSchema = z.object({
  titleTemplate: z.string().trim().min(1).max(120),
  defaultDescription: z.string().trim().min(1).max(320),
  defaultRobots: z.enum(["index,follow", "noindex,nofollow"]),
});

const GatewayPrioritiesSchema = z.object({
  PAYSTACK: z.number().int().min(0).max(100),
  STRIPE: z.number().int().min(0).max(100),
  PAYPAL: z.number().int().min(0).max(100),
  BANK_TRANSFER: z.number().int().min(0).max(100),
});

const WhatsappTemplateTogglesSchema = z.record(z.string().trim().min(1).max(80), z.boolean());

const keyValidationMap: Record<
  AdminSystemSettingKey,
  {
    valueType: AdminSystemSettingValueType;
    category: AdminSystemSettingsCategory;
    schema: z.ZodTypeAny;
    isSensitive?: boolean;
    isWriteOnly?: boolean;
    requiresSuperAdmin?: boolean;
  }
> = {
  business_website_url: {
    valueType: "url",
    category: "business_profile",
    schema: z.string().url().max(400),
  },
  business_support_email: {
    valueType: "email",
    category: "business_profile",
    schema: z.string().email().max(240),
  },
  business_support_phone: {
    valueType: "phone",
    category: "business_profile",
    schema: PhoneSchema,
  },
  business_whatsapp_number: {
    valueType: "phone",
    category: "business_profile",
    schema: PhoneSchema,
  },
  business_office_address: {
    valueType: "string",
    category: "business_profile",
    schema: z.string().trim().min(3).max(500),
  },
  business_social_links: {
    valueType: "list",
    category: "business_profile",
    schema: z.array(SocialLinkSchema).max(20),
  },
  quote_cost_per_page: {
    valueType: "decimal",
    category: "quote_pricing",
    schema: DecimalMoneySchema,
  },
  quote_cover_cost: {
    valueType: "decimal",
    category: "quote_pricing",
    schema: DecimalMoneySchema,
  },
  reprint_cost_per_page_a4: {
    valueType: "decimal",
    category: "quote_pricing",
    schema: DecimalMoneySchema,
  },
  reprint_cost_per_page_a5: {
    valueType: "decimal",
    category: "quote_pricing",
    schema: DecimalMoneySchema,
  },
  reprint_cost_per_page_a6: {
    valueType: "decimal",
    category: "quote_pricing",
    schema: DecimalMoneySchema,
  },
  reprint_minimum_copies: {
    valueType: "integer",
    category: "quote_pricing",
    schema: z.number().int().min(25).max(10_000),
    requiresSuperAdmin: true,
  },
  comms_sender_name: {
    valueType: "string",
    category: "notification_comms",
    schema: z.string().trim().min(2).max(120),
  },
  comms_sender_email: {
    valueType: "email",
    category: "notification_comms",
    schema: z.string().email().max(240),
  },
  comms_whatsapp_template_toggles: {
    valueType: "json_object",
    category: "notification_comms",
    schema: WhatsappTemplateTogglesSchema,
  },
  comms_escalation_recipients: {
    valueType: "list",
    category: "notification_comms",
    schema: z.array(z.string().email().max(240)).max(50),
  },
  maintenance_mode: {
    valueType: "boolean",
    category: "operational",
    schema: z.boolean(),
    requiresSuperAdmin: true,
  },
  production_backlog_threshold: {
    valueType: "integer",
    category: "operational",
    schema: z.number().int().min(1).max(500),
  },
  production_delay_active: {
    valueType: "boolean",
    category: "operational",
    schema: z.boolean(),
  },
  payment_gateway_priorities: {
    valueType: "json_object",
    category: "operational",
    schema: GatewayPrioritiesSchema,
  },
  content_about_blocks: {
    valueType: "json_object",
    category: "content_controls",
    schema: AboutBlocksSchema,
  },
  content_contact_blocks: {
    valueType: "json_object",
    category: "content_controls",
    schema: ContactBlocksSchema,
  },
  content_faq_entries: {
    valueType: "list",
    category: "content_controls",
    schema: z.array(FaqEntrySchema).max(200),
  },
  content_legal_page_versions: {
    valueType: "json_object",
    category: "content_controls",
    schema: z.object({
      terms: z.array(LegalVersionItemSchema).max(20),
      privacy: z.array(LegalVersionItemSchema).max(20),
    }),
  },
  content_homepage_hero_copy: {
    valueType: "json_object",
    category: "content_controls",
    schema: HomepageHeroCopySchema,
  },
  seo_metadata_defaults: {
    valueType: "json_object",
    category: "seo_controls",
    schema: MetadataDefaultsSchema,
  },
  seo_og_fallback_image_url: {
    valueType: "url",
    category: "seo_controls",
    schema: z.string().url().max(400),
  },
  seo_canonical_base_url: {
    valueType: "url",
    category: "seo_controls",
    schema: z.string().url().max(400),
  },
};

export const AdminSystemSettingDefinitionSchema = z.object({
  key: AdminSystemSettingKeySchema,
  category: AdminSystemSettingsCategorySchema,
  valueType: AdminSystemSettingValueTypeSchema,
  description: z.string().trim().min(1).max(400),
  isSensitive: z.boolean().default(false),
  isWriteOnly: z.boolean().default(false),
  requiresSuperAdmin: z.boolean().default(false),
});
export type AdminSystemSettingDefinition = z.infer<typeof AdminSystemSettingDefinitionSchema>;

export const AdminSystemSettingListItemSchema = z
  .object({
    key: AdminSystemSettingKeySchema,
    category: AdminSystemSettingsCategorySchema,
    valueType: AdminSystemSettingValueTypeSchema,
    value: z.unknown(),
    description: z.string().trim().min(1).max(400),
    isSensitive: z.boolean().default(false),
    isWriteOnly: z.boolean().default(false),
    requiresSuperAdmin: z.boolean().default(false),
    updatedBy: z.string().cuid().nullable(),
    updatedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, ctx) => {
    const definition = keyValidationMap[value.key];
    if (!definition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["key"],
        message: `Unknown setting key: ${value.key}`,
      });
      return;
    }

    if (definition.category !== value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: `Category mismatch for key: ${value.key}`,
      });
    }

    if (definition.valueType !== value.valueType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valueType"],
        message: `Value type mismatch for key: ${value.key}`,
      });
    }

    const parsed = definition.schema.safeParse(value.value);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: firstIssue?.message ?? `Invalid value for key: ${value.key}`,
      });
    }

    if (definition.isSensitive !== Boolean(value.isSensitive)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isSensitive"],
        message: `Sensitive flag mismatch for key: ${value.key}`,
      });
    }

    if (definition.isWriteOnly !== Boolean(value.isWriteOnly)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isWriteOnly"],
        message: `Write-only flag mismatch for key: ${value.key}`,
      });
    }

    if (Boolean(definition.requiresSuperAdmin) !== Boolean(value.requiresSuperAdmin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiresSuperAdmin"],
        message: `Role constraint mismatch for key: ${value.key}`,
      });
    }
  });
export type AdminSystemSettingListItem = z.infer<typeof AdminSystemSettingListItemSchema>;

export const AdminSystemSettingsListResponseSchema = z.object({
  items: z.array(AdminSystemSettingListItemSchema),
  refreshedAt: z.string().datetime(),
});
export type AdminSystemSettingsListResponse = z.infer<typeof AdminSystemSettingsListResponseSchema>;

export const AdminSystemUpdateSettingBodySchema = z.object({
  value: z.unknown(),
  confirmDangerousOperation: z.boolean().optional(),
  changeReason: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});
export type AdminSystemUpdateSettingBodyInput = z.infer<typeof AdminSystemUpdateSettingBodySchema>;

export const AdminSystemSettingMutationSchema = z
  .object({
    key: AdminSystemSettingKeySchema,
    value: z.unknown(),
    confirmDangerousOperation: z.boolean().optional(),
    changeReason: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .superRefine((input, ctx) => {
    const definition = keyValidationMap[input.key];
    const parsed = definition.schema.safeParse(input.value);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: parsed.error.issues[0]?.message ?? `Invalid value for key: ${input.key}`,
      });
    }

    const requiresReason =
      input.key === "maintenance_mode" || input.key === "production_delay_active";
    if (requiresReason && !input.changeReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changeReason"],
        message: "changeReason is required for critical operational changes",
      });
    }

    const requiresConfirmation = input.key === "maintenance_mode" && input.value === true;
    if (requiresConfirmation && input.confirmDangerousOperation !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmDangerousOperation"],
        message: "confirmDangerousOperation must be true when enabling maintenance mode",
      });
    }
  });
export type AdminSystemSettingMutationInput = z.infer<typeof AdminSystemSettingMutationSchema>;

export const AdminSystemPaymentProviderSchema = z.enum([
  "PAYSTACK",
  "STRIPE",
  "PAYPAL",
  "BANK_TRANSFER",
]);
export type AdminSystemPaymentProvider = z.infer<typeof AdminSystemPaymentProviderSchema>;

export const AdminSystemGatewayCredentialFieldSchema = z.enum([
  "publicKey",
  "secretKey",
  "clientId",
  "clientSecret",
  "webhookSecret",
  "apiKey",
]);
export type AdminSystemGatewayCredentialField = z.infer<
  typeof AdminSystemGatewayCredentialFieldSchema
>;

export const AdminSystemGatewayCredentialReadSchema = z
  .object({
    field: AdminSystemGatewayCredentialFieldSchema,
    label: z.string().trim().min(1).max(80),
    isConfigured: z.boolean(),
    maskedValue: z.string().trim().max(120).nullable(),
    isWriteOnly: z.boolean().default(true),
    updatedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.isConfigured && !value.maskedValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maskedValue"],
        message: "Configured credentials must include a masked value",
      });
    }

    if (value.maskedValue && !value.maskedValue.includes("*")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maskedValue"],
        message: "Credential read payload must be masked",
      });
    }
  });
export type AdminSystemGatewayCredentialRead = z.infer<
  typeof AdminSystemGatewayCredentialReadSchema
>;

export const AdminSystemGatewayCredentialWriteSchema = z.object({
  field: AdminSystemGatewayCredentialFieldSchema,
  value: z.string().trim().min(8).max(4000),
});
export type AdminSystemGatewayCredentialWrite = z.infer<
  typeof AdminSystemGatewayCredentialWriteSchema
>;

export const AdminSystemPaymentGatewaySchema = z.object({
  id: z.string().cuid(),
  provider: AdminSystemPaymentProviderSchema,
  name: z.string().trim().min(1).max(80),
  isEnabled: z.boolean(),
  isTestMode: z.boolean(),
  priority: z.number().int().min(0).max(100),
  instructions: z.string().max(2000).nullable(),
  bankDetails: z.record(z.string(), z.unknown()).nullable(),
  credentials: z.array(AdminSystemGatewayCredentialReadSchema),
  updatedAt: z.string().datetime(),
});
export type AdminSystemPaymentGateway = z.infer<typeof AdminSystemPaymentGatewaySchema>;

export const AdminSystemPaymentGatewayListResponseSchema = z.object({
  gateways: z.array(AdminSystemPaymentGatewaySchema),
  refreshedAt: z.string().datetime(),
});
export type AdminSystemPaymentGatewayListResponse = z.infer<
  typeof AdminSystemPaymentGatewayListResponseSchema
>;

export const AdminSystemUpdatePaymentGatewayBodySchema = z.object({
  isEnabled: z.boolean().optional(),
  isTestMode: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  instructions: z.string().max(2000).nullable().optional(),
  bankDetails: z.record(z.string(), z.unknown()).nullable().optional(),
  credentials: z.array(AdminSystemGatewayCredentialWriteSchema).max(12).optional(),
  confirmDangerousOperation: z.boolean().optional(),
  changeReason: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});
export type AdminSystemUpdatePaymentGatewayBodyInput = z.infer<
  typeof AdminSystemUpdatePaymentGatewayBodySchema
>;

export const AdminAuditLogActionSchema = z.enum([
  "CREATE",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "REJECT",
  "REFUND",
  "OVERRIDE",
  "LOGIN",
  "LOGOUT",
  "OTHER",
]);
export type AdminAuditLogAction = z.infer<typeof AdminAuditLogActionSchema>;

export const AdminAuditLogsQuerySchema = z
  .object({
    cursor: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    action: z.string().trim().min(1).max(120).optional(),
    userId: z.string().cuid().optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    entityId: z.string().trim().min(1).max(120).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    q: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "dateTo must be on or after dateFrom",
      });
    }
  });
export type AdminAuditLogsQuery = z.infer<typeof AdminAuditLogsQuerySchema>;

export const AdminAuditLogItemSchema = z.object({
  id: z.string().cuid(),
  timestamp: z.string().datetime(),
  action: z.string().trim().min(1).max(120),
  actorUserId: z.string().cuid().nullable(),
  actorName: z.string().trim().min(1).max(200).nullable(),
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().trim().min(1).max(120),
  ipAddress: z.string().trim().min(3).max(120).nullable(),
  userAgent: z.string().trim().min(1).max(500).nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
});
export type AdminAuditLogItem = z.infer<typeof AdminAuditLogItemSchema>;

export const AdminAuditLogsResponseSchema = z.object({
  items: z.array(AdminAuditLogItemSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
  totalItems: z.number().int().min(0),
  limit: z.number().int().min(1).max(100),
});
export type AdminAuditLogsResponse = z.infer<typeof AdminAuditLogsResponseSchema>;

export const AdminErrorLogSeveritySchema = z.enum(["error", "warn", "info"]);
export type AdminErrorLogSeverity = z.infer<typeof AdminErrorLogSeveritySchema>;

export const AdminErrorLogStatusSchema = z.enum(["open", "acknowledged", "resolved"]);
export type AdminErrorLogStatus = z.infer<typeof AdminErrorLogStatusSchema>;

export const AdminErrorLogsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    severity: AdminErrorLogSeveritySchema.optional(),
    status: AdminErrorLogStatusSchema.optional(),
    service: z.string().trim().max(120).optional(),
    ownerUserId: z.string().cuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    q: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "dateTo must be on or after dateFrom",
      });
    }
  });
export type AdminErrorLogsQuery = z.infer<typeof AdminErrorLogsQuerySchema>;

export const AdminErrorLogActionSchema = z.enum([
  "acknowledge",
  "assign_owner",
  "mark_resolved",
  "attach_note",
]);
export type AdminErrorLogAction = z.infer<typeof AdminErrorLogActionSchema>;

export const AdminErrorLogActionBodySchema = z
  .object({
    action: AdminErrorLogActionSchema,
    ownerUserId: z.string().cuid().optional(),
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "assign_owner" && !value.ownerUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerUserId"],
        message: "ownerUserId is required when action is assign_owner",
      });
    }

    if (value.action === "attach_note" && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "note is required when action is attach_note",
      });
    }
  });
export type AdminErrorLogActionBodyInput = z.infer<typeof AdminErrorLogActionBodySchema>;

export const AdminErrorLogActionResponseSchema = z.object({
  id: z.string().trim().min(1).max(240),
  fingerprint: z.string().trim().min(1).max(240),
  status: AdminErrorLogStatusSchema,
  ownerUserId: z.string().cuid().nullable(),
  ownerName: z.string().trim().min(1).max(200).nullable(),
  note: z.string().trim().min(1).max(1000).nullable(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().cuid(),
  actionApplied: AdminErrorLogActionSchema,
});
export type AdminErrorLogActionResponse = z.infer<typeof AdminErrorLogActionResponseSchema>;

export const AdminErrorLogItemSchema = z.object({
  id: z.string().trim().min(1).max(200),
  timestamp: z.string().datetime(),
  severity: AdminErrorLogSeveritySchema,
  status: AdminErrorLogStatusSchema,
  service: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  fingerprint: z.string().trim().min(1).max(240),
  environment: z.string().trim().min(1).max(40),
  ownerUserId: z.string().cuid().nullable(),
  ownerName: z.string().trim().min(1).max(200).nullable(),
  suggestedAction: z.string().trim().min(1).max(500).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type AdminErrorLogItem = z.infer<typeof AdminErrorLogItemSchema>;

export const AdminErrorLogsResponseSchema = z.object({
  items: z.array(AdminErrorLogItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  totalItems: z.number().int().min(0),
  limit: z.number().int().min(1).max(100),
});
export type AdminErrorLogsResponse = z.infer<typeof AdminErrorLogsResponseSchema>;

export const AdminDashboardRangeKeySchema = z.enum(["7d", "30d", "90d", "12m", "custom"]);
export type AdminDashboardRangeKey = z.infer<typeof AdminDashboardRangeKeySchema>;

export const AdminDashboardStatsQuerySchema = z
  .object({
    range: AdminDashboardRangeKeySchema.default("30d"),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.range === "custom" && (!value.from || !value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["range"],
        message: "from and to are required when range is custom",
      });
    }
  });
export type AdminDashboardStatsQuery = z.infer<typeof AdminDashboardStatsQuerySchema>;

export const AdminDashboardChartsQuerySchema = AdminDashboardStatsQuerySchema;
export type AdminDashboardChartsQuery = z.infer<typeof AdminDashboardChartsQuerySchema>;

export const AdminDashboardMetricSchema = z.object({
  value: z.number().min(0),
  deltaPercent: z.number().finite().nullable(),
});
export type AdminDashboardMetric = z.infer<typeof AdminDashboardMetricSchema>;

export const AdminDashboardRangeWindowSchema = z.object({
  key: AdminDashboardRangeKeySchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  previousFrom: z.string().datetime(),
  previousTo: z.string().datetime(),
});
export type AdminDashboardRangeWindow = z.infer<typeof AdminDashboardRangeWindowSchema>;

export const AdminDashboardStatsResponseSchema = z.object({
  totalOrders: AdminDashboardMetricSchema,
  totalRevenueNgn: AdminDashboardMetricSchema,
  activeBooksInProduction: AdminDashboardMetricSchema,
  pendingBankTransfers: AdminDashboardMetricSchema,
  slaAtRiskCount: z.number().int().min(0),
  range: AdminDashboardRangeWindowSchema,
  lastUpdatedAt: z.string().datetime(),
});
export type AdminDashboardStatsResponse = z.infer<typeof AdminDashboardStatsResponseSchema>;

export const AdminAnalyticsSeriesPointSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.number().min(0),
});
export type AdminAnalyticsSeriesPoint = z.infer<typeof AdminAnalyticsSeriesPointSchema>;

export const AdminAnalyticsTimeSeriesPointSchema = z.object({
  at: z.string().datetime(),
  revenueNgn: z.number().min(0),
  orders: z.number().int().min(0),
  pendingTransfers: z.number().int().min(0),
});
export type AdminAnalyticsTimeSeriesPoint = z.infer<typeof AdminAnalyticsTimeSeriesPointSchema>;

export const AdminAnalyticsSlaSeriesPointSchema = z.object({
  at: z.string().datetime(),
  under15m: z.number().int().min(0),
  between15mAnd30m: z.number().int().min(0),
  over30m: z.number().int().min(0),
});
export type AdminAnalyticsSlaSeriesPoint = z.infer<typeof AdminAnalyticsSlaSeriesPointSchema>;

export const AdminDashboardChartsResponseSchema = z.object({
  revenueAndOrdersTrend: z.array(AdminAnalyticsTimeSeriesPointSchema),
  paymentMethodDistribution: z.array(AdminAnalyticsSeriesPointSchema),
  orderStatusDistribution: z.array(AdminAnalyticsSeriesPointSchema),
  bankTransferSlaTrend: z.array(AdminAnalyticsSlaSeriesPointSchema),
  range: AdminDashboardRangeWindowSchema,
  refreshedAt: z.string().datetime(),
});
export type AdminDashboardChartsResponse = z.infer<typeof AdminDashboardChartsResponseSchema>;
