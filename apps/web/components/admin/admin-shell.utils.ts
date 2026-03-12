type AdminRoleTranslationKey = "role_admin" | "role_super_admin" | "role_editor" | "role_manager";

export function formatAdminRoleLabel(
  role: string | null | undefined,
  translate: (key: AdminRoleTranslationKey) => string
) {
  const key = resolveAdminRoleTranslationKey(role);
  return key ? translate(key) : "";
}

function resolveAdminRoleTranslationKey(
  role: string | null | undefined
): AdminRoleTranslationKey | null {
  switch (role) {
    case "ADMIN":
      return "role_admin";
    case "SUPER_ADMIN":
      return "role_super_admin";
    case "EDITOR":
      return "role_editor";
    case "MANAGER":
      return "role_manager";
    default:
      return null;
  }
}

export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];

  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"
  );
}
