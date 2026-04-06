import type {
  AdminShowcaseCategory,
  AdminShowcaseEntry,
  AdminShowcaseFallbackAuthorProfile,
  AdminShowcaseLinkedUser,
  AuthorProfileResponse,
  PurchaseLink,
  ShowcaseCategory,
  SocialLink,
} from "@bookprinta/shared";
import { PurchaseLinkSchema, SocialLinkSchema } from "@bookprinta/shared";

export type ShowcaseCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type AdminShowcaseCategoryRow = ShowcaseCategoryRow & {
  createdAt: Date;
  updatedAt: Date;
  _count: {
    showcases: number;
  };
};

export type ShowcaseFallbackAuthorProfileRow = {
  authorBio: string | null;
  authorProfileImageUrl: string | null;
  authorWhatsAppNumber: string | null;
  authorWebsiteUrl: string | null;
  authorPurchaseLinks: unknown;
  authorSocialLinks: unknown;
};

export type ShowcaseListRow = {
  id: string;
  authorName: string;
  bookTitle: string;
  bookCoverUrl: string;
  aboutBook: string | null;
  testimonial: string | null;
  categoryId: string | null;
  category: ShowcaseCategoryRow | null;
  publishedYear: number | null;
  publishedAt: Date | null;
  userId: string | null;
  isFeatured: boolean;
  sortOrder: number;
  user: AuthorProfileUserRow | null;
} & ShowcaseFallbackAuthorProfileRow;

export type AdminShowcaseEntryRow = {
  id: string;
  authorName: string;
  bookTitle: string;
  bookCoverUrl: string;
  aboutBook: string | null;
  testimonial: string | null;
  categoryId: string | null;
  category: ShowcaseCategoryRow | null;
  publishedYear: number | null;
  publishedAt: Date | null;
  userId: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string;
    isProfileComplete: boolean;
  } | null;
  bookId: string | null;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: Date;
} & ShowcaseFallbackAuthorProfileRow;

type RawAuthorProfileFields = {
  bio: string | null;
  profileImageUrl: string | null;
  whatsAppNumber: string | null;
  websiteUrl: string | null;
  purchaseLinks: unknown;
  socialLinks: unknown;
};

export type AuthorProfileUserRow = RawAuthorProfileFields & {
  isProfileComplete: boolean;
};

export type ShowcaseUserSearchRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  isProfileComplete: boolean;
};

export const showcaseCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  sortOrder: true,
  isActive: true,
} as const;

export const adminShowcaseCategorySelect = {
  ...showcaseCategorySelect,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      showcases: true,
    },
  },
} as const;

export const adminShowcaseLinkedUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  isProfileComplete: true,
} as const;

export const showcaseFallbackAuthorProfileSelect = {
  authorBio: true,
  authorProfileImageUrl: true,
  authorWhatsAppNumber: true,
  authorWebsiteUrl: true,
  authorPurchaseLinks: true,
  authorSocialLinks: true,
} as const;

export const authorProfileUserSelect = {
  bio: true,
  profileImageUrl: true,
  whatsAppNumber: true,
  websiteUrl: true,
  purchaseLinks: true,
  socialLinks: true,
  isProfileComplete: true,
} as const;

export const adminShowcaseEntrySelect = {
  id: true,
  authorName: true,
  bookTitle: true,
  bookCoverUrl: true,
  aboutBook: true,
  testimonial: true,
  categoryId: true,
  category: {
    select: showcaseCategorySelect,
  },
  publishedYear: true,
  publishedAt: true,
  userId: true,
  user: {
    select: adminShowcaseLinkedUserSelect,
  },
  bookId: true,
  isFeatured: true,
  sortOrder: true,
  createdAt: true,
  ...showcaseFallbackAuthorProfileSelect,
} as const;

export const showcasePublicEntrySelect = {
  id: true,
  authorName: true,
  bookTitle: true,
  bookCoverUrl: true,
  aboutBook: true,
  testimonial: true,
  categoryId: true,
  category: {
    select: showcaseCategorySelect,
  },
  publishedYear: true,
  publishedAt: true,
  userId: true,
  isFeatured: true,
  sortOrder: true,
  ...showcaseFallbackAuthorProfileSelect,
  user: {
    select: authorProfileUserSelect,
  },
} as const;

export function serializeCategory(category: ShowcaseCategoryRow): ShowcaseCategory {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    sortOrder: category.sortOrder,
  };
}

export function serializeAdminCategory(category: AdminShowcaseCategoryRow): AdminShowcaseCategory {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    showcaseCount: category._count.showcases,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export function serializeAdminLinkedUser(
  row: AdminShowcaseEntryRow["user"]
): AdminShowcaseLinkedUser | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.lastName ? `${row.firstName} ${row.lastName}` : row.firstName,
    email: row.email,
    profileComplete: row.isProfileComplete,
  };
}

export function serializeAdminSearchUser(row: ShowcaseUserSearchRow): AdminShowcaseLinkedUser {
  const displayName = row.lastName ? `${row.firstName} ${row.lastName}` : row.firstName;

  return {
    id: row.id,
    displayName,
    email: row.email,
    profileComplete: row.isProfileComplete,
  };
}

export function serializeAdminShowcaseEntry(row: AdminShowcaseEntryRow): AdminShowcaseEntry {
  return {
    id: row.id,
    authorName: row.authorName,
    bookTitle: row.bookTitle,
    bookCoverUrl: row.bookCoverUrl,
    aboutBook: row.aboutBook,
    testimonial: row.testimonial,
    categoryId: row.categoryId,
    category: row.category ? serializeCategory(row.category) : null,
    publishedYear: row.publishedYear,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    userId: row.userId,
    user: serializeAdminLinkedUser(row.user),
    bookId: row.bookId,
    isFeatured: row.isFeatured,
    sortOrder: row.sortOrder,
    fallbackAuthorProfile: serializeAdminShowcaseFallbackAuthorProfile(row),
    previewPath: `/showcase?entry=${row.id}`,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeShowcaseEntry(row: ShowcaseListRow) {
  const resolvedAuthorProfile = resolveShowcaseAuthorProfile({
    user: row.user,
    fallback: row,
  });

  return {
    id: row.id,
    authorName: row.authorName,
    bookTitle: row.bookTitle,
    bookCoverUrl: row.bookCoverUrl,
    aboutBook: row.aboutBook,
    testimonial: row.testimonial,
    categoryId: row.categoryId,
    category: row.category?.isActive ? serializeCategory(row.category) : null,
    publishedYear: row.publishedYear,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    userId: row.userId,
    isFeatured: row.isFeatured,
    hasAuthorProfile: hasAuthorProfileDetails(resolvedAuthorProfile),
    isProfileComplete: row.user?.isProfileComplete ?? false,
  };
}

function parsePurchaseLinks(value: unknown): PurchaseLink[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const parsed = PurchaseLinkSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const parsed = SocialLinkSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function serializePublicAuthorProfile(value: RawAuthorProfileFields): AuthorProfileResponse {
  const purchaseLinks = parsePurchaseLinks(value.purchaseLinks);
  const socialLinks = parseSocialLinks(value.socialLinks);

  return {
    ...(value.bio ? { bio: value.bio } : {}),
    ...(value.profileImageUrl ? { profileImageUrl: value.profileImageUrl } : {}),
    ...(value.whatsAppNumber ? { whatsAppNumber: value.whatsAppNumber } : {}),
    ...(value.websiteUrl ? { websiteUrl: value.websiteUrl } : {}),
    ...(purchaseLinks.length > 0 ? { purchaseLinks } : {}),
    ...(socialLinks.length > 0 ? { socialLinks } : {}),
  };
}

function toFallbackAuthorProfileFields(
  row: ShowcaseFallbackAuthorProfileRow | null | undefined
): RawAuthorProfileFields {
  return {
    bio: row?.authorBio ?? null,
    profileImageUrl: row?.authorProfileImageUrl ?? null,
    whatsAppNumber: row?.authorWhatsAppNumber ?? null,
    websiteUrl: row?.authorWebsiteUrl ?? null,
    purchaseLinks: row?.authorPurchaseLinks ?? [],
    socialLinks: row?.authorSocialLinks ?? [],
  };
}

export function resolveShowcaseAuthorProfile(params: {
  user: RawAuthorProfileFields | null | undefined;
  fallback: ShowcaseFallbackAuthorProfileRow | null | undefined;
}): AuthorProfileResponse {
  const fallbackProfile = serializePublicAuthorProfile(
    toFallbackAuthorProfileFields(params.fallback)
  );
  const userProfile = params.user ? serializePublicAuthorProfile(params.user) : {};

  return {
    ...fallbackProfile,
    ...userProfile,
  };
}

export function hasAuthorProfileDetails(profile: AuthorProfileResponse): boolean {
  return Object.keys(profile).length > 0;
}

export function serializeAdminShowcaseFallbackAuthorProfile(
  row: ShowcaseFallbackAuthorProfileRow
): AdminShowcaseFallbackAuthorProfile {
  return {
    bio: row.authorBio ?? null,
    profileImageUrl: row.authorProfileImageUrl ?? null,
    whatsAppNumber: row.authorWhatsAppNumber ?? null,
    websiteUrl: row.authorWebsiteUrl ?? null,
    purchaseLinks: parsePurchaseLinks(row.authorPurchaseLinks),
    socialLinks: parseSocialLinks(row.authorSocialLinks),
  };
}

export function serializeAuthorProfile(user: AuthorProfileUserRow): AuthorProfileResponse {
  return resolveShowcaseAuthorProfile({ user, fallback: null });
}
