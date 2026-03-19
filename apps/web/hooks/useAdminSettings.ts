"use client";

import type {
  AdminSystemPaymentGateway,
  AdminSystemSettingKey,
  AdminSystemSettingListItem,
  AdminSystemUpdatePaymentGatewayBodyInput,
  AdminSystemUpdateSettingBodyInput,
  UpdateProductionDelayBodyInput,
} from "@bookprinta/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  fetchAdminProductionStatus,
  fetchAdminSystemPaymentGateways,
  fetchAdminSystemSettings,
  normalizeAdminSettingsError,
  updateAdminProductionDelayOverride,
  updateAdminSystemPaymentGateway,
  updateAdminSystemSetting,
} from "@/lib/api/admin-settings";

export const adminSystemSettingsQueryKeys = {
  all: ["admin", "system-settings"] as const,
  settings: ["admin", "system-settings", "settings"] as const,
  gateways: ["admin", "system-settings", "payment-gateways"] as const,
  productionStatus: ["admin", "system-settings", "production-status"] as const,
};

function replaceSettingInList(
  items: AdminSystemSettingListItem[],
  nextItem: AdminSystemSettingListItem
): AdminSystemSettingListItem[] {
  const index = items.findIndex((item) => item.key === nextItem.key);
  if (index === -1) {
    return [...items, nextItem].sort((left, right) => left.key.localeCompare(right.key));
  }

  const next = items.slice();
  next[index] = nextItem;
  return next;
}

function replaceGatewayInList(
  items: AdminSystemPaymentGateway[],
  nextItem: AdminSystemPaymentGateway
): AdminSystemPaymentGateway[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  const next =
    index === -1
      ? [...items, nextItem]
      : items.map((item) => (item.id === nextItem.id ? nextItem : item));

  return next.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.name.localeCompare(right.name);
  });
}

export function useAdminSystemSettings() {
  const query = useQuery({
    queryKey: adminSystemSettingsQueryKeys.settings,
    meta: {
      sentryName: "fetchAdminSystemSettings",
      sentryEndpoint: "/api/v1/admin/system/settings",
    },
    queryFn: ({ signal }) => fetchAdminSystemSettings({ signal }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = query.data ?? { items: [], refreshedAt: null };

  return {
    ...query,
    data,
    settings: data.items,
    refreshedAt: data.refreshedAt,
    isInitialLoading: query.isPending && !query.data,
  };
}

export function useAdminSystemPaymentGateways() {
  const query = useQuery({
    queryKey: adminSystemSettingsQueryKeys.gateways,
    meta: {
      sentryName: "fetchAdminSystemPaymentGateways",
      sentryEndpoint: "/api/v1/admin/system/payment-gateways",
    },
    queryFn: ({ signal }) => fetchAdminSystemPaymentGateways({ signal }),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const data = query.data ?? { gateways: [], refreshedAt: null };

  return {
    ...query,
    data,
    gateways: data.gateways,
    refreshedAt: data.refreshedAt,
    isInitialLoading: query.isPending && !query.data,
  };
}

export function useUpdateAdminSystemSettingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { key: AdminSystemSettingKey; body: AdminSystemUpdateSettingBodyInput }) =>
      updateAdminSystemSetting(input),
    onSuccess: async (updatedSetting) => {
      queryClient.setQueryData(
        adminSystemSettingsQueryKeys.settings,
        (
          previous:
            | {
                items: AdminSystemSettingListItem[];
                refreshedAt: string;
              }
            | undefined
        ) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            items: replaceSettingInList(previous.items, updatedSetting),
          };
        }
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminSystemSettingsQueryKeys.settings }),
        queryClient.invalidateQueries({ queryKey: ["production-delay", "status"] }),
      ]);
    },
  });
}

export function useUpdateAdminSystemPaymentGatewayMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { gatewayId: string; body: AdminSystemUpdatePaymentGatewayBodyInput }) =>
      updateAdminSystemPaymentGateway(input),
    onSuccess: async (updatedGateway) => {
      queryClient.setQueryData(
        adminSystemSettingsQueryKeys.gateways,
        (
          previous:
            | {
                gateways: AdminSystemPaymentGateway[];
                refreshedAt: string;
              }
            | undefined
        ) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            gateways: replaceGatewayInList(previous.gateways, updatedGateway),
          };
        }
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminSystemSettingsQueryKeys.gateways }),
        queryClient.invalidateQueries({ queryKey: ["payment-gateways"] }),
      ]);
    },
  });
}

export function useAdminProductionStatus() {
  const query = useQuery({
    queryKey: adminSystemSettingsQueryKeys.productionStatus,
    meta: {
      sentryName: "fetchAdminProductionStatus",
      sentryEndpoint: "/api/v1/admin/system/production-status",
    },
    queryFn: ({ signal }) => fetchAdminProductionStatus({ signal }),
    staleTime: 10_000,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    refetchInterval: 20_000,
  });

  return {
    ...query,
    status: query.data ?? null,
    isInitialLoading: query.isPending && !query.data,
  };
}

export function useUpdateAdminProductionDelayOverrideMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { body: UpdateProductionDelayBodyInput }) =>
      updateAdminProductionDelayOverride(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminSystemSettingsQueryKeys.productionStatus,
      });
    },
  });
}

export { normalizeAdminSettingsError };

type SectionSnapshotState = Record<
  string,
  {
    baseline: string;
    current: string;
  }
>;

function serializeValue(value: unknown): string {
  if (value === undefined) {
    return "__undefined__";
  }

  return JSON.stringify(value);
}

export function useAdminSettingsUnsavedChanges() {
  const [sections, setSections] = useState<SectionSnapshotState>({});

  const initializeSection = useCallback((sectionId: string, value: unknown) => {
    const serialized = serializeValue(value);

    setSections((previous) => ({
      ...previous,
      [sectionId]: {
        baseline: serialized,
        current: serialized,
      },
    }));
  }, []);

  const updateSectionDraft = useCallback((sectionId: string, value: unknown) => {
    const serialized = serializeValue(value);

    setSections((previous) => {
      const existing = previous[sectionId];

      if (!existing) {
        return {
          ...previous,
          [sectionId]: {
            baseline: serialized,
            current: serialized,
          },
        };
      }

      return {
        ...previous,
        [sectionId]: {
          ...existing,
          current: serialized,
        },
      };
    });
  }, []);

  const markSectionSaved = useCallback((sectionId: string, value: unknown) => {
    const serialized = serializeValue(value);

    setSections((previous) => ({
      ...previous,
      [sectionId]: {
        baseline: serialized,
        current: serialized,
      },
    }));
  }, []);

  const resetSection = useCallback((sectionId: string) => {
    setSections((previous) => {
      const existing = previous[sectionId];
      if (!existing) {
        return previous;
      }

      return {
        ...previous,
        [sectionId]: {
          ...existing,
          current: existing.baseline,
        },
      };
    });
  }, []);

  const clearSection = useCallback((sectionId: string) => {
    setSections((previous) => {
      if (!(sectionId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[sectionId];
      return next;
    });
  }, []);

  const sectionDirtyMap = useMemo(() => {
    return Object.fromEntries(
      Object.entries(sections).map(([sectionId, snapshot]) => [
        sectionId,
        snapshot.current !== snapshot.baseline,
      ])
    ) as Record<string, boolean>;
  }, [sections]);

  const dirtySectionIds = useMemo(
    () => Object.keys(sectionDirtyMap).filter((sectionId) => sectionDirtyMap[sectionId]),
    [sectionDirtyMap]
  );

  const hasUnsavedChanges = dirtySectionIds.length > 0;

  const isSectionDirty = useCallback(
    (sectionId: string) => {
      return Boolean(sectionDirtyMap[sectionId]);
    },
    [sectionDirtyMap]
  );

  return {
    initializeSection,
    updateSectionDraft,
    markSectionSaved,
    resetSection,
    clearSection,
    isSectionDirty,
    sectionDirtyMap,
    dirtySectionIds,
    hasUnsavedChanges,
  };
}
