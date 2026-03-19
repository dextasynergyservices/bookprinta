import { randomUUID } from "node:crypto";
import type {
  AdminAuthorizeShowcaseCoverUploadBodyInput,
  AdminAuthorizeShowcaseCoverUploadResponse,
  AdminFinalizeShowcaseCoverUploadBodyInput,
  AdminShowcaseCoverUploadBodyInput,
  AdminShowcaseCoverUploadMimeType,
  AdminShowcaseCoverUploadResponse,
} from "@bookprinta/shared";
import {
  AdminAuthorizeShowcaseCoverUploadBodySchema,
  AdminFinalizeShowcaseCoverUploadBodySchema,
} from "@bookprinta/shared";
import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { AdminShowcaseService } from "./admin-showcase.service.js";

const ADMIN_SHOWCASE_COVER_UPLOAD_FOLDER_ROOT = "bookprinta/showcase/covers";
const ALLOWED_SHOWCASE_COVER_MIME_TYPES: readonly AdminShowcaseCoverUploadMimeType[] = [
  "image/jpeg",
  "image/png",
];

@Injectable()
export class AdminShowcaseUploadService {
  constructor(
    private readonly adminShowcaseService: AdminShowcaseService,
    @Optional() private readonly cloudinary?: CloudinaryService
  ) {}

  async requestAdminShowcaseCoverUpload(
    input: AdminShowcaseCoverUploadBodyInput,
    adminId: string
  ): Promise<AdminShowcaseCoverUploadResponse> {
    if (input.action === "authorize") {
      const authorizeInput = AdminAuthorizeShowcaseCoverUploadBodySchema.parse(input);
      return this.authorizeAdminShowcaseCoverUpload(authorizeInput, adminId);
    }

    const finalizeInput = AdminFinalizeShowcaseCoverUploadBodySchema.parse(input);
    return this.finalizeAdminShowcaseCoverUpload(finalizeInput);
  }

  private authorizeAdminShowcaseCoverUpload(
    input: AdminAuthorizeShowcaseCoverUploadBodyInput,
    adminId: string
  ): AdminAuthorizeShowcaseCoverUploadResponse {
    const cloudinary = this.getCloudinaryService();

    if (!ALLOWED_SHOWCASE_COVER_MIME_TYPES.includes(input.mimeType)) {
      throw new BadRequestException("Cover images must be JPEG or PNG files.");
    }

    if (input.fileSize <= 0) {
      throw new BadRequestException("Cover image size must be greater than 0 bytes.");
    }

    if (input.fileName.trim().length === 0) {
      throw new BadRequestException("Cover image file name is required.");
    }

    const publicId = `cover-${adminId}-${randomUUID().replace(/-/g, "")}`;
    const folder = this.buildAdminShowcaseCoverUploadFolder();
    const upload = cloudinary.generateSignature({
      folder,
      mimeType: input.mimeType,
      publicId,
      tags: ["bookprinta", "source:admin-showcase-cover", `admin:${adminId}`],
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

  private async finalizeAdminShowcaseCoverUpload(
    input: AdminFinalizeShowcaseCoverUploadBodyInput
  ): Promise<AdminShowcaseCoverUploadResponse> {
    this.assertAllowedShowcaseCoverUpload({
      secureUrl: input.secureUrl,
      publicId: input.publicId,
    });

    if (!input.entryId) {
      return {
        action: "finalize",
        secureUrl: input.secureUrl,
        publicId: input.publicId,
      };
    }

    const entry = await this.adminShowcaseService.setEntryCoverFromUpload(
      input.entryId,
      input.secureUrl
    );

    return {
      action: "finalize",
      secureUrl: input.secureUrl,
      publicId: input.publicId,
      entry,
    };
  }

  private getCloudinaryService(): CloudinaryService {
    if (!this.cloudinary) {
      throw new ServiceUnavailableException("Cloudinary upload service is unavailable.");
    }

    return this.cloudinary;
  }

  private assertAllowedShowcaseCoverUpload(params: {
    secureUrl: string;
    publicId: string;
  }): string {
    let parsed: URL;

    try {
      parsed = new URL(params.secureUrl);
    } catch {
      throw new BadRequestException("Cover image URL must be a valid secure Cloudinary URL");
    }

    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
      throw new BadRequestException("Cover image URL must be a valid secure Cloudinary URL");
    }

    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const expectedCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    if (expectedCloudName && pathSegments[0] !== expectedCloudName) {
      throw new BadRequestException("Cover image URL must belong to this Cloudinary account");
    }

    const extractedPublicId = this.extractCloudinaryPublicId(params.secureUrl);
    if (!extractedPublicId) {
      throw new BadRequestException("Cover image URL must be a valid secure Cloudinary URL");
    }

    const expectedPublicId = `${this.buildAdminShowcaseCoverUploadFolder()}/${params.publicId}`;
    if (extractedPublicId !== expectedPublicId) {
      throw new BadRequestException("Cover image upload metadata does not match the signed asset");
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

  private buildAdminShowcaseCoverUploadFolder(): string {
    return ADMIN_SHOWCASE_COVER_UPLOAD_FOLDER_ROOT;
  }
}
