import { Logger } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";
import { CLOUDINARY } from "./cloudinary.constants.js";

const logger = new Logger("CloudinaryProvider");

/**
 * Configures the Cloudinary SDK using environment variables.
 * Registered as a custom provider so the configured instance
 * can be injected anywhere via @Inject(CLOUDINARY).
 *
 * If env vars are missing, the provider logs a warning and returns
 * an unconfigured instance. The server still boots — upload endpoints
 * will fail at runtime with a clear error (see CloudinaryService).
 */
export const CloudinaryProvider = {
  provide: CLOUDINARY,
  useFactory: () => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      logger.warn(
        "Cloudinary environment variables not set (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). " +
          "File uploads will be unavailable until configured."
      );
      return cloudinary.config();
    }

    return cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  },
};
