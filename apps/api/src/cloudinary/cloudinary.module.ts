import { Global, Module } from "@nestjs/common";
import { CloudinaryProvider } from "./cloudinary.provider.js";
import { CloudinaryService } from "./cloudinary.service.js";

/**
 * Global Cloudinary module — provides CloudinaryService across the app.
 * Any module can inject CloudinaryService without importing CloudinaryModule.
 *
 * Configuration is read from environment variables:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
@Global()
@Module({
  providers: [CloudinaryProvider, CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
