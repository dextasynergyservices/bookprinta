import {
  ProductionDelayStatusResponseSchema,
  UpdateProductionDelayBodySchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

export class ProductionDelayStatusResponseDto extends createZodDto(
  ProductionDelayStatusResponseSchema
) {}

export class UpdateProductionDelayBodyDto extends createZodDto(UpdateProductionDelayBodySchema) {}
