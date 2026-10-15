/// <reference types="jest" />
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryService } from "./cloudinary.service.js";

describe("CloudinaryService.createSignedDownloadUrl", () => {
  let service: CloudinaryService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLOUDINARY_CLOUD_NAME: "test-cloud",
      CLOUDINARY_API_KEY: "test-api-key",
      CLOUDINARY_API_SECRET: "test-secret",
    };

    cloudinary.config({
      cloud_name: "test-cloud",
      api_key: "test-api-key",
      api_secret: "test-secret",
    });

    service = new CloudinaryService(cloudinary.config());
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("returns null for non-string, null, or empty input", () => {
    expect(service.createSignedDownloadUrl(null)).toBeNull();
    expect(service.createSignedDownloadUrl(undefined)).toBeNull();
    expect(service.createSignedDownloadUrl("")).toBeNull();
  });

  it("returns null for non-Cloudinary hostnames", () => {
    expect(
      service.createSignedDownloadUrl("https://example.com/test-cloud/raw/upload/file.pdf")
    ).toBeNull();
  });

  it("returns null when URL cloud name does not match environment", () => {
    expect(
      service.createSignedDownloadUrl(
        "https://res.cloudinary.com/other-cloud/raw/upload/v12345/bookprinta/previews/cm123"
      )
    ).toBeNull();
  });

  it("successfully signs an extensionless raw delivery asset", () => {
    const inputUrl =
      "https://res.cloudinary.com/test-cloud/raw/upload/v1791456770/bookprinta/preview-pdfs/cm12345/job1";

    const result = service.createSignedDownloadUrl(inputUrl, {
      attachment: false,
      expiresInSeconds: 3600,
    });

    expect(result).not.toBeNull();
    expect(result?.url).toContain("api.cloudinary.com/v1_1/test-cloud/raw/download");
    expect(result?.url).toContain("signature=");
    expect(result?.url).toContain("bookprinta%2Fpreview-pdfs%2Fcm12345%2Fjob1");
    expect(result?.expiresAt).toBeDefined();
  });

  it("successfully signs a file with extension and attachment: true", () => {
    const inputUrl =
      "https://res.cloudinary.com/test-cloud/raw/upload/v1791456770/bookprinta/manuscripts/cm12345/manuscript.docx";

    const result = service.createSignedDownloadUrl(inputUrl, {
      attachment: true,
      expiresInSeconds: 1800,
    });

    expect(result).not.toBeNull();
    expect(result?.url).toContain("test-cloud");
    expect(result?.url).toContain("signature=");
    expect(result?.url).toContain("format=docx");
    expect(result?.url).toContain("attachment=true");
  });
});
