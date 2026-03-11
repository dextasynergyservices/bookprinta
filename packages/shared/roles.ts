export const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN", "EDITOR", "MANAGER"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return typeof role === "string" && ADMIN_ROLES.includes(role as AdminRole);
}
