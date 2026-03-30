"use client";

import { QuoteWizardInner } from "@/app/[locale]/(marketing)/quote/QuoteView";
import { useAuthSession } from "@/hooks/use-auth-session";

export default function DashboardQuotePage() {
  const { user, isLoading } = useAuthSession();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <QuoteWizardInner
      variant="dashboard"
      initialContact={{
        fullName: user?.displayName ?? "",
        email: user?.email ?? "",
      }}
    />
  );
}
