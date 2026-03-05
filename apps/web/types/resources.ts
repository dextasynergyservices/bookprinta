export interface ResourceCategoryBrief {
  id: string;
  name: string;
  slug: string;
}

export interface ResourceCategory extends ResourceCategoryBrief {
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  articleCount: number;
}

export interface ResourcesCategoriesResponse {
  categories: ResourceCategory[];
}

export interface ResourceListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  category: ResourceCategoryBrief | null;
  publishedAt: string;
}

export interface ResourcesListResponse {
  items: ResourceListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ResourceDetail {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  category: ResourceCategoryBrief | null;
  authorName: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourcesListFilters {
  category?: string;
  limit?: number;
}
