import type {
  ProductionDelayStatusResponse,
  UpdateProductionDelayBodyInput,
} from "@bookprinta/shared";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY } from "./production-delay.constants.js";
import {
  ProductionDelayService,
  type ProductionDelayStatusResolution,
} from "./production-delay.service.js";
import { ProductionDelayMonitorService } from "./production-delay-monitor.service.js";

const PRODUCTION_DELAY_OVERRIDE_SETTING_DESCRIPTION =
  "Admin override mode for production delay alerts: auto | force_active | force_inactive";

@Injectable()
export class ProductionDelayAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productionDelay: ProductionDelayService,
    private readonly productionDelayMonitor: ProductionDelayMonitorService
  ) {}

  async getProductionStatus(): Promise<ProductionDelayStatusResponse> {
    const resolution = await this.productionDelay.resolveStatus();
    return this.serializeStatus(resolution);
  }

  async updateProductionDelayOverride(
    adminId: string,
    input: UpdateProductionDelayBodyInput
  ): Promise<ProductionDelayStatusResponse> {
    await this.prisma.systemSetting.upsert({
      where: {
        key: PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY,
      },
      update: {
        value: input.overrideState,
        description: PRODUCTION_DELAY_OVERRIDE_SETTING_DESCRIPTION,
        updatedBy: adminId,
      },
      create: {
        key: PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY,
        value: input.overrideState,
        description: PRODUCTION_DELAY_OVERRIDE_SETTING_DESCRIPTION,
        updatedBy: adminId,
      },
    });

    const result = await this.productionDelayMonitor.runCheck({
      actorId: adminId,
      notes: input.notes,
    });

    return this.serializeStatus(result.resolution);
  }

  private serializeStatus(
    resolution: ProductionDelayStatusResolution
  ): ProductionDelayStatusResponse {
    return {
      threshold: resolution.threshold,
      backlogCount: resolution.backlogCount,
      affectedUserCount: resolution.affectedUsers.length,
      autoDelayActive: resolution.autoDelayActive,
      persistedDelayActive: resolution.persistedDelayActive,
      manualOverrideState: resolution.manualOverrideState,
      isDelayActive: resolution.isDelayActive,
      resolvedDelayStateSource: resolution.resolvedDelayStateSource,
      activeEvent: resolution.activeEvent,
    };
  }
}
