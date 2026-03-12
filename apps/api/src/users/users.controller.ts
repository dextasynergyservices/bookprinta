import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import {
  ChangeMyPasswordBodyDto,
  ChangeMyPasswordResponseDto,
  DeleteMyProfileImageResponseDto,
  MyProfileResponseDto,
  RequestMyProfileImageUploadBodyDto,
  RequestMyProfileImageUploadResponseDto,
  UpdateMyLanguageBodyDto,
  UpdateMyLanguageResponseDto,
  UpdateMyNotificationPreferencesBodyDto,
  UpdateMyNotificationPreferencesResponseDto,
  UpdateMyProfileBodyDto,
  UpdateMyProfileResponseDto,
} from "./dto/index.js";
import { UsersService } from "./users.service.js";

@ApiTags("Users")
@Controller("users")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me/profile")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get current user's profile and settings state",
    description:
      "Returns the authenticated user's author profile fields plus persisted language " +
      "and notification preferences for the dashboard profile/settings screen.",
  })
  @ApiResponse({
    status: 200,
    description: "Profile returned successfully",
    type: MyProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async getMyProfile(@CurrentUser("sub") userId: string): Promise<MyProfileResponseDto> {
    return this.usersService.getMyProfile(userId);
  }

  @Patch("me/profile")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update current user's author profile",
    description:
      "Updates the authenticated user's author profile fields and recomputes " +
      "profile completeness server-side for showcase and dashboard gating.",
  })
  @ApiResponse({
    status: 200,
    description: "Profile updated successfully",
    type: UpdateMyProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid profile payload" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async updateMyProfile(
    @CurrentUser("sub") userId: string,
    @Body() body: UpdateMyProfileBodyDto
  ): Promise<UpdateMyProfileResponseDto> {
    return this.usersService.updateMyProfile(userId, body);
  }

  @Post("me/profile/image")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Authorize or finalize a Cloudinary profile image upload",
    description:
      "Supports the full profile-image flow in one endpoint: " +
      'send { action: "authorize", mimeType } to get a signed Cloudinary upload payload, ' +
      'then send { action: "finalize", secureUrl, publicId } after Cloudinary upload succeeds ' +
      "to persist the image and recompute profile completeness.",
  })
  @ApiResponse({
    status: 200,
    description: "Signed upload payload returned successfully",
    type: RequestMyProfileImageUploadResponseDto,
  })
  @ApiResponse({ status: 400, description: "Unsupported image type" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async requestMyProfileImageUpload(
    @CurrentUser("sub") userId: string,
    @Body() body: RequestMyProfileImageUploadBodyDto
  ): Promise<RequestMyProfileImageUploadResponseDto> {
    return this.usersService.requestMyProfileImageUpload(userId, body);
  }

  @Delete("me/profile/image")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Delete current user's profile image",
    description:
      "Clears the authenticated user's profile image, recomputes profile completeness, " +
      "and best-effort deletes the previous Cloudinary asset.",
  })
  @ApiResponse({
    status: 200,
    description: "Profile image deleted successfully",
    type: DeleteMyProfileImageResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async deleteMyProfileImage(
    @CurrentUser("sub") userId: string
  ): Promise<DeleteMyProfileImageResponseDto> {
    return this.usersService.deleteMyProfileImage(userId);
  }

  @Patch("me/language")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update current user's preferred language",
    description:
      "Persists the authenticated user's preferred language for dashboard UI, " +
      "emails, and future notification localization.",
  })
  @ApiResponse({
    status: 200,
    description: "Preferred language updated successfully",
    type: UpdateMyLanguageResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async updateMyLanguage(
    @CurrentUser("sub") userId: string,
    @Body() body: UpdateMyLanguageBodyDto
  ): Promise<UpdateMyLanguageResponseDto> {
    return this.usersService.updateMyLanguage(userId, body);
  }

  @Patch("me/password")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Change current user's password",
    description:
      "Validates the authenticated user's current password, updates the password hash, " +
      "and invalidates stored refresh tokens so new sessions require reauthentication.",
  })
  @ApiResponse({
    status: 200,
    description: "Password changed successfully",
    type: ChangeMyPasswordResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid password change payload" })
  @ApiResponse({ status: 401, description: "Unauthorized or current password is incorrect" })
  async changeMyPassword(
    @CurrentUser("sub") userId: string,
    @Body() body: ChangeMyPasswordBodyDto
  ): Promise<ChangeMyPasswordResponseDto> {
    return this.usersService.changeMyPassword(userId, body);
  }

  @Patch("me/notification-preferences")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update current user's notification preferences",
    description:
      "Persists the authenticated user's email, WhatsApp, and in-app notification preferences.",
  })
  @ApiResponse({
    status: 200,
    description: "Notification preferences updated successfully",
    type: UpdateMyNotificationPreferencesResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async updateMyNotificationPreferences(
    @CurrentUser("sub") userId: string,
    @Body() body: UpdateMyNotificationPreferencesBodyDto
  ): Promise<UpdateMyNotificationPreferencesResponseDto> {
    return this.usersService.updateMyNotificationPreferences(userId, body);
  }
}
