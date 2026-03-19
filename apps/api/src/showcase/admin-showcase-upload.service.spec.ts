/// <reference types="jest" />
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import type { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { AdminShowcaseUploadService } from "./admin-showcase-upload.service.js";

describe("AdminShowcaseUploadService", () => {
  const originalCloudName = process.env.CLOUDINARY_CLOUD_NAME;

  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.CLOUDINARY_CLOUD_NAME = originalCloudName;
  });

  it("authorizes upload with signed payload", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn(),
    };

    const cloudinary = {
      generateSignature: jest.fn().mockReturnValue({
        signature: "signed",
        timestamp: 123456,
        cloudName: "demo",
        apiKey: "key",
        folder: "bookprinta/showcase/covers",
      }),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      cloudinary as unknown as CloudinaryService
    );

    const response = await service.requestAdminShowcaseCoverUpload(
      {
        action: "authorize",
        fileName: "cover.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
      },
      "admin_1"
    );

    expect(response.action).toBe("authorize");
    expect(response.upload).toMatchObject({
      resourceType: "image",
      folder: "bookprinta/showcase/covers",
    });
    expect(cloudinary.generateSignature).toHaveBeenCalled();
  });

  it("finalizes without entry binding when entryId is missing", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn(),
    };

    const cloudinary = {
      generateSignature: jest.fn(),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      cloudinary as unknown as CloudinaryService
    );

    await expect(
      service.requestAdminShowcaseCoverUpload(
        {
          action: "finalize",
          secureUrl:
            "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/covers/cover-admin_1-abc.jpg",
          publicId: "cover-admin_1-abc",
        },
        "admin_1"
      )
    ).resolves.toEqual({
      action: "finalize",
      secureUrl:
        "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/covers/cover-admin_1-abc.jpg",
      publicId: "cover-admin_1-abc",
    });

    expect(adminShowcaseService.setEntryCoverFromUpload).not.toHaveBeenCalled();
  });

  it("finalizes and persists cover when entryId is provided", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn().mockResolvedValue({
        id: "cm_show_1",
        authorName: "A. Author",
        bookTitle: "Stories",
        bookCoverUrl:
          "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/covers/cover-admin_1-abc.jpg",
        aboutBook: null,
        testimonial: null,
        categoryId: null,
        category: null,
        publishedYear: null,
        publishedAt: null,
        userId: null,
        user: null,
        bookId: null,
        isFeatured: false,
        sortOrder: 0,
        previewPath: "/showcase?entry=cm_show_1",
        createdAt: new Date("2026-03-18T00:00:00.000Z").toISOString(),
      }),
    };

    const cloudinary = {
      generateSignature: jest.fn(),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      cloudinary as unknown as CloudinaryService
    );

    const response = await service.requestAdminShowcaseCoverUpload(
      {
        action: "finalize",
        secureUrl:
          "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/covers/cover-admin_1-abc.jpg",
        publicId: "cover-admin_1-abc",
        entryId: "cm_show_1",
      },
      "admin_1"
    );

    expect(response.action).toBe("finalize");
    expect(response.entry).toBeDefined();
    expect(adminShowcaseService.setEntryCoverFromUpload).toHaveBeenCalledWith(
      "cm_show_1",
      "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/covers/cover-admin_1-abc.jpg"
    );
  });

  it("rejects invalid Cloudinary URL metadata", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn(),
    };

    const cloudinary = {
      generateSignature: jest.fn(),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      cloudinary as unknown as CloudinaryService
    );

    await expect(
      service.requestAdminShowcaseCoverUpload(
        {
          action: "finalize",
          secureUrl: "https://example.com/not-cloudinary.jpg",
          publicId: "cover-admin_1-abc",
        },
        "admin_1"
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when Cloudinary service is unavailable", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn(),
    };

    const service = new AdminShowcaseUploadService(adminShowcaseService as never, undefined);

    await expect(
      service.requestAdminShowcaseCoverUpload(
        {
          action: "authorize",
          fileName: "cover.jpg",
          fileSize: 1024,
          mimeType: "image/jpeg",
        },
        "admin_1"
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
