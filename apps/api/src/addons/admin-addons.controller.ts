import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { AddonsService } from "./addons.service.js";
import {
  AdminAddonDto,
  AdminCreateAddonDto,
  AdminDeleteAddonResponseDto,
  AdminUpdateAddonDto,
} from "./dto/admin-addon.dto.js";

@ApiTags("Admin Addons")
@Controller("admin/addons")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminAddonsController {
  constructor(private readonly addonsService: AddonsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List addons (admin)",
    description: "Returns all addons including inactive ones for admin management.",
  })
  @ApiResponse({
    status: 200,
    description: "Addon list",
    type: AdminAddonDto,
    isArray: true,
  })
  async list(): Promise<AdminAddonDto[]> {
    return this.addonsService.listAdminAddons();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create addon (admin)",
    description: "Creates a checkout addon with fixed or per-word pricing.",
  })
  @ApiResponse({
    status: 201,
    description: "Addon created",
    type: AdminAddonDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 409, description: "Addon name/slug already exists" })
  async create(
    @Body() body: AdminCreateAddonDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminAddonDto> {
    return this.addonsService.createAdminAddon(body);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update addon (admin)",
    description: "Updates addon details, pricing type/values, sort order, and active status.",
  })
  @ApiParam({ name: "id", description: "Addon ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Addon updated",
    type: AdminAddonDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 404, description: "Addon not found" })
  @ApiResponse({ status: 409, description: "Addon name/slug already exists" })
  async update(
    @Param("id") id: string,
    @Body() body: AdminUpdateAddonDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminAddonDto> {
    return this.addonsService.updateAdminAddon(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Soft-delete addon (admin)",
    description: "Soft deletes an addon by setting isActive to false.",
  })
  @ApiParam({ name: "id", description: "Addon ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Addon soft-deleted",
    type: AdminAddonDto,
  })
  @ApiResponse({ status: 404, description: "Addon not found" })
  async remove(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminAddonDto> {
    return this.addonsService.softDeleteAdminAddon(id);
  }

  @Delete(":id/permanent")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete addon permanently (admin)",
    description: "Permanently deletes an addon when it is not linked to orders.",
  })
  @ApiParam({ name: "id", description: "Addon ID", example: "cm1234567890abcdef1234567" })
  @ApiResponse({
    status: 200,
    description: "Addon permanently deleted",
    type: AdminDeleteAddonResponseDto,
  })
  @ApiResponse({ status: 404, description: "Addon not found" })
  @ApiResponse({ status: 409, description: "Cannot delete addon with linked orders" })
  async removePermanently(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<AdminDeleteAddonResponseDto> {
    return this.addonsService.deleteAdminAddon(id);
  }
}
