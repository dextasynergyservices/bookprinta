import type { PrismaClient } from "../src/generated/prisma/client.js";
import {
  DEFAULT_PRODUCTION_BACKLOG_THRESHOLD,
  DEFAULT_PRODUCTION_DELAY_ACTIVE,
  DEFAULT_PRODUCTION_DELAY_OVERRIDE_STATE,
  PRODUCTION_BACKLOG_THRESHOLD_SYSTEM_SETTING_KEY,
  PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY,
  PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY,
} from "../src/production-delay/production-delay.constants.js";

type SystemSettingSeedDefinition = {
  key: string;
  value: string;
  description: string;
};

type SystemSettingWriteClient = Pick<PrismaClient, "systemSetting">;

export const PRODUCTION_DELAY_SYSTEM_SETTING_SEEDS: SystemSettingSeedDefinition[] = [
  {
    key: PRODUCTION_BACKLOG_THRESHOLD_SYSTEM_SETTING_KEY,
    value: String(DEFAULT_PRODUCTION_BACKLOG_THRESHOLD),
    description: "Number of active production books before automated delay alerts are triggered",
  },
  {
    key: PRODUCTION_DELAY_OVERRIDE_STATE_SYSTEM_SETTING_KEY,
    value: DEFAULT_PRODUCTION_DELAY_OVERRIDE_STATE,
    description:
      "Manual override mode for production delay alerts: auto, force_active, or force_inactive",
  },
  {
    key: PRODUCTION_DELAY_ACTIVE_SYSTEM_SETTING_KEY,
    value: String(DEFAULT_PRODUCTION_DELAY_ACTIVE),
    description:
      "Effective production delay banner state derived from the current delay event and override mode",
  },
];

export async function seedProductionDelaySettings(client: SystemSettingWriteClient) {
  console.log("🌱 Seeding production delay settings...\n");

  for (const setting of PRODUCTION_DELAY_SYSTEM_SETTING_SEEDS) {
    const result = await client.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        description: setting.description,
      },
      create: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
      },
    });

    console.log(`  ✔ ${result.key} = ${result.value}`);
  }

  console.log("\n✅ Production delay settings seeded.\n");
}
