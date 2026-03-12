import { z } from "zod";

// ==========================================
// User / Profile / Settings Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

const MAX_PROFILE_LINKS = 10;
const MAX_URL_LENGTH = 2048;
const MAX_PHONE_LENGTH = 40;
const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/;

export const SupportedLanguageSchema = z.enum(["en", "fr", "es"]);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export const UserProfileBioSchema = z.string().trim().min(1).max(500);
export type UserProfileBio = z.infer<typeof UserProfileBioSchema>;

export const UserProfileImageUrlSchema = z.string().trim().url().max(MAX_URL_LENGTH);
export type UserProfileImageUrl = z.infer<typeof UserProfileImageUrlSchema>;

export const UserWebsiteUrlSchema = z.string().trim().url().max(MAX_URL_LENGTH);
export type UserWebsiteUrl = z.infer<typeof UserWebsiteUrlSchema>;

export const UserWhatsAppNumberSchema = z.string().trim().min(1).max(MAX_PHONE_LENGTH);
export type UserWhatsAppNumber = z.infer<typeof UserWhatsAppNumberSchema>;

export const PurchaseLinkSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    url: UserWebsiteUrlSchema,
  })
  .strict();
export type PurchaseLink = z.infer<typeof PurchaseLinkSchema>;

export const PurchaseLinksSchema = z.array(PurchaseLinkSchema).max(MAX_PROFILE_LINKS);
export type PurchaseLinks = z.infer<typeof PurchaseLinksSchema>;

export const SocialLinkSchema = z
  .object({
    platform: z.string().trim().min(1).max(80),
    url: UserWebsiteUrlSchema,
  })
  .strict();
export type SocialLink = z.infer<typeof SocialLinkSchema>;

export const SocialLinksSchema = z.array(SocialLinkSchema).max(MAX_PROFILE_LINKS);
export type SocialLinks = z.infer<typeof SocialLinksSchema>;

export const UserNotificationPreferencesSchema = z
  .object({
    email: z.boolean(),
    whatsApp: z.boolean(),
    inApp: z.boolean(),
  })
  .strict();
export type UserNotificationPreferences = z.infer<typeof UserNotificationPreferencesSchema>;

export const ProfileImageUploadMimeTypeSchema = z.enum(["image/jpeg", "image/png"]);
export type ProfileImageUploadMimeType = z.infer<typeof ProfileImageUploadMimeTypeSchema>;

export const PublicAuthorProfileSchema = z
  .object({
    bio: UserProfileBioSchema.optional(),
    profileImageUrl: UserProfileImageUrlSchema.optional(),
    whatsAppNumber: UserWhatsAppNumberSchema.optional(),
    websiteUrl: UserWebsiteUrlSchema.optional(),
    purchaseLinks: PurchaseLinksSchema.min(1).optional(),
    socialLinks: SocialLinksSchema.min(1).optional(),
  })
  .strict();
export type PublicAuthorProfile = z.infer<typeof PublicAuthorProfileSchema>;

export const MyProfileResponseSchema = z
  .object({
    bio: UserProfileBioSchema.nullable(),
    profileImageUrl: UserProfileImageUrlSchema.nullable(),
    whatsAppNumber: UserWhatsAppNumberSchema.nullable(),
    websiteUrl: UserWebsiteUrlSchema.nullable(),
    purchaseLinks: PurchaseLinksSchema,
    socialLinks: SocialLinksSchema,
    isProfileComplete: z.boolean(),
    preferredLanguage: SupportedLanguageSchema,
    notificationPreferences: UserNotificationPreferencesSchema,
  })
  .strict();
export type MyProfileResponse = z.infer<typeof MyProfileResponseSchema>;

function createOptionalNullableStringFieldSchema(params: { kind: "text" | "url" | "phone" }) {
  const normalizedInputSchema = z.preprocess((value) => {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }, z.unknown());

  switch (params.kind) {
    case "url":
      return normalizedInputSchema.pipe(UserWebsiteUrlSchema.nullable().optional());
    case "phone":
      return normalizedInputSchema.pipe(UserWhatsAppNumberSchema.nullable().optional());
    default:
      return normalizedInputSchema.pipe(UserProfileBioSchema.nullable().optional());
  }
}

export const UpdateMyProfileBodySchema = z
  .object({
    bio: createOptionalNullableStringFieldSchema({ kind: "text" }),
    whatsAppNumber: createOptionalNullableStringFieldSchema({ kind: "phone" }),
    websiteUrl: createOptionalNullableStringFieldSchema({ kind: "url" }),
    purchaseLinks: PurchaseLinksSchema.optional(),
    socialLinks: SocialLinksSchema.optional(),
  })
  .strict();
export type UpdateMyProfileBodyInput = z.infer<typeof UpdateMyProfileBodySchema>;

export const UpdateMyProfileResponseSchema = MyProfileResponseSchema;
export type UpdateMyProfileResponse = z.infer<typeof UpdateMyProfileResponseSchema>;

export const UpdateMyLanguageBodySchema = z
  .object({
    preferredLanguage: SupportedLanguageSchema,
  })
  .strict();
export type UpdateMyLanguageBodyInput = z.infer<typeof UpdateMyLanguageBodySchema>;

export const UpdateMyLanguageResponseSchema = z
  .object({
    preferredLanguage: SupportedLanguageSchema,
  })
  .strict();
export type UpdateMyLanguageResponse = z.infer<typeof UpdateMyLanguageResponseSchema>;

export const AuthorizeMyProfileImageUploadBodySchema = z
  .object({
    action: z.literal("authorize"),
    mimeType: ProfileImageUploadMimeTypeSchema,
  })
  .strict();
export type AuthorizeMyProfileImageUploadBodyInput = z.infer<
  typeof AuthorizeMyProfileImageUploadBodySchema
>;

export const FinalizeMyProfileImageUploadBodySchema = z
  .object({
    action: z.literal("finalize"),
    secureUrl: UserProfileImageUrlSchema,
    publicId: z.string().trim().min(1).max(255),
  })
  .strict();
export type FinalizeMyProfileImageUploadBodyInput = z.infer<
  typeof FinalizeMyProfileImageUploadBodySchema
>;

export const RequestMyProfileImageUploadBodySchema = z
  .object({
    action: z.enum(["authorize", "finalize"]),
    mimeType: ProfileImageUploadMimeTypeSchema.optional(),
    secureUrl: UserProfileImageUrlSchema.optional(),
    publicId: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "authorize") {
      if (!value.mimeType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mimeType"],
          message: "mimeType is required when action is authorize",
        });
      }
      return;
    }

    if (!value.secureUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secureUrl"],
        message: "secureUrl is required when action is finalize",
      });
    }

    if (!value.publicId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicId"],
        message: "publicId is required when action is finalize",
      });
    }
  });
export type RequestMyProfileImageUploadBodyInput = z.infer<
  typeof RequestMyProfileImageUploadBodySchema
>;

export const AuthorizeMyProfileImageUploadResponseSchema = z
  .object({
    action: z.literal("authorize"),
    upload: z
      .object({
        signature: z.string().min(1),
        timestamp: z.number().int().positive(),
        cloudName: z.string().min(1),
        apiKey: z.string().min(1),
        folder: z.string().min(1),
        eager: z.string().min(1).optional(),
        resourceType: z.literal("image"),
        publicId: z.string().min(1),
        tags: z.array(z.string().min(1)).optional(),
      })
      .strict(),
  })
  .strict();
export type AuthorizeMyProfileImageUploadResponse = z.infer<
  typeof AuthorizeMyProfileImageUploadResponseSchema
>;

export const FinalizeMyProfileImageUploadResponseSchema = z
  .object({
    action: z.literal("finalize"),
    profile: MyProfileResponseSchema,
  })
  .strict();
export type FinalizeMyProfileImageUploadResponse = z.infer<
  typeof FinalizeMyProfileImageUploadResponseSchema
>;

export const RequestMyProfileImageUploadResponseSchema = z
  .object({
    action: z.enum(["authorize", "finalize"]),
    upload: AuthorizeMyProfileImageUploadResponseSchema.shape.upload.optional(),
    profile: MyProfileResponseSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "authorize") {
      if (!value.upload) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["upload"],
          message: "upload is required when action is authorize",
        });
      }
      return;
    }

    if (!value.profile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["profile"],
        message: "profile is required when action is finalize",
      });
    }
  });
export type RequestMyProfileImageUploadResponse = z.infer<
  typeof RequestMyProfileImageUploadResponseSchema
>;

export const DeleteMyProfileImageResponseSchema = MyProfileResponseSchema;
export type DeleteMyProfileImageResponse = z.infer<typeof DeleteMyProfileImageResponseSchema>;

const StrongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(STRONG_PASSWORD_REGEX, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
  });

export const ChangeMyPasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: StrongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangeMyPasswordBodyInput = z.infer<typeof ChangeMyPasswordBodySchema>;

export const ChangeMyPasswordResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();
export type ChangeMyPasswordResponse = z.infer<typeof ChangeMyPasswordResponseSchema>;

export const UpdateMyNotificationPreferencesBodySchema = UserNotificationPreferencesSchema;
export type UpdateMyNotificationPreferencesBodyInput = z.infer<
  typeof UpdateMyNotificationPreferencesBodySchema
>;

export const UpdateMyNotificationPreferencesResponseSchema = z
  .object({
    notificationPreferences: UserNotificationPreferencesSchema,
  })
  .strict();
export type UpdateMyNotificationPreferencesResponse = z.infer<
  typeof UpdateMyNotificationPreferencesResponseSchema
>;
