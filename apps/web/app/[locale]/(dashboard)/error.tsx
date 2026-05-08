"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Route-level error boundary for the (dashboard) route group.
 *
 * Next.js renders this component instead of the page when any server
 * component inside (dashboard) throws. The DashboardShell (sidebar, nav)
 * remains intact — only the page content slot is replaced.
 */
export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const t = useTranslations("common");

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{t("error")}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{t("error_page_desc")}</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("retry")}
      </button>
    </div>
  );
}
