import type {
  AdminCreateShowcaseCategoryInput,
  AdminCreateShowcaseEntryInput,
  AdminDeleteShowcaseCategoryResponse,
  AdminDeleteShowcaseEntryResponse,
  AdminShowcaseCategoriesListResponse,
  AdminShowcaseCategory,
  AdminShowcaseCoverUploadBodyInput,
  AdminShowcaseCoverUploadResponse,
  AdminShowcaseEntriesListQuery,
  AdminShowcaseEntriesListResponse,
  AdminShowcaseEntry,
  AdminShowcaseUserSearchQuery,
  AdminShowcaseUserSearchResponse,
  AdminUpdateShowcaseCategoryInput,
  AdminUpdateShowcaseEntryInput,
  AuthorProfileResponse,
  ShowcaseCategoriesResponse,
  ShowcaseListQuery,
  ShowcaseListResponse,
} from "@bookprinta/shared";
import { Injectable, Optional } from "@nestjs/common";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AdminShowcaseService } from "./admin-showcase.service.js";
import { AdminShowcaseUploadService } from "./admin-showcase-upload.service.js";
import { PublicShowcaseService } from "./public-showcase.service.js";

/**
 * Backward-compatible facade retained to avoid breaking existing imports/tests
 * while controllers now depend on dedicated services.
 */
@Injectable()
export class ShowcaseService {
  private readonly publicService: PublicShowcaseService;
  private readonly adminService: AdminShowcaseService;
  private readonly uploadService: AdminShowcaseUploadService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cloudinary?: CloudinaryService,
    @Optional() publicShowcaseService?: PublicShowcaseService,
    @Optional() adminShowcaseService?: AdminShowcaseService,
    @Optional() adminShowcaseUploadService?: AdminShowcaseUploadService
  ) {
    this.publicService = publicShowcaseService ?? new PublicShowcaseService(this.prisma);
    this.adminService = adminShowcaseService ?? new AdminShowcaseService(this.prisma);
    this.uploadService =
      adminShowcaseUploadService ??
      new AdminShowcaseUploadService(this.adminService, this.cloudinary);
  }

  requestAdminShowcaseCoverUpload(
    input: AdminShowcaseCoverUploadBodyInput,
    adminId: string
  ): Promise<AdminShowcaseCoverUploadResponse> {
    return this.uploadService.requestAdminShowcaseCoverUpload(input, adminId);
  }

  searchAdminShowcaseUsers(
    query: AdminShowcaseUserSearchQuery
  ): Promise<AdminShowcaseUserSearchResponse> {
    return this.adminService.searchAdminShowcaseUsers(query);
  }

  listAdminShowcaseEntries(
    query: AdminShowcaseEntriesListQuery
  ): Promise<AdminShowcaseEntriesListResponse> {
    return this.adminService.listAdminShowcaseEntries(query);
  }

  createAdminShowcaseEntry(input: AdminCreateShowcaseEntryInput): Promise<AdminShowcaseEntry> {
    return this.adminService.createAdminShowcaseEntry(input);
  }

  updateAdminShowcaseEntry(
    id: string,
    input: AdminUpdateShowcaseEntryInput
  ): Promise<AdminShowcaseEntry> {
    return this.adminService.updateAdminShowcaseEntry(id, input);
  }

  deleteAdminShowcaseEntry(id: string): Promise<AdminDeleteShowcaseEntryResponse> {
    return this.adminService.deleteAdminShowcaseEntry(id);
  }

  listAdminShowcaseCategories(): Promise<AdminShowcaseCategoriesListResponse> {
    return this.adminService.listAdminShowcaseCategories();
  }

  createAdminShowcaseCategory(
    input: AdminCreateShowcaseCategoryInput
  ): Promise<AdminShowcaseCategory> {
    return this.adminService.createAdminShowcaseCategory(input);
  }

  updateAdminShowcaseCategory(
    id: string,
    input: AdminUpdateShowcaseCategoryInput
  ): Promise<AdminShowcaseCategory> {
    return this.adminService.updateAdminShowcaseCategory(id, input);
  }

  deleteAdminShowcaseCategory(id: string): Promise<AdminDeleteShowcaseCategoryResponse> {
    return this.adminService.deleteAdminShowcaseCategory(id);
  }

  listCategories(): Promise<ShowcaseCategoriesResponse> {
    return this.publicService.listCategories();
  }

  listPublic(query: ShowcaseListQuery): Promise<ShowcaseListResponse> {
    return this.publicService.listPublic(query);
  }

  getAuthorProfile(showcaseId: string): Promise<AuthorProfileResponse> {
    return this.publicService.getAuthorProfile(showcaseId);
  }
}
