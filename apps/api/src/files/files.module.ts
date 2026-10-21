import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { MULTER_FILE_SIZE_LIMIT_BYTES } from "../cloudinary/cloudinary.service.js";
import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";

/**
 * Files Module — Handles file uploads via backend proxy with malware scanning.
 *
 * Upload flow:
 *  1. Frontend POST /api/v1/files/upload with multipart file + metadata
 *  2. Backend validates MIME type + file size (10MB limit)
 *  3. Backend scans file via ScannerService (ClamAV local / VirusTotal prod)
 *  4. Backend uploads clean file to Cloudinary (server-side)
 *  5. Backend creates File record in database
 *
 * Depends on:
 *  - CloudinaryModule (global) — Cloudinary server-side uploads
 *  - ScannerModule (global) — malware scanning
 *  - PrismaModule (global) — database access
 *
 * Endpoints:
 *  - POST /api/v1/files/upload     — Upload file (multipart, 🔑 authenticated)
 *  - GET  /api/v1/files/book/:id   — List file versions for a book (🔑 authenticated)
 */
@Module({
  imports: [
    // Configure Multer for in-memory file storage (buffer)
    // Files are held in memory briefly for scanning, then forwarded to Cloudinary
    MulterModule.register({
      limits: {
        // MAX_FILE_SIZE_BYTES + 1 — Multer's limit is the first *rejected*
        // size, so this makes exactly 10MB pass. See the constant's docs.
        fileSize: MULTER_FILE_SIZE_LIMIT_BYTES,
      },
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
