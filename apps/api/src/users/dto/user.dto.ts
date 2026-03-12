import {
  ChangeMyPasswordBodySchema,
  ChangeMyPasswordResponseSchema,
  DeleteMyProfileImageResponseSchema,
  MyProfileResponseSchema,
  RequestMyProfileImageUploadBodySchema,
  RequestMyProfileImageUploadResponseSchema,
  UpdateMyLanguageBodySchema,
  UpdateMyLanguageResponseSchema,
  UpdateMyNotificationPreferencesBodySchema,
  UpdateMyNotificationPreferencesResponseSchema,
  UpdateMyProfileBodySchema,
  UpdateMyProfileResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

export class MyProfileResponseDto extends createZodDto(MyProfileResponseSchema) {}

export class UpdateMyProfileBodyDto extends createZodDto(UpdateMyProfileBodySchema) {}

export class UpdateMyProfileResponseDto extends createZodDto(UpdateMyProfileResponseSchema) {}

export class RequestMyProfileImageUploadBodyDto extends createZodDto(
  RequestMyProfileImageUploadBodySchema
) {}

export class RequestMyProfileImageUploadResponseDto extends createZodDto(
  RequestMyProfileImageUploadResponseSchema
) {}

export class DeleteMyProfileImageResponseDto extends createZodDto(
  DeleteMyProfileImageResponseSchema
) {}

export class UpdateMyLanguageBodyDto extends createZodDto(UpdateMyLanguageBodySchema) {}

export class UpdateMyLanguageResponseDto extends createZodDto(UpdateMyLanguageResponseSchema) {}

export class ChangeMyPasswordBodyDto extends createZodDto(ChangeMyPasswordBodySchema) {}

export class ChangeMyPasswordResponseDto extends createZodDto(ChangeMyPasswordResponseSchema) {}

export class UpdateMyNotificationPreferencesBodyDto extends createZodDto(
  UpdateMyNotificationPreferencesBodySchema
) {}

export class UpdateMyNotificationPreferencesResponseDto extends createZodDto(
  UpdateMyNotificationPreferencesResponseSchema
) {}
