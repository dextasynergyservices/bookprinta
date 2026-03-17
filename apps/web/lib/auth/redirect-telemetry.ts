type RedirectTelemetryEvent =
  | "auth.redirect.login-built"
  | "auth.redirect.logout-built"
  | "auth.redirect.post-login";

type RedirectTelemetrySample = {
  event: RedirectTelemetryEvent;
  outcome: "return-to" | "fallback";
  reason:
    | "valid-protected-path"
    | "invalid-or-unsupported-return-to"
    | "preserve-return-to-disabled"
    | "role-mismatch";
  role?: string;
  target: string;
  returnTo?: string | null;
};

function canUseCustomEvent(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function" &&
    typeof CustomEvent === "function"
  );
}

export function emitRedirectTelemetry(sample: RedirectTelemetrySample) {
  console.info("[auth-redirect]", sample);

  if (!canUseCustomEvent()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("bookprinta:auth-redirect", {
      detail: sample,
    })
  );
}
