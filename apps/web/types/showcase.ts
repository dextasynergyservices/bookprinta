export interface ShowcaseEntry {
  id: string;
  authorName: string;
  bookTitle: string;
  bookCoverUrl: string;
  aboutBook: string | null;
  testimonial: string | null;
  categoryId: string | null;
  category: ShowcaseCategory | null;
  publishedYear: number | null;
  publishedAt: string | null;
  userId: string | null;
  isFeatured: boolean;
  isProfileComplete: boolean;
}

export interface ShowcaseCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
}

export interface AuthorProfile {
  bio: string | null;
  profileImageUrl: string | null;
  whatsAppNumber: string | null;
  websiteUrl: string | null;
  purchaseLinks: PurchaseLink[] | null;
  socialLinks: SocialLink[] | null;
}

export interface PurchaseLink {
  label: string;
  url: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface ShowcaseFilters {
  q: string;
  category: string;
  sort: ShowcaseSortOption;
  year: string;
}

export type ShowcaseSortOption = "date_desc" | "date_asc" | "title_asc" | "title_desc";

export interface ShowcaseResponse {
  items: ShowcaseEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ShowcaseCategoriesResponse {
  categories: ShowcaseCategory[];
}
