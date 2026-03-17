import { randomUUID } from "node:crypto";
import type {
  AdminDeleteUserResponse,
  AdminUpdateUserInput,
  AdminUpdateUserResponse,
  AdminUserDetail,
  AdminUsersListQuery,
  AdminUsersListResponse,
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

const ADMIN_USER_SORTABLE_FIELDS = [
  "fullName",
  "email",
  "role",
  "isVerified",
  "createdAt",
] as const satisfies readonly AdminUsersListQuery["sortBy"][];

const ADMIN_USER_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isVerified: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const ADMIN_USER_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  role: true,
  isVerified: true,
  isActive: true,
  preferredLanguage: true,
  bio: true,
  profileImageUrl: true,
  whatsAppNumber: true,
  websiteUrl: true,
  purchaseLinks: true,
  socialLinks: true,
  isProfileComplete: true,
  emailNotificationsEnabled: true,
  whatsAppNotificationsEnabled: true,
  inAppNotificationsEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const ADMIN_USER_STATE_SELECT = {
  id: true,
  role: true,
  isVerified: true,
  isActive: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const ADMIN_USER_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  orderType: true,
  status: true,
  totalAmount: true,
  currency: true,
  createdAt: true,
  package: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  book: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.OrderSelect;

const ADMIN_USER_BOOK_SELECT = {
  id: true,
  title: true,
  status: true,
  productionStatus: true,
  orderId: true,
  createdAt: true,
  updatedAt: true,
  order: {
    select: {
      orderNumber: true,
    },
  },
} satisfies Prisma.BookSelect;

const ADMIN_USER_PAYMENT_SELECT = {
  id: true,
  orderId: true,
  provider: true,
  type: true,
  status: true,
  amount: true,
  currency: true,
  providerRef: true,
  receiptUrl: true,
  approvedAt: true,
  processedAt: true,
  createdAt: true,
  updatedAt: true,
  order: {
    select: {
      orderNumber: true,
    },
  },
} satisfies Prisma.PaymentSelect;

type AdminUserListRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_LIST_SELECT }>;
type AdminUserProfileRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_PROFILE_SELECT }>;
type AdminUserOrderRow = Prisma.OrderGetPayload<{ select: typeof ADMIN_USER_ORDER_SELECT }>;
type AdminUserBookRow = Prisma.BookGetPayload<{ select: typeof ADMIN_USER_BOOK_SELECT }>;
type AdminUserPaymentRow = Prisma.PaymentGetPayload<{ select: typeof ADMIN_USER_PAYMENT_SELECT }>;

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

  async findAdminUsers(query: AdminUsersListQuery): Promise<AdminUsersListResponse> {
    const where = this.buildAdminUsersWhere(query);
    const orderBy = this.buildAdminUsersOrderBy(query.sortBy, query.sortDirection);

    const rows = await this.prisma.user.findMany({
      where,
      orderBy,
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: ADMIN_USER_LIST_SELECT,
    });
    const totalItems = await this.prisma.user.count({ where });

    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => this.serializeAdminUserListItem(row)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
      totalItems,
      limit: query.limit,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      sortableFields: [...ADMIN_USER_SORTABLE_FIELDS],
    };
  }

  async findAdminUserById(userId: string): Promise<AdminUserDetail> {
    const [user, orders, books, payments] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: ADMIN_USER_PROFILE_SELECT,
      }),
      this.prisma.order.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: ADMIN_USER_ORDER_SELECT,
      }),
      this.prisma.book.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: ADMIN_USER_BOOK_SELECT,
      }),
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: ADMIN_USER_PAYMENT_SELECT,
      }),
    ]);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      profile: this.serializeAdminUserProfile(user),
      orders: orders.map((order) => this.serializeAdminUserOrderSummary(order)),
      books: books.map((book) => this.serializeAdminUserBookSummary(book)),
      payments: payments.map((payment) => this.serializeAdminUserPaymentSummary(payment)),
    };
  }

  async updateAdminUser(
    userId: string,
    input: AdminUpdateUserInput,
    adminId: string
  ): Promise<AdminUpdateUserResponse> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ADMIN_USER_STATE_SELECT,
    });

    if (!current) {
      throw new NotFoundException("User not found");
    }

    const nextState: AdminUpdateUserResponse["currentState"] = {
      role: input.role ?? current.role,
      isVerified: input.isVerified ?? current.isVerified,
      isActive: input.isActive ?? current.isActive,
    };
    const previousState: AdminUpdateUserResponse["previousState"] = {
      role: current.role,
      isVerified: current.isVerified,
      isActive: current.isActive,
    };
    const changedFields = (
      [
        previousState.role !== nextState.role ? "role" : null,
        previousState.isVerified !== nextState.isVerified ? "isVerified" : null,
        previousState.isActive !== nextState.isActive ? "isActive" : null,
      ] as const
    ).filter((field): field is keyof AdminUpdateUserResponse["currentState"] => field !== null);

    if (changedFields.length === 0) {
      throw new BadRequestException("No user changes detected.");
    }

    const action = this.resolveAdminUserAuditAction(previousState, nextState);

    const { updatedUser, audit } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isVerified !== undefined ? { isVerified: input.isVerified } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(previousState.isActive && nextState.isActive === false
            ? {
                refreshToken: null,
                refreshTokenExp: null,
              }
            : {}),
        },
        select: ADMIN_USER_STATE_SELECT,
      });

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action,
          entityType: "USER",
          entityId: userId,
          details: {
            changedFields,
            previousState,
            currentState: {
              role: updated.role,
              isVerified: updated.isVerified,
              isActive: updated.isActive,
            },
            previousValues: previousState,
            nextValues: {
              role: updated.role,
              isVerified: updated.isVerified,
              isActive: updated.isActive,
            },
            note: null,
            reason: null,
          },
        },
      });

      return {
        updatedUser: updated,
        audit: auditLog,
      };
    });

    return {
      userId: updatedUser.id,
      previousState,
      currentState: {
        role: updatedUser.role,
        isVerified: updatedUser.isVerified,
        isActive: updatedUser.isActive,
      },
      updatedAt: updatedUser.updatedAt.toISOString(),
      audit: this.serializeAdminAuditEntry(audit, adminId),
    };
  }

  async deleteAdminUser(userId: string, adminId: string): Promise<AdminDeleteUserResponse> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ADMIN_USER_STATE_SELECT,
    });

    if (!current) {
      throw new NotFoundException("User not found");
    }

    if (!current.isActive) {
      throw new BadRequestException("User is already inactive.");
    }

    const { updatedUser, audit } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          refreshToken: null,
          refreshTokenExp: null,
        },
        select: ADMIN_USER_STATE_SELECT,
      });

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_USER_DELETED",
          entityType: "USER",
          entityId: userId,
          details: {
            changedFields: ["isActive"],
            previousState: {
              role: current.role,
              isVerified: current.isVerified,
              isActive: current.isActive,
            },
            currentState: {
              role: updated.role,
              isVerified: updated.isVerified,
              isActive: updated.isActive,
            },
            previousValues: {
              isActive: current.isActive,
            },
            nextValues: {
              isActive: updated.isActive,
            },
            note: "Soft delete via admin users panel",
            reason: "ADMIN_REQUESTED_DELETE",
          },
        },
      });

      return {
        updatedUser: updated,
        audit: auditLog,
      };
    });

    return {
      userId: updatedUser.id,
      deleted: true,
      isActive: false,
      deletedAt: updatedUser.updatedAt.toISOString(),
      audit: this.serializeAdminAuditEntry(audit, adminId),
    };
  }

  async reactivateAdminUser(userId: string, adminId: string): Promise<AdminUpdateUserResponse> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ADMIN_USER_STATE_SELECT,
    });

    if (!current) {
      throw new NotFoundException("User not found");
    }

    if (current.isActive) {
      throw new BadRequestException("User is already active.");
    }

    return this.updateAdminUser(
      userId,
      {
        isActive: true,
      },
      adminId
    );
  }

  private buildAdminUsersWhere(query: AdminUsersListQuery): Prisma.UserWhereInput {
    // Admin users table is active-only by default; deleted users remain in DB/audit history.
    const filters: Prisma.UserWhereInput[] = [{ isActive: true }];

    if (query.role) {
      filters.push({ role: query.role });
    }

    if (typeof query.isVerified === "boolean") {
      filters.push({ isVerified: query.isVerified });
    }

    const searchWhere = this.buildAdminUserSearchWhere(query.q);
    if (searchWhere) {
      filters.push(searchWhere);
    }

    if (filters.length === 1) {
      return filters[0] ?? {};
    }

    return {
      AND: filters,
    };
  }

  private buildAdminUserSearchWhere(q: string | undefined): Prisma.UserWhereInput | null {
    const normalized = q?.trim();
    if (!normalized) {
      return null;
    }

    const terms = normalized.split(/\s+/).filter((term) => term.length > 0);
    const orFilters: Prisma.UserWhereInput[] = [
      { email: { contains: normalized, mode: "insensitive" } },
      { firstName: { contains: normalized, mode: "insensitive" } },
      { lastName: { contains: normalized, mode: "insensitive" } },
    ];

    if (terms.length > 1) {
      orFilters.push({
        AND: terms.map((term) => ({
          OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
          ],
        })),
      });
    }

    return {
      OR: orFilters,
    };
  }

  private buildAdminUsersOrderBy(
    sortBy: AdminUsersListQuery["sortBy"],
    sortDirection: AdminUsersListQuery["sortDirection"]
  ): Prisma.UserOrderByWithRelationInput[] {
    const direction = sortDirection;

    switch (sortBy) {
      case "fullName":
        return [{ firstName: direction }, { lastName: direction }, { id: direction }];
      case "email":
        return [{ email: direction }, { id: direction }];
      case "role":
        return [{ role: direction }, { id: direction }];
      case "isVerified":
        return [{ isVerified: direction }, { id: direction }];
      default:
        return [{ createdAt: direction }, { id: direction }];
    }
  }

  private serializeAdminUserListItem(
    row: AdminUserListRow
  ): AdminUsersListResponse["items"][number] {
    return {
      id: row.id,
      fullName: this.buildUserFullName(row.firstName, row.lastName, row.email),
      email: row.email,
      role: row.role,
      isVerified: row.isVerified,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      detailUrl: `/admin/users/${row.id}`,
    };
  }

  private serializeAdminUserProfile(row: AdminUserProfileRow): AdminUserDetail["profile"] {
    const purchaseLinks = this.parsePurchaseLinks(row.purchaseLinks);
    const socialLinks = this.parseSocialLinks(row.socialLinks);

    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName: this.buildUserFullName(row.firstName, row.lastName, row.email),
      email: row.email,
      phoneNumber: row.phoneNumber?.trim() || null,
      role: row.role,
      isVerified: row.isVerified,
      isActive: row.isActive,
      preferredLanguage: this.normalizePreferredLanguage(row.preferredLanguage),
      bio: this.sanitizeStringWithSchema(row.bio, UserProfileBioSchema),
      profileImageUrl: this.sanitizeStringWithSchema(
        row.profileImageUrl,
        UserProfileImageUrlSchema
      ),
      whatsAppNumber: this.sanitizeStringWithSchema(row.whatsAppNumber, UserWhatsAppNumberSchema),
      websiteUrl: this.sanitizeStringWithSchema(row.websiteUrl, UserWebsiteUrlSchema),
      purchaseLinks,
      socialLinks,
      isProfileComplete: row.isProfileComplete,
      notificationPreferences: {
        email: row.emailNotificationsEnabled,
        whatsApp: row.whatsAppNotificationsEnabled,
        inApp: row.inAppNotificationsEnabled,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeAdminUserOrderSummary(
    row: AdminUserOrderRow
  ): AdminUserDetail["orders"][number] {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      orderStatus: row.status,
      bookStatus: row.book?.status ?? null,
      package: {
        id: row.package.id,
        name: row.package.name,
        slug: row.package.slug,
      },
      totalAmount: this.toNumber(row.totalAmount),
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
      detailUrl: `/admin/orders/${row.id}`,
    };
  }

  private serializeAdminUserBookSummary(row: AdminUserBookRow): AdminUserDetail["books"][number] {
    return {
      id: row.id,
      title: row.title?.trim() || null,
      status: row.status,
      productionStatus: row.productionStatus ?? null,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      detailUrl: `/admin/books/${row.id}`,
      orderDetailUrl: `/admin/orders/${row.orderId}`,
    };
  }

  private serializeAdminUserPaymentSummary(
    row: AdminUserPaymentRow
  ): AdminUserDetail["payments"][number] {
    return {
      id: row.id,
      orderId: row.orderId ?? null,
      orderNumber: row.order?.orderNumber ?? null,
      provider: row.provider,
      type: row.type,
      status: row.status,
      amount: this.toNumber(row.amount),
      currency: row.currency,
      providerRef: row.providerRef ?? null,
      receiptUrl: row.receiptUrl ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      processedAt: row.processedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      orderDetailUrl: row.orderId ? `/admin/orders/${row.orderId}` : null,
    };
  }

  private resolveAdminUserAuditAction(
    previousState: AdminUpdateUserResponse["previousState"],
    currentState: AdminUpdateUserResponse["currentState"]
  ): string {
    if (previousState.isActive && !currentState.isActive) {
      return "ADMIN_USER_DEACTIVATED";
    }

    if (!previousState.isActive && currentState.isActive) {
      return "ADMIN_USER_REACTIVATED";
    }

    if (previousState.role !== currentState.role) {
      return "ADMIN_USER_ROLE_UPDATED";
    }

    if (previousState.isVerified !== currentState.isVerified) {
      return "ADMIN_USER_VERIFICATION_UPDATED";
    }

    return "ADMIN_USER_UPDATED";
  }

  private serializeAdminAuditEntry(
    row: Pick<
      Prisma.AuditLogGetPayload<object>,
      "id" | "action" | "entityType" | "entityId" | "details" | "createdAt"
    >,
    recordedBy: string
  ): AdminUpdateUserResponse["audit"] {
    const details = this.toRecord(row.details);

    return {
      auditId: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      recordedAt: row.createdAt.toISOString(),
      recordedBy,
      note: this.toStringValue(details?.note) ?? null,
      reason: this.toStringValue(details?.reason) ?? null,
    };
  }

  private buildUserFullName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
    email: string
  ): string {
    const fullName = [firstName, lastName]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
      .join(" ")
      .trim();

    return fullName.length > 0 ? fullName : email.trim();
  }

  private normalizePreferredLanguage(value: string | null | undefined): "en" | "fr" | "es" {
    return value === "fr" || value === "es" ? value : "en";
  }

  private toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value);
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private toStringValue(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
