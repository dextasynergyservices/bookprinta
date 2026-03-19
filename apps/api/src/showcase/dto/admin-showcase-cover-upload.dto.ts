import {
  AdminAuthorizeShowcaseCoverUploadResponseSchema,
  AdminFinalizeShowcaseCoverUploadResponseSchema,
  AdminShowcaseCoverUploadBodySchema,
  AdminShowcaseCoverUploadResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** POST /api/v1/admin/showcase/cover-upload */
export class AdminShowcaseCoverUploadBodyDto extends createZodDto(
  AdminShowcaseCoverUploadBodySchema
) {}

/** Authorize response payload */
export class AdminAuthorizeShowcaseCoverUploadResponseDto extends createZodDto(
  AdminAuthorizeShowcaseCoverUploadResponseSchema
) {}

/** Finalize response payload */
export class AdminFinalizeShowcaseCoverUploadResponseDto extends createZodDto(
  AdminFinalizeShowcaseCoverUploadResponseSchema
) {}

/** Union response for authorize/finalize */
export class AdminShowcaseCoverUploadResponseDto extends createZodDto(
  AdminShowcaseCoverUploadResponseSchema
) {}
