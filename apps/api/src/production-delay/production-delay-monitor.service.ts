import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import type { ProductionDelayEventSource } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY } from "./production-delay.constants.js";
import {
  ProductionDelayService,
  type ProductionDelayStatusResolution,
} from "./production-delay.service.js";
import { ProductionDelayDeliveryService } from "./production-delay-delivery.service.js";

type ProductionDelayMutationExecutor = Pick<
  Prisma.TransactionClient,
  "systemSetting" | "productionDelayEvent"
>;

type ProductionDelayMonitorAction =
  | "none"
  | "opened_auto_event"
  | "opened_manual_event"
  | "resolved_auto_event"
  | "resolved_manual_event"
  | "updated_active_event";

export type ProductionDelayMonitorRunOptions = {
  actorId?: string | null;
  notes?: string | null | undefined;
};

export type ProductionDelayMonitorRunResult = {
  resolution: ProductionDelayStatusResolution;
  action: ProductionDelayMonitorAction;
  activeEventId: string | null;
};

@Injectable()
export class ProductionDelayMonitorService {
  private readonly logger = new Logger(ProductionDelayMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productionDelay: ProductionDelayService,
    private readonly productionDelayDelivery: ProductionDelayDeliveryService
  ) {}

  async runScheduledCheck(): Promise<ProductionDelayMonitorRunResult> {
    return this.runCheck();
  }

  async runCheck(
    options: ProductionDelayMonitorRunOptions = {}
  ): Promise<ProductionDelayMonitorRunResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const resolution = await this.productionDelay.resolveStatus(tx);

      await this.upsertDelayActiveSetting(tx, resolution.isDelayActive);

      const eventMutation = await this.applyEventMutation(tx, resolution, options);

      if (eventMutation.action !== "none") {
        this.logger.log(
          `Production delay monitor ${eventMutation.action} (activeEventId=${eventMutation.activeEventId ?? "none"}, backlog=${resolution.backlogCount}, auto=${resolution.autoDelayActive}, override=${resolution.manualOverrideState}, effective=${resolution.isDelayActive})`
        );
      }

      return {
        resolution,
        action: eventMutation.action,
        activeEventId: eventMutation.activeEventId,
      };
    });

    await this.productionDelayDelivery.processRunResult(result);

    return result;
  }

  private async applyEventMutation(
    executor: ProductionDelayMutationExecutor,
    resolution: ProductionDelayStatusResolution,
    options: ProductionDelayMonitorRunOptions
  ): Promise<{ action: ProductionDelayMonitorAction; activeEventId: string | null }> {
    const activeEvent = resolution.activeEvent;

    if (resolution.manualOverrideState === "force_active") {
      if (!activeEvent) {
        const event = await this.createActiveEvent(executor, {
          source: "MANUAL",
          resolution,
          options,
        });

        return { action: "opened_manual_event", activeEventId: event.id };
      }

      await this.refreshActiveEvent(executor, activeEvent.id, resolution, options);
      return { action: "updated_active_event", activeEventId: activeEvent.id };
    }

    if (resolution.manualOverrideState === "force_inactive") {
      if (!activeEvent) {
        return { action: "none", activeEventId: null };
      }

      if (activeEvent.source === "MANUAL") {
        await this.resolveActiveEvent(executor, activeEvent.id, resolution, options);
        return { action: "resolved_manual_event", activeEventId: null };
      }

      if (resolution.autoDelayActive) {
        await this.refreshActiveEvent(executor, activeEvent.id, resolution, options);
        return { action: "updated_active_event", activeEventId: activeEvent.id };
      }

      await this.resolveActiveEvent(executor, activeEvent.id, resolution, options);
      return { action: "resolved_auto_event", activeEventId: null };
    }

    if (resolution.autoDelayActive) {
      if (!activeEvent) {
        const event = await this.createActiveEvent(executor, {
          source: "AUTO",
          resolution,
          options,
        });

        return { action: "opened_auto_event", activeEventId: event.id };
      }

      await this.refreshActiveEvent(executor, activeEvent.id, resolution, options);
      return { action: "updated_active_event", activeEventId: activeEvent.id };
    }

    if (!activeEvent) {
      return { action: "none", activeEventId: null };
    }

    await this.resolveActiveEvent(executor, activeEvent.id, resolution, options);
    return {
      action: activeEvent.source === "MANUAL" ? "resolved_manual_event" : "resolved_auto_event",
      activeEventId: null,
    };
  }

  private async upsertDelayActiveSetting(
    executor: ProductionDelayMutationExecutor,
    isDelayActive: boolean
  ): Promise<void> {
    await executor.systemSetting.upsert({
      where: { key: PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY },
      update: {
        value: String(isDelayActive),
        description:
          "Effective production delay banner state derived from the current delay event and override mode",
      },
      create: {
        key: PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY,
        value: String(isDelayActive),
        description:
          "Effective production delay banner state derived from the current delay event and override mode",
      },
    });
  }

  private async createActiveEvent(
    executor: ProductionDelayMutationExecutor,
    params: {
      source: ProductionDelayEventSource;
      resolution: ProductionDelayStatusResolution;
      options: ProductionDelayMonitorRunOptions;
    }
  ) {
    return executor.productionDelayEvent.create({
      data: {
        source: params.source,
        status: "ACTIVE",
        threshold: params.resolution.threshold,
        backlogCountOnStart: params.resolution.backlogCount,
        affectedUserCount: params.resolution.affectedUsers.length,
        lastEvaluatedAt: new Date(),
        triggeredBy: params.options.actorId ?? undefined,
        notes: this.normalizeNotes(params.options.notes),
      },
      select: {
        id: true,
      },
    });
  }

  private async refreshActiveEvent(
    executor: ProductionDelayMutationExecutor,
    eventId: string,
    resolution: ProductionDelayStatusResolution,
    options: ProductionDelayMonitorRunOptions
  ): Promise<void> {
    await executor.productionDelayEvent.update({
      where: { id: eventId },
      data: {
        lastEvaluatedAt: new Date(),
        affectedUserCount: resolution.affectedUsers.length,
        ...(this.normalizeNotes(options.notes)
          ? { notes: this.normalizeNotes(options.notes) }
          : {}),
      },
    });
  }

  private async resolveActiveEvent(
    executor: ProductionDelayMutationExecutor,
    eventId: string,
    resolution: ProductionDelayStatusResolution,
    options: ProductionDelayMonitorRunOptions
  ): Promise<void> {
    await executor.productionDelayEvent.update({
      where: { id: eventId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        lastEvaluatedAt: new Date(),
        backlogCountOnResolve: resolution.backlogCount,
        affectedUserCount: resolution.affectedUsers.length,
        resolvedBy: options.actorId ?? undefined,
        ...(this.normalizeNotes(options.notes)
          ? { notes: this.normalizeNotes(options.notes) }
          : {}),
      },
    });
  }

  private normalizeNotes(value: string | null | undefined): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
}
