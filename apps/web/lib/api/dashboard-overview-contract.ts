import type { DashboardOverviewResponse } from "@bookprinta/shared";
import { DashboardOverviewResponseSchema } from "@bookprinta/shared";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function createEmptyDashboardOverviewResponse(): DashboardOverviewResponse {
  return {
    activeBook: null,
    recentOrders: [],
    notifications: {
      unreadCount: 0,
      hasProductionDelayBanner: false,
    },
    profile: {
      isProfileComplete: true,
      preferredLanguage: "en",
    },
    pendingActions: {
      total: 0,
      items: [],
    },
  };
}

export function normalizeDashboardOverviewPayload(payload: unknown): DashboardOverviewResponse {
  const root = toRecord(payload);
  const candidates: unknown[] = [payload, root?.data, root?.overview];

  for (const candidate of candidates) {
    const parsed = DashboardOverviewResponseSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return createEmptyDashboardOverviewResponse();
}
