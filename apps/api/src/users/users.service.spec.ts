/// <reference types="jest" />
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { UsersService } from "./users.service.js";

describe("UsersService", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const cloudinary = {
    generateSignature: jest.fn(),
    delete: jest.fn(),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(prisma as never, cloudinary as never);
    process.env.CLOUDINARY_CLOUD_NAME = "bookprinta";
  });

  it("returns the authenticated user's sanitized profile and settings snapshot", async () => {
    prisma.user.findUnique.mockResolvedValue(
      createUserRow({
        websiteUrl: "not-a-valid-url",
        purchaseLinks: [
          { label: "Amazon", url: "https://amazon.example/book" },
          { label: "", url: "https://invalid.example" },
        ],
      })
    );

    await expect(service.getMyProfile("cmuser1")).resolves.toEqual({
      bio: "Author bio",
      profileImageUrl:
        "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser1/profile-photo.png",
      whatsAppNumber: "+2348012345678",
      websiteUrl: null,
      purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
      socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
      isProfileComplete: true,
      preferredLanguage: "fr",
      notificationPreferences: {
        email: true,
        whatsApp: false,
        inApp: true,
      },
    });
  });

  it("marks the profile complete when bio, image, and at least one social link exist", async () => {
    prisma.user.findUnique.mockResolvedValue(
      createUserRow({
        purchaseLinks: [],
        socialLinks: [],
        isProfileComplete: false,
      })
    );
    prisma.user.update.mockResolvedValue(
      createUserRow({
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser1/new-profile.png",
        purchaseLinks: [],
        socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
        isProfileComplete: true,
      })
    );

    const result = await service.updateMyProfile("cmuser1", {
      socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "cmuser1" },
      data: expect.objectContaining({
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser1/profile-photo.png",
        socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
        isProfileComplete: true,
      }),
      select: expect.any(Object),
    });
    expect(result.isProfileComplete).toBe(true);
  });

  it("marks the profile complete when bio, image, and at least one purchase link exist", async () => {
    prisma.user.findUnique.mockResolvedValue(
      createUserRow({
        purchaseLinks: [],
        socialLinks: [],
        isProfileComplete: false,
      })
    );
    prisma.user.update.mockResolvedValue(
      createUserRow({
        purchaseLinks: [{ label: "Roving Heights", url: "https://rovingheights.com/book" }],
        socialLinks: [],
        isProfileComplete: true,
      })
    );

    const result = await service.updateMyProfile("cmuser1", {
      purchaseLinks: [{ label: "Roving Heights", url: "https://rovingheights.com/book" }],
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "cmuser1" },
      data: expect.objectContaining({
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser1/profile-photo.png",
        purchaseLinks: [{ label: "Roving Heights", url: "https://rovingheights.com/book" }],
        isProfileComplete: true,
      }),
      select: expect.any(Object),
    });
    expect(result.isProfileComplete).toBe(true);
  });

  it("deletes the previous Cloudinary asset when a profile image is removed", async () => {
    prisma.user.findUnique.mockResolvedValue(
      createUserRow({
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser1/old-profile.png",
        profileImagePublicId: "bookprinta/profile-images/cmuser1/old-profile",
      })
    );
    prisma.user.update.mockResolvedValue(
      createUserRow({
        profileImageUrl: null,
        profileImagePublicId: null,
        isProfileComplete: false,
      })
    );

    const result = await service.deleteMyProfileImage("cmuser1");

    expect(cloudinary.delete).toHaveBeenCalledWith(
      "bookprinta/profile-images/cmuser1/old-profile",
      "image"
    );
    expect(result.profileImageUrl).toBeNull();
    expect(result.isProfileComplete).toBe(false);
  });

  it("returns a signed profile image upload payload", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "cmuser1" });
    cloudinary.generateSignature.mockReturnValue({
      signature: "signature123",
      timestamp: 1710111000,
      cloudName: "bookprinta",
      apiKey: "key123",
      folder: "bookprinta/profile-images/cmuser1",
      resourceType: "image",
    });

    const result = await service.requestMyProfileImageUpload("cmuser1", {
      action: "authorize",
      mimeType: "image/png",
    });

    expect(cloudinary.generateSignature).toHaveBeenCalledWith({
      folder: "bookprinta/profile-images/cmuser1",
      mimeType: "image/png",
      publicId: expect.any(String),
      tags: ["user:cmuser1", "kind:profile-image"],
    });
    expect(result).toEqual(
      expect.objectContaining({
        action: "authorize",
        upload: expect.objectContaining({
          signature: "signature123",
          folder: "bookprinta/profile-images/cmuser1",
          resourceType: "image",
          publicId: expect.any(String),
        }),
      })
    );
  });

  it("finalizes the uploaded profile image and replaces the previous Cloudinary asset safely", async () => {
    prisma.user.findUnique.mockResolvedValue(
      createUserRow({
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser1/old-profile.png",
        profileImagePublicId: "bookprinta/profile-images/cmuser1/old-profile",
      })
    );
    prisma.user.update.mockResolvedValue(
      createUserRow({
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710112000/bookprinta/profile-images/cmuser1/new-profile.png",
        profileImagePublicId: "bookprinta/profile-images/cmuser1/new-profile",
      })
    );

    const result = await service.requestMyProfileImageUpload("cmuser1", {
      action: "finalize",
      secureUrl:
        "https://res.cloudinary.com/bookprinta/image/upload/v1710112000/bookprinta/profile-images/cmuser1/new-profile.png",
      publicId: "new-profile",
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "cmuser1" },
      data: expect.objectContaining({
        profileImageUrl:
          "https://res.cloudinary.com/bookprinta/image/upload/v1710112000/bookprinta/profile-images/cmuser1/new-profile.png",
        profileImagePublicId: "bookprinta/profile-images/cmuser1/new-profile",
        isProfileComplete: true,
      }),
      select: expect.any(Object),
    });
    expect(cloudinary.delete).toHaveBeenCalledWith(
      "bookprinta/profile-images/cmuser1/old-profile",
      "image"
    );
    expect(result).toEqual(
      expect.objectContaining({
        action: "finalize",
        profile: expect.objectContaining({
          profileImageUrl:
            "https://res.cloudinary.com/bookprinta/image/upload/v1710112000/bookprinta/profile-images/cmuser1/new-profile.png",
        }),
      })
    );
  });

  it("rejects password changes when the current password is wrong", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser1",
      password: "stored-hash",
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.changeMyPassword("cmuser1", {
        currentPassword: "wrong-password",
        newPassword: "NewPassword1!",
        confirmPassword: "NewPassword1!",
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("hashes the new password and invalidates refresh tokens when the current password is correct", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "cmuser1",
      password: "stored-hash",
    });
    prisma.user.update.mockResolvedValue({ id: "cmuser1" });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue("new-hash");

    await expect(
      service.changeMyPassword("cmuser1", {
        currentPassword: "CurrentPassword1!",
        newPassword: "NewPassword1!",
        confirmPassword: "NewPassword1!",
      })
    ).resolves.toEqual({ success: true });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "cmuser1" },
      data: {
        password: "new-hash",
        refreshToken: null,
        refreshTokenExp: null,
      },
    });
  });

  it("rejects non-Cloudinary profile image URLs", async () => {
    prisma.user.findUnique.mockResolvedValue(createUserRow());

    await expect(
      service.requestMyProfileImageUpload("cmuser1", {
        action: "finalize",
        secureUrl: "https://example.com/profile.png",
        publicId: "profile-image",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createUserRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cmuser1",
    password: "stored-hash",
    bio: "Author bio",
    profileImageUrl:
      "https://res.cloudinary.com/bookprinta/image/upload/v1710111000/bookprinta/profile-images/cmuser1/profile-photo.png",
    profileImagePublicId: "bookprinta/profile-images/cmuser1/profile-photo",
    whatsAppNumber: "+2348012345678",
    websiteUrl: "https://author.example.com",
    purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
    socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
    isProfileComplete: true,
    preferredLanguage: "fr",
    emailNotificationsEnabled: true,
    whatsAppNotificationsEnabled: false,
    inAppNotificationsEnabled: true,
    refreshToken: "refresh-token",
    refreshTokenExp: new Date("2026-03-11T10:00:00.000Z"),
    ...overrides,
  };
}
