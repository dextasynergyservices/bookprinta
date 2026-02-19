import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";

/**
 * Files Module — Handles signed Cloudinary uploads and file record management.
 *
 * Depends on:
 *  - CloudinaryModule (global) — provides signature generation
 *  - PrismaModule (global) — provides database access
 *
 * Endpoints:
 *  - POST /api/v1/files/signature  — Generate signed upload params (🔑 authenticated)
 *  - POST /api/v1/files/confirm    — Confirm upload & create file record (🔑 authenticated)
 *  - GET  /api/v1/files/book/:id   — List file versions for a book (🔑 authenticated)
 */
@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
