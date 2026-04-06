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
      isWithinSizeLimit: jest.fn().mockReturnValue(true),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      cloudinary as unknown as CloudinaryService
    );

    const response = await service.requestAdminShowcaseCoverUpload(
      {
        action: "authorize",
        target: "cover",
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
          target: "cover",
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
        target: "cover",
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
          target: "cover",
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
          target: "cover",
          fileName: "cover.jpg",
          fileSize: 1024,
          mimeType: "image/jpeg",
        },
        "admin_1"
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rejects cover uploads that exceed the maximum file size", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn(),
    };

    const cloudinary = {
      generateSignature: jest.fn(),
      isWithinSizeLimit: jest.fn().mockReturnValue(false),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      cloudinary as unknown as CloudinaryService
    );

    await expect(
      service.requestAdminShowcaseCoverUpload(
        {
          action: "authorize",
          target: "cover",
          fileName: "huge-cover.png",
          fileSize: 4 * 1024 * 1024, // 4 MB — passes Zod but rejected by cloudinary
          mimeType: "image/png",
        },
        "admin_1"
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(cloudinary.isWithinSizeLimit).toHaveBeenCalledWith(4 * 1024 * 1024);
    expect(cloudinary.generateSignature).not.toHaveBeenCalled();
  });

  it("authorizes fallback author image uploads in the dedicated Cloudinary folder", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn(),
    };

    const cloudinary = {
      generateSignature: jest.fn().mockReturnValue({
        signature: "signed",
        timestamp: 123456,
        cloudName: "demo",
        apiKey: "key",
        folder: "bookprinta/showcase/fallback-author-images",
      }),
      isWithinSizeLimit: jest.fn().mockReturnValue(true),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      cloudinary as unknown as CloudinaryService
    );

    const response = await service.requestAdminShowcaseCoverUpload(
      {
        action: "authorize",
        target: "fallbackAuthorProfileImage",
        fileName: "author.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
      },
      "admin_1"
    );

    expect(response.action).toBe("authorize");
    expect(response.upload).toMatchObject({
      resourceType: "image",
      folder: "bookprinta/showcase/fallback-author-images",
    });
    expect(cloudinary.generateSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "bookprinta/showcase/fallback-author-images",
        publicId: expect.stringMatching(/^fallback-author-image-admin_1-/),
        tags: expect.arrayContaining(["source:admin-showcase-fallback-author-image"]),
      })
    );
  });

  it("finalizes fallback author image uploads without persisting the showcase entry", async () => {
    const adminShowcaseService = {
      setEntryCoverFromUpload: jest.fn(),
    };

    const service = new AdminShowcaseUploadService(
      adminShowcaseService as never,
      { generateSignature: jest.fn() } as unknown as CloudinaryService
    );

    await expect(
      service.requestAdminShowcaseCoverUpload(
        {
          action: "finalize",
          target: "fallbackAuthorProfileImage",
          secureUrl:
            "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/fallback-author-images/fallback-author-image-admin_1-abc.jpg",
          publicId: "fallback-author-image-admin_1-abc",
          entryId: "cm_show_1",
        },
        "admin_1"
      )
    ).resolves.toEqual({
      action: "finalize",
      secureUrl:
        "https://res.cloudinary.com/demo/image/upload/v123/bookprinta/showcase/fallback-author-images/fallback-author-image-admin_1-abc.jpg",
      publicId: "fallback-author-image-admin_1-abc",
    });

    expect(adminShowcaseService.setEntryCoverFromUpload).not.toHaveBeenCalled();
  });
});
