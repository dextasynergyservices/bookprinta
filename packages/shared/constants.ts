/**
 * bcrypt cost factor used for password hashing across all auth flows.
 * Defined once here so auth.service.ts, users.service.ts, and seed scripts
 * all stay in sync automatically.
 */
export const BCRYPT_SALT_ROUNDS = 12;
