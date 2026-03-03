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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { CouponsService } from "./coupons.service.js";
import { CouponResponseDto, CreateCouponDto, UpdateCouponDto } from "./dto/coupon.dto.js";

@ApiTags("Admin Coupons")
@Controller("admin/coupons")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "List all coupons",
    description: "Returns all coupons for admin management, including inactive or expired ones.",
  })
  @ApiResponse({
    status: 200,
    description: "Coupon list",
    type: CouponResponseDto,
    isArray: true,
  })
  async list(): Promise<CouponResponseDto[]> {
    return this.couponsService.listCoupons();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create coupon",
    description:
      "Creates a coupon with discount type/value, optional max uses, and optional expiry.",
  })
  @ApiResponse({
    status: 201,
    description: "Coupon created",
    type: CouponResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error or duplicate coupon code" })
  async create(
    @Body() dto: CreateCouponDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<CouponResponseDto> {
    return this.couponsService.createCoupon(dto);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update coupon",
    description: "Updates coupon fields such as active status, expiry, discount, or usage limits.",
  })
  @ApiResponse({
    status: 200,
    description: "Coupon updated",
    type: CouponResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error or duplicate coupon code" })
  @ApiResponse({ status: 404, description: "Coupon not found" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser("sub") _adminId: string
  ): Promise<CouponResponseDto> {
    return this.couponsService.updateCoupon(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete coupon",
    description: "Deletes a coupon permanently.",
  })
  @ApiResponse({
    status: 200,
    description: "Coupon deleted",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", example: "cm1234567890abcdef1234567" },
        deleted: { type: "boolean", example: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: "Coupon not found" })
  async remove(
    @Param("id") id: string,
    @CurrentUser("sub") _adminId: string
  ): Promise<{ id: string; deleted: true }> {
    return this.couponsService.deleteCoupon(id);
  }
}
