import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import { AddressesService } from "./addresses.service.js";
import {
  AddressesListResponseDto,
  AddressParamsDto,
  CreateAddressBodyDto,
  CreateAddressResponseDto,
  DeleteAddressResponseDto,
  UpdateAddressBodyDto,
  UpdateAddressResponseDto,
} from "./dto/index.js";

@ApiTags("Addresses")
@Controller("addresses")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List current user's shipping addresses",
    description:
      "Returns the authenticated user's saved delivery addresses for dashboard settings and checkout reuse.",
  })
  @ApiResponse({
    status: 200,
    description: "Addresses retrieved successfully",
    type: AddressesListResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async findMyAddresses(@CurrentUser("sub") userId: string): Promise<AddressesListResponseDto> {
    return this.addressesService.findMyAddresses(userId);
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Create a shipping address",
    description:
      "Adds a saved delivery address for the authenticated user and promotes it to default when requested or when it is the first address.",
  })
  @ApiResponse({
    status: 201,
    description: "Address created successfully",
    type: CreateAddressResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid address payload" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async createAddress(
    @CurrentUser("sub") userId: string,
    @Body() body: CreateAddressBodyDto
  ): Promise<CreateAddressResponseDto> {
    return this.addressesService.createAddress(userId, body);
  }

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update a shipping address",
    description:
      "Updates one saved delivery address owned by the authenticated user and can promote it to the default address.",
  })
  @ApiParam({
    name: "id",
    description: "Address CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Address updated successfully",
    type: UpdateAddressResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid address payload" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Address not found" })
  async updateAddress(
    @CurrentUser("sub") userId: string,
    @Param() params: AddressParamsDto,
    @Body() body: UpdateAddressBodyDto
  ): Promise<UpdateAddressResponseDto> {
    return this.addressesService.updateAddress(userId, params.id, body);
  }

  @Delete(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Delete a shipping address",
    description:
      "Deletes one saved delivery address owned by the authenticated user unless it is already linked to an active or historical order.",
  })
  @ApiParam({
    name: "id",
    description: "Address CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Address deleted successfully",
    type: DeleteAddressResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Address not found" })
  @ApiResponse({
    status: 409,
    description: "Address is already linked to an active or historical order and cannot be deleted",
  })
  async deleteAddress(
    @CurrentUser("sub") userId: string,
    @Param() params: AddressParamsDto
  ): Promise<DeleteAddressResponseDto> {
    return this.addressesService.deleteAddress(userId, params.id);
  }
}
