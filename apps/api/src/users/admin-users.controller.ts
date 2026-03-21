import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  AdminCreateUserDto,
  AdminCreateUserResponseDto,
  AdminDeleteUserResponseDto,
  AdminUpdateUserDto,
  AdminUpdateUserResponseDto,
  AdminUserDetailDto,
  AdminUsersListQueryDto,
  AdminUsersListResponseDto,
} from "./dto/index.js";
import { UsersService } from "./users.service.js";

@ApiTags("Admin Users")
@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Create an admin user (SUPER_ADMIN only)",
    description:
      "Creates a new admin/editor/manager user with pre-set credentials. The account is immediately active and verified.",
  })
  @ApiResponse({
    status: 201,
    description: "Admin user created successfully",
    type: AdminCreateUserResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input" })
  @ApiResponse({ status: 403, description: "Only SUPER_ADMIN can create admin users" })
  @ApiResponse({ status: 409, description: "Email already exists" })
  async createAdminUser(
    @Body() dto: AdminCreateUserDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminCreateUserResponseDto> {
    return this.usersService.createAdminUser(dto, adminId);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List users for the admin panel",
    description:
      "Returns a cursor-paginated user management list with search, role/verification filters, and stable sorting.",
  })
  @ApiResponse({
    status: 200,
    description: "Admin users list retrieved successfully",
    type: AdminUsersListResponseDto,
  })
  async findAdminUsers(@Query() query: AdminUsersListQueryDto): Promise<AdminUsersListResponseDto> {
    return this.usersService.findAdminUsers(query);
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get admin user detail",
    description:
      "Returns the full admin user detail payload including profile information plus orders, books, and payments history.",
  })
  @ApiParam({
    name: "id",
    description: "User CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Admin user detail retrieved successfully",
    type: AdminUserDetailDto,
  })
  @ApiResponse({ status: 404, description: "User not found" })
  async findAdminUserById(@Param("id") userId: string): Promise<AdminUserDetailDto> {
    return this.usersService.findAdminUserById(userId);
  }

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update an admin-managed user",
    description:
      "Updates role, verification state, or active state, and records an audit trail with previous and next values.",
  })
  @ApiParam({
    name: "id",
    description: "User CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Admin user updated successfully",
    type: AdminUpdateUserResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid or empty user update payload" })
  @ApiResponse({ status: 404, description: "User not found" })
  async updateAdminUser(
    @Param("id") userId: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminUpdateUserResponseDto> {
    return this.usersService.updateAdminUser(userId, dto, adminId);
  }

  @Delete(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Permanently delete a user account",
    description:
      "Permanently deletes a user by anonymizing all PII (name, email, phone, profile data), revoking tokens, and recording an audit entry. This action is irreversible.",
  })
  @ApiParam({
    name: "id",
    description: "User CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "User permanently deleted — PII anonymized",
    type: AdminDeleteUserResponseDto,
  })
  @ApiResponse({ status: 400, description: "User is already permanently deleted" })
  @ApiResponse({ status: 404, description: "User not found" })
  async deleteAdminUser(
    @Param("id") userId: string,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminDeleteUserResponseDto> {
    return this.usersService.deleteAdminUser(userId, adminId);
  }

  @Post(":id/reactivate")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Reactivate a deactivated user account",
    description:
      "Reactivates a soft-deleted user account by setting isActive to true and recording an admin audit entry.",
  })
  @ApiParam({
    name: "id",
    description: "User CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "User reactivated successfully",
    type: AdminUpdateUserResponseDto,
  })
  @ApiResponse({ status: 400, description: "User is already active" })
  @ApiResponse({ status: 404, description: "User not found" })
  async reactivateAdminUser(
    @Param("id") userId: string,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminUpdateUserResponseDto> {
    return this.usersService.reactivateAdminUser(userId, adminId);
  }
}
