import type {
  AuthorProfile as SharedAuthorProfile,
  PurchaseLink as SharedPurchaseLink,
  ShowcaseCategoriesResponse as SharedShowcaseCategoriesResponse,
  ShowcaseCategory as SharedShowcaseCategory,
  ShowcaseEntry as SharedShowcaseEntry,
  ShowcaseListResponse as SharedShowcaseResponse,
  ShowcaseSortOption as SharedShowcaseSortOption,
  SocialLink as SharedSocialLink,
} from "@bookprinta/shared";

export type ShowcaseEntry = SharedShowcaseEntry;

export type ShowcaseCategory = SharedShowcaseCategory;

export type AuthorProfile = SharedAuthorProfile;

export type PurchaseLink = SharedPurchaseLink;

export type SocialLink = SharedSocialLink;

export interface ShowcaseFilters {
  q: string;
  category: string;
  sort: ShowcaseSortOption;
  year: string;
}

export type ShowcaseSortOption = SharedShowcaseSortOption;

export type ShowcaseResponse = SharedShowcaseResponse;

export type ShowcaseCategoriesResponse = SharedShowcaseCategoriesResponse;
