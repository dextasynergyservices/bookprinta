const NIGERIA_COUNTRY_CODE = "234";

export function normalizePhoneNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }

  if (digits.startsWith("00") && digits.length > 2) {
    return `+${digits.slice(2)}`;
  }

  if (digits.startsWith(NIGERIA_COUNTRY_CODE) && digits.length === 13) {
    return `+${digits}`;
  }

  if (digits.startsWith("0") && digits.length === 11) {
    return `+${NIGERIA_COUNTRY_CODE}${digits.slice(1)}`;
  }

  return `+${digits}`;
}
