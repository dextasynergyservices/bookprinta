"use client";

import { Loader2, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ResendSignupLinkForm() {
  const t = useTranslations("checkout");
  const searchParams = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get("email")?.trim() ?? "", [searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [isPending, setIsPending] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = !isPending && isValidEmail(normalizedEmail);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsPending(true);
    try {
      const response = await fetch(`${getApiV1BaseUrl()}/auth/resend-signup-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        throw new Error("Failed to resend signup link");
      }

      toast.success(t("payment_confirmation_resend_success"));
    } catch {
      toast.error(t("payment_confirmation_resend_error"));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-[#2A2A2A] bg-black px-4 py-4">
      <p className="font-sans text-sm font-semibold text-white">
        {t("payment_confirmation_resend_title")}
      </p>
      <p className="mt-1 font-sans text-xs text-white/60">
        {t("payment_confirmation_resend_subtitle")}
      </p>

      <form onSubmit={submit} className="mt-3 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label={t("payment_confirmation_resend_email_placeholder")}
          placeholder={t("payment_confirmation_resend_email_placeholder")}
          className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full px-5 font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
            canSubmit
              ? "bg-[#007eff] text-white hover:brightness-110"
              : "cursor-not-allowed border border-[#2A2A2A] bg-[#121212] text-white/45"
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              {t("payment_confirmation_resend_sending")}
            </>
          ) : (
            <>
              <Send className="mr-2 size-4" aria-hidden="true" />
              {t("payment_confirmation_resend_button")}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
