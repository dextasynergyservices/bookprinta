import { randomUUID } from "node:crypto";
import type {
  AuthorizeMyProfileImageUploadResponse,
  ChangeMyPasswordBodyInput,
  ChangeMyPasswordResponse,
  DeleteMyProfileImageResponse,
  FinalizeMyProfileImageUploadResponse,
  MyProfileResponse,
  PurchaseLink,
  RequestMyProfileImageUploadBodyInput,
  RequestMyProfileImageUploadResponse,
  SocialLink,
  UpdateMyLanguageBodyInput,
  UpdateMyLanguageResponse,
  UpdateMyNotificationPreferencesBodyInput,
  UpdateMyNotificationPreferencesResponse,
  UpdateMyProfileBodyInput,
  UpdateMyProfileResponse,
} from "@bookprinta/shared";
import {
  PurchaseLinkSchema,
  SocialLinkSchema,
  UserProfileBioSchema,
  UserProfileImageUrlSchema,
  UserWebsiteUrlSchema,
  UserWhatsAppNumberSchema,
} from "@bookprinta/shared";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const PROFILE_IMAGE_FOLDER_ROOT = "bookprinta/profile-images";
const PASSWORD_SALT_ROUNDS = 12;

const USER_PROFILE_SELECT = {
  id: true,
  password: true,
  bio: true,
  profileImageUrl: true,
  profileImagePublicId: true,
  whatsAppNumber: true,
  websiteUrl: true,
  purchaseLinks: true,
  socialLinks: true,
  isProfileComplete: true,
  preferredLanguage: true,
  emailNotificationsEnabled: true,
  whatsAppNotificationsEnabled: true,
  inAppNotificationsEnabled: true,
  refreshToken: true,
  refreshTokenExp: true,
} satisfies Prisma.UserSelect;

type UserProfileRow = Prisma.UserGetPayload<{ select: typeof USER_PROFILE_SELECT }>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService
  ) {}

  async getMyProfile(userId: string): Promise<MyProfileResponse> {
    const user = await this.getUserProfileOrThrow(userId);
    return this.serializeUserProfile(user);
  }

  async updateMyProfile(
    userId: string,
    input: UpdateMyProfileBodyInput
  ): Promise<UpdateMyProfileResponse> {
    const existing = await this.getUserProfileOrThrow(userId);
    const currentProfile = this.serializeUserProfile(existing);

    const nextProfile = {
      bio: input.bio !== undefined ? input.bio : currentProfile.bio,
      profileImageUrl: currentProfile.profileImageUrl,
      whatsAppNumber:
        input.whatsAppNumber !== undefined ? input.whatsAppNumber : currentProfile.whatsAppNumber,
      websiteUrl: input.websiteUrl !== undefined ? input.websiteUrl : currentProfile.websiteUrl,
      purchaseLinks:
        input.purchaseLinks !== undefined ? input.purchaseLinks : currentProfile.purchaseLinks,
      socialLinks: input.socialLinks !== undefined ? input.socialLinks : currentProfile.socialLinks,
    };

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        bio: nextProfile.bio,
        profileImageUrl: nextProfile.profileImageUrl,
        profileImagePublicId: existing.profileImagePublicId,
        whatsAppNumber: nextProfile.whatsAppNumber,
        websiteUrl: nextProfile.websiteUrl,
        purchaseLinks: nextProfile.purchaseLinks,
        socialLinks: nextProfile.socialLinks,
        isProfileComplete: this.computeIsProfileComplete(nextProfile),
      },
      select: USER_PROFILE_SELECT,
    });

    return this.serializeUserProfile(updated);
  }

  async requestMyProfileImageUpload(
    userId: string,
    input: RequestMyProfileImageUploadBodyInput
  ): Promise<RequestMyProfileImageUploadResponse> {
    if (input.action === "authorize") {
      return this.authorizeProfileImageUpload(userId, input.mimeType as "image/jpeg" | "image/png");
    }

    return this.finalizeProfileImageUpload(userId, {
      secureUrl: input.secureUrl as string,
      publicId: input.publicId as string,
    });
  }

  async deleteMyProfileImage(userId: string): Promise<DeleteMyProfileImageResponse> {
    const existing = await this.getUserProfileOrThrow(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profileImageUrl: null,
        profileImagePublicId: null,
        isProfileComplete: this.computeIsProfileComplete({
          bio: existing.bio,
          profileImageUrl: null,
          purchaseLinks: this.parsePurchaseLinks(existing.purchaseLinks),
          socialLinks: this.parseSocialLinks(existing.socialLinks),
        }),
      },
      select: USER_PROFILE_SELECT,
    });

    await this.deleteProfileImageAssetIfPresent(this.resolveProfileImagePublicId(existing));

    return this.serializeUserProfile(updated);
  }

  async updateMyLanguage(
    userId: string,
    input: UpdateMyLanguageBodyInput
  ): Promise<UpdateMyLanguageResponse> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferredLanguage: input.preferredLanguage,
      },
      select: {
        preferredLanguage: true,
      },
    });

    return {
      preferredLanguage: updated.preferredLanguage as UpdateMyLanguageResponse["preferredLanguage"],
    };
  }

  async changeMyPassword(
    userId: string,
    input: ChangeMyPasswordBodyInput
  ): Promise<ChangeMyPasswordResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.password) {
      throw new BadRequestException("Password login is not available for this account");
    }

    const isCurrentPasswordValid = await bcrypt.compare(input.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException("New password must be different from the current password");
    }

    const hashedPassword = await bcrypt.hash(input.newPassword, PASSWORD_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        refreshToken: null,
        refreshTokenExp: null,
      },
    });

    return { success: true };
  }

  async updateMyNotificationPreferences(
    userId: string,
    input: UpdateMyNotificationPreferencesBodyInput
  ): Promise<UpdateMyNotificationPreferencesResponse> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailNotificationsEnabled: input.email,
        whatsAppNotificationsEnabled: input.whatsApp,
        inAppNotificationsEnabled: input.inApp,
      },
      select: {
        emailNotificationsEnabled: true,
        whatsAppNotificationsEnabled: true,
        inAppNotificationsEnabled: true,
      },
    });

    return {
      notificationPreferences: {
        email: updated.emailNotificationsEnabled,
        whatsApp: updated.whatsAppNotificationsEnabled,
        inApp: updated.inAppNotificationsEnabled,
      },
    };
  }

  private async getUserProfileOrThrow(userId: string): Promise<UserProfileRow> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_PROFILE_SELECT,
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user as UserProfileRow;
  }

  private serializeUserProfile(user: UserProfileRow): MyProfileResponse {
    const purchaseLinks = this.parsePurchaseLinks(user.purchaseLinks);
    const socialLinks = this.parseSocialLinks(user.socialLinks);

    return {
      bio: this.sanitizeStringWithSchema(user.bio, UserProfileBioSchema),
      profileImageUrl: this.sanitizeStringWithSchema(
        user.profileImageUrl,
        UserProfileImageUrlSchema
      ),
      whatsAppNumber: this.sanitizeStringWithSchema(user.whatsAppNumber, UserWhatsAppNumberSchema),
      websiteUrl: this.sanitizeStringWithSchema(user.websiteUrl, UserWebsiteUrlSchema),
      purchaseLinks,
      socialLinks,
      isProfileComplete: this.computeIsProfileComplete({
        bio: user.bio,
        profileImageUrl: user.profileImageUrl,
        purchaseLinks,
        socialLinks,
      }),
      preferredLanguage:
        user.preferredLanguage === "fr" || user.preferredLanguage === "es"
          ? user.preferredLanguage
          : "en",
      notificationPreferences: {
        email: user.emailNotificationsEnabled,
        whatsApp: user.whatsAppNotificationsEnabled,
        inApp: user.inAppNotificationsEnabled,
      },
    };
  }

  private parsePurchaseLinks(value: unknown): PurchaseLink[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const parsed = PurchaseLinkSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private parseSocialLinks(value: unknown): SocialLink[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const parsed = SocialLinkSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private computeIsProfileComplete(profile: {
    bio: string | null | undefined;
    profileImageUrl: string | null | undefined;
    purchaseLinks: PurchaseLink[];
    socialLinks: SocialLink[];
  }): boolean {
    const hasBio = this.sanitizeStringWithSchema(profile.bio, UserProfileBioSchema) !== null;
    const hasProfileImage =
      this.sanitizeStringWithSchema(profile.profileImageUrl, UserProfileImageUrlSchema) !== null;
    const hasPurchaseLinks = profile.purchaseLinks.length > 0;
    const hasSocialLinks = profile.socialLinks.length > 0;

    return hasBio && hasProfileImage && (hasPurchaseLinks || hasSocialLinks);
  }

  private async authorizeProfileImageUpload(
    userId: string,
    mimeType: "image/jpeg" | "image/png"
  ): Promise<AuthorizeMyProfileImageUploadResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const folder = `${PROFILE_IMAGE_FOLDER_ROOT}/${userId}`;
    const publicId = randomUUID();
    const upload = this.cloudinary.generateSignature({
      folder,
      mimeType,
      publicId,
      tags: [`user:${userId}`, "kind:profile-image"],
    });

    return {
      action: "authorize",
      upload: {
        ...upload,
        resourceType: "image",
        publicId,
      },
    };
  }

  private async finalizeProfileImageUpload(
    userId: string,
    input: {
      secureUrl: string;
      publicId: string;
    }
  ): Promise<FinalizeMyProfileImageUploadResponse> {
    const existing = await this.getUserProfileOrThrow(userId);
    const finalPublicId = this.assertAllowedProfileImageUpload({
      userId,
      secureUrl: input.secureUrl,
      publicId: input.publicId,
    });

    const purchaseLinks = this.parsePurchaseLinks(existing.purchaseLinks);
    const socialLinks = this.parseSocialLinks(existing.socialLinks);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profileImageUrl: input.secureUrl,
        profileImagePublicId: finalPublicId,
        isProfileComplete: this.computeIsProfileComplete({
          bio: existing.bio,
          profileImageUrl: input.secureUrl,
          purchaseLinks,
          socialLinks,
        }),
      },
      select: USER_PROFILE_SELECT,
    });

    const previousPublicId = this.resolveProfileImagePublicId(existing);
    if (previousPublicId && previousPublicId !== input.publicId) {
      await this.deleteProfileImageAssetIfPresent(previousPublicId);
    }

    return {
      action: "finalize",
      profile: this.serializeUserProfile(updated),
    };
  }

  private sanitizeStringWithSchema<T extends string>(
    value: string | null | undefined,
    schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }
  ): T | null {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const parsed = schema.safeParse(trimmed);
    return parsed.success ? parsed.data : null;
  }

  private assertAllowedProfileImageUpload(params: {
    userId: string;
    secureUrl: string;
    publicId: string;
  }): string {
    let parsed: URL;

    try {
      parsed = new URL(params.secureUrl);
    } catch {
      throw new BadRequestException("Profile image URL must be a valid secure Cloudinary URL");
    }

    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
      throw new BadRequestException("Profile image URL must be a valid secure Cloudinary URL");
    }

    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const expectedCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    if (expectedCloudName && pathSegments[0] !== expectedCloudName) {
      throw new BadRequestException("Profile image URL must belong to this Cloudinary account");
    }

    const extractedPublicId = this.extractCloudinaryPublicId(params.secureUrl);
    if (!extractedPublicId) {
      throw new BadRequestException("Profile image URL must be a valid secure Cloudinary URL");
    }

    if (extractedPublicId !== `${PROFILE_IMAGE_FOLDER_ROOT}/${params.userId}/${params.publicId}`) {
      throw new BadRequestException(
        "Profile image upload metadata does not match the signed asset"
      );
    }

    return extractedPublicId;
  }

  private extractCloudinaryPublicId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "res.cloudinary.com") return null;

      const pathSegments = parsed.pathname.split("/").filter(Boolean);
      const uploadIndex = pathSegments.indexOf("upload");
      if (uploadIndex < 0) return null;

      const afterUpload = pathSegments.slice(uploadIndex + 1);
      const versionIndex = afterUpload.findIndex((segment) => /^v\d+$/.test(segment));
      const assetSegments = versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload;
      if (assetSegments.length === 0) return null;

      const lastSegment = assetSegments[assetSegments.length - 1];
      assetSegments[assetSegments.length - 1] = lastSegment.replace(/\.[^.]+$/, "");
      const publicId = assetSegments.join("/");
      return publicId.length > 0 ? publicId : null;
    } catch {
      return null;
    }
  }

  private resolveProfileImagePublicId(user: {
    profileImagePublicId: string | null;
    profileImageUrl: string | null;
  }): string | null {
    const storedPublicId =
      typeof user.profileImagePublicId === "string" ? user.profileImagePublicId.trim() : "";
    if (storedPublicId.length > 0) {
      return storedPublicId;
    }

    return user.profileImageUrl ? this.extractCloudinaryPublicId(user.profileImageUrl) : null;
  }

  private async deleteProfileImageAssetIfPresent(publicId: string | null): Promise<void> {
    if (!publicId) {
      return;
    }

    try {
      await this.cloudinary.delete(publicId, "image");
    } catch (error) {
      this.logger.warn(
        `Failed to delete replaced profile image "${publicId}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
