export const PRODUCTION_BACKLOG_THRESHOLD_SYSTEM_SETTING_KEY = "production_backlog_threshold";
export const PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY = "production_delay_active";
export const PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY = "production_delay_override_state";

export const DEFAULT_PRODUCTION_BACKLOG_THRESHOLD = 20;
export const DEFAULT_PRODUCTION_DELAY_ACTIVE = false;

export const PRODUCTION_DELAY_OVERRIDE_STATE_VALUES = [
  "auto",
  "force_active",
  "force_inactive",
] as const;

export type ProductionDelayOverrideState = (typeof PRODUCTION_DELAY_OVERRIDE_STATE_VALUES)[number];

export const DEFAULT_PRODUCTION_DELAY_OVERRIDE_STATE: ProductionDelayOverrideState = "auto";

export function isProductionDelayOverrideState(
  value: string | null | undefined
): value is ProductionDelayOverrideState {
  if (!value) return false;

  return PRODUCTION_DELAY_OVERRIDE_STATE_VALUES.includes(value as ProductionDelayOverrideState);
}
