import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { UserRole } from "../src/generated/prisma/enums.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 12;
const DEFAULT_ADMIN_EMAIL = "admin@bookprinta.local";
const DEFAULT_ADMIN_PASSWORD = "Admin123!ChangeMe";
const DEFAULT_ADMIN_FIRST_NAME = "BookPrinta";
const DEFAULT_ADMIN_LAST_NAME = "Admin";
const DEFAULT_ADMIN_ROLE = "SUPER_ADMIN" as const satisfies UserRole;
const ADMIN_SEEDABLE_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "EDITOR",
  "MANAGER",
] as const satisfies readonly UserRole[];

type SeedAdminRole = (typeof ADMIN_SEEDABLE_ROLES)[number];

type AdminSeedConfig = {
  email: string;
  password: string;
  firstName: string;
  lastName: string | null;
  role: SeedAdminRole;
  isUsingDefaultPassword: boolean;
};

function isProductionLikeEnvironment() {
  const environment = (process.env.APP_ENV || process.env.NODE_ENV || "development").trim();
  return ["production", "staging"].includes(environment.toLowerCase());
}

function resolveAdminRole(): SeedAdminRole {
  const resolvedRole = (process.env.SEED_ADMIN_ROLE || DEFAULT_ADMIN_ROLE).trim().toUpperCase();

  if (ADMIN_SEEDABLE_ROLES.includes(resolvedRole as SeedAdminRole)) {
    return resolvedRole as SeedAdminRole;
  }

  throw new Error(
    `SEED_ADMIN_ROLE must be one of: ${ADMIN_SEEDABLE_ROLES.join(", ")}. Received "${resolvedRole}".`
  );
}

function resolveAdminSeedConfig(): AdminSeedConfig {
  const email = (process.env.SEED_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const configuredPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || "";
  const password = configuredPassword || DEFAULT_ADMIN_PASSWORD;
  const firstName = (process.env.SEED_ADMIN_FIRST_NAME || DEFAULT_ADMIN_FIRST_NAME).trim();
  const lastNameInput = (process.env.SEED_ADMIN_LAST_NAME || DEFAULT_ADMIN_LAST_NAME).trim();
  const role = resolveAdminRole();
  const isUsingDefaultPassword = configuredPassword.length === 0;

  if (!email.includes("@")) {
    throw new Error(`SEED_ADMIN_EMAIL must be a valid email address. Received "${email}".`);
  }

  if (firstName.length === 0) {
    throw new Error("SEED_ADMIN_FIRST_NAME cannot be empty.");
  }

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters long.");
  }

  if (isProductionLikeEnvironment() && isUsingDefaultPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD must be provided explicitly when APP_ENV/NODE_ENV is staging or production."
    );
  }

  return {
    email,
    password,
    firstName,
    lastName: lastNameInput.length > 0 ? lastNameInput : null,
    role,
    isUsingDefaultPassword,
  };
}

async function seedAdmin() {
  const config = resolveAdminSeedConfig();

  console.log("🌱 Seeding bootstrap admin account...\n");

  if (config.isUsingDefaultPassword) {
    console.warn(
      `⚠ Using default admin password for ${config.email}. Override SEED_ADMIN_PASSWORD before sharing this environment.\n`
    );
  }

  const hashedPassword = await bcrypt.hash(config.password, SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: config.email },
    update: {
      firstName: config.firstName,
      lastName: config.lastName,
      password: hashedPassword,
      role: config.role,
      isVerified: true,
      preferredLanguage: "en",
      verificationToken: null,
      verificationCode: null,
      resetToken: null,
      tokenExpiry: null,
      refreshToken: null,
      refreshTokenExp: null,
    },
    create: {
      email: config.email,
      firstName: config.firstName,
      lastName: config.lastName,
      password: hashedPassword,
      role: config.role,
      isVerified: true,
      preferredLanguage: "en",
      refreshToken: null,
      refreshTokenExp: null,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  console.log(`  ✔ Admin: ${admin.email} [${admin.role}] (id: ${admin.id})`);
  console.log("\n✅ Admin seed complete.\n");
}

async function main() {
  await seedAdmin();
}

main()
  .catch((error: unknown) => {
    console.error("❌ Admin seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
