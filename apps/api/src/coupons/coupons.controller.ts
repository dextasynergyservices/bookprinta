import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { getIpTracker } from "../rate-limit/tracker.utils.js";
import { CouponsService } from "./coupons.service.js";
import {
  CouponValidationErrorResponseDto,
  ValidateCouponDto,
  ValidateCouponResponseDto,
} from "./dto/coupon.dto.js";

const COUPON_VALIDATE_THROTTLE = {
  short: { limit: 3, ttl: 3_600_000, getTracker: getIpTracker },
  long: { limit: 3, ttl: 3_600_000, getTracker: getIpTracker },
};

@ApiTags("Coupons")
@Controller("coupons")
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post("validate")
  @HttpCode(HttpStatus.OK)
  @Throttle(COUPON_VALIDATE_THROTTLE)
  @ApiOperation({
    summary: "Validate coupon code",
    description:
      "Validates coupon status (active, expiry, usage limit) and returns the computed discount amount.",
  })
  @ApiResponse({
    status: 200,
    description: "Coupon validated successfully",
    type: ValidateCouponResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "Coupon validation failed with standardized error code: INVALID_CODE | CODE_EXPIRED | CODE_INACTIVE | CODE_MAXED_OUT | CODE_NOT_APPLICABLE",
    type: CouponValidationErrorResponseDto,
  })
  @ApiResponse({ status: 429, description: "Too many coupon validation attempts" })
  async validate(@Body() dto: ValidateCouponDto): Promise<ValidateCouponResponseDto> {
    return this.couponsService.validateCoupon(dto);
  }
}
