import { Logger } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";
import { CLOUDINARY } from "./cloudinary.constants.js";

const logger = new Logger("CloudinaryProvider");

/**
 * Configures the Cloudinary SDK using environment variables.
 * Registered as a custom provider so the configured instance
 * can be injected anywhere via @Inject(CLOUDINARY).
 *
 * If env vars are missing in production, startup fails fast so we do not
 * release an environment where signed uploads are guaranteed to fail.
 * In non-production environments, we keep warning-only behavior.
 */
export const CloudinaryProvider = {
  provide: CLOUDINARY,
  useFactory: () => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
    const isProduction = appEnv === "production";

    if (!cloudName || !apiKey || !apiSecret) {
      const message =
        "Cloudinary environment variables not set (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).";

      if (isProduction) {
        logger.error(`${message} Refusing to start in production.`);
        throw new Error(`${message} Required for production signed uploads.`);
      }

      logger.warn(`${message} File uploads will be unavailable until configured.`);
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
