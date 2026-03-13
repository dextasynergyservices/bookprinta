import {
  AddressesListResponseSchema,
  AddressParamsSchema,
  CreateAddressBodySchema,
  CreateAddressResponseSchema,
  DeleteAddressResponseSchema,
  UpdateAddressBodySchema,
  UpdateAddressResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** :id route param for /addresses/:id */
export class AddressParamsDto extends createZodDto(AddressParamsSchema) {}

/** Response for GET /api/v1/addresses */
export class AddressesListResponseDto extends createZodDto(AddressesListResponseSchema) {}

/** Request body for POST /api/v1/addresses */
export class CreateAddressBodyDto extends createZodDto(CreateAddressBodySchema) {}

/** Response for POST /api/v1/addresses */
export class CreateAddressResponseDto extends createZodDto(CreateAddressResponseSchema) {}

/** Request body for PATCH /api/v1/addresses/:id */
export class UpdateAddressBodyDto extends createZodDto(UpdateAddressBodySchema) {}

/** Response for PATCH /api/v1/addresses/:id */
export class UpdateAddressResponseDto extends createZodDto(UpdateAddressResponseSchema) {}

/** Response for DELETE /api/v1/addresses/:id */
export class DeleteAddressResponseDto extends createZodDto(DeleteAddressResponseSchema) {}
