"use client";

import type { AdminUserDetail, UserRoleValue } from "@bookprinta/shared";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizeAdminBookStatus } from "@/hooks/use-admin-books-filters";
import { humanizeAdminOrderStatus } from "@/hooks/use-admin-orders-filters";
import { ADMIN_USER_ROLE_OPTIONS } from "@/hooks/use-admin-users-filters";
import {
  useAdminDeleteUserMutation,
  useAdminReactivateUserMutation,
  useAdminUpdateUserMutation,
} from "@/hooks/useAdminUserActions";
import { useAdminUserDetail } from "@/hooks/useAdminUserDetail";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type AdminUserDetailViewProps = {
  userId: string;
};

type PendingAction = "save" | "reactivate" | "deactivate" | "delete" | null;

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const DETAIL_SUMMARY_SKELETON_IDS = [
  "user-detail-summary-skeleton-1",
  "user-detail-summary-skeleton-2",
  "user-detail-summary-skeleton-3",
  "user-detail-summary-skeleton-4",
] as const;
const DETAIL_MAIN_SKELETON_IDS = [
  "user-detail-main-skeleton-1",
  "user-detail-main-skeleton-2",
  "user-detail-main-skeleton-3",
] as const;
const DETAIL_ASIDE_SKELETON_IDS = [
  "user-detail-aside-skeleton-1",
  "user-detail-aside-skeleton-2",
] as const;

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatDateTime(
  value: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (!value) return fallback;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function formatDate(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value) return fallback;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return fallback;

  const currencyCode = (currency || "NGN").toUpperCase();

  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return fallback;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function formatAdminUserRole(
  role: UserRoleValue,
  tAdmin: (key: string, values?: Record<string, string | number | Date>) => string
): string {
  switch (role) {
    case "USER":
      return tAdmin("role_user");
    case "ADMIN":
      return tAdmin("role_admin");
    case "EDITOR":
      return tAdmin("role_editor");
    case "MANAGER":
      return tAdmin("role_manager");
    case "SUPER_ADMIN":
      return tAdmin("role_super_admin");
    default:
      return role;
  }
}

function resolveRoleTone(role: UserRoleValue): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]";
    case "ADMIN":
      return "border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]";
    case "MANAGER":
      return "border-[#06b6d4]/45 bg-[#06b6d4]/15 text-[#67e8f9]";
    case "EDITOR":
      return "border-[#facc15]/45 bg-[#facc15]/15 text-[#facc15]";
    default:
      return "border-[#6f6f6f]/45 bg-[#1A1A1A] text-[#d0d0d0]";
  }
}

function InfoCard({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[1.5rem] border border-[#1E1E1E] bg-[#111111] p-4 md:p-5",
        className
      )}
    >
      <div className="mb-4">
        {eyebrow ? (
          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display mt-2 text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {description ? (
          <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#202020] bg-[#0B0B0B] p-3">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
        {label}
      </p>
      <p className="font-sans mt-2 text-sm leading-6 text-white [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
        {label}
      </p>
      <p className="font-display mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      {hint ? <p className="font-sans mt-2 text-xs leading-5 text-[#8F8F8F]">{hint}</p> : null}
    </div>
  );
}

function UserRoleBadge({ role, label }: { role: UserRoleValue; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        resolveRoleTone(role)
      )}
    >
      {label}
    </Badge>
  );
}

function AccountStateBadge({
  active,
  verified,
  label,
}: {
  active?: boolean;
  verified?: boolean;
  label: string;
}) {
  const toneClassName =
    active === false
      ? "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#ef4444]"
      : verified === true
        ? "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]"
        : verified === false
          ? "border-[#f59e0b]/45 bg-[#f59e0b]/15 text-[#f59e0b]"
          : "border-[#2A2A2A] bg-[#0F0F0F] text-[#bdbdbd]";

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        toneClassName
      )}
    >
      {active === false ? <UserRoundX className="size-3.5" aria-hidden="true" /> : null}
      {active === true ? <UserRoundCheck className="size-3.5" aria-hidden="true" /> : null}
      {verified === true ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : null}
      {verified === false ? <ShieldX className="size-3.5" aria-hidden="true" /> : null}
      <span>{label}</span>
    </Badge>
  );
}

function ExternalResourceLink({
  href,
  label,
  srOnlyContext,
}: {
  href: string;
  label: string;
  srOnlyContext?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#2A2A2A] bg-[#111111] px-4 py-2 font-sans text-xs text-white transition-colors duration-150 hover:border-[#3A3A3A] hover:bg-[#181818] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
    >
      <span>{label}</span>
      {srOnlyContext ? <span className="sr-only"> {srOnlyContext}</span> : null}
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function ManagementSwitchRow({
  titleId,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  titleId: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const descriptionId = `${titleId}-description`;

  return (
    <div className="flex items-start justify-between gap-4 rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
      <div className="min-w-0">
        <p id={titleId} className="font-sans text-sm font-medium text-white">
          {title}
        </p>
        <p id={descriptionId} className="font-sans mt-1 text-sm leading-6 text-[#8F8F8F]">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "inline-flex h-11 w-[4.5rem] shrink-0 items-center rounded-full border p-1 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-[#007eff]/55 bg-[#007eff]/25" : "border-[#2A2A2A] bg-[#171717]"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "block size-9 rounded-full bg-white shadow-[0_6px_18px_rgba(0,0,0,0.28)] transition-transform duration-150",
            checked ? "translate-x-7" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <Skeleton className="h-4 w-28 rounded-full bg-[#1B1B1B]" />
        <Skeleton className="mt-4 h-10 w-56 rounded-full bg-[#1B1B1B]" />
        <Skeleton className="mt-3 h-5 w-full max-w-3xl bg-[#1B1B1B]" />
      </div>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.95fr)]">
        <div className="grid min-w-0 gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {DETAIL_SUMMARY_SKELETON_IDS.map((skeletonId) => (
              <Skeleton key={skeletonId} className="h-36 rounded-[1.5rem] bg-[#171717]" />
            ))}
          </div>
          {DETAIL_MAIN_SKELETON_IDS.map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-72 rounded-[1.5rem] bg-[#171717]" />
          ))}
        </div>
        <div className="grid gap-4">
          {DETAIL_ASIDE_SKELETON_IDS.map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-80 rounded-[1.5rem] bg-[#171717]" />
          ))}
        </div>
      </div>
    </section>
  );
}

function buildAuditDescription(params: {
  action: string;
  recordedAt: string;
  locale: string;
  tAdmin: (key: string, values?: Record<string, string | number | Date>) => string;
}): string {
  return params.tAdmin("users_detail_save_success_description", {
    action: humanizeAdminOrderStatus(params.action),
    date: formatDateTime(params.recordedAt, params.locale, params.tAdmin("users_detail_unknown")),
  });
}

export function AdminUserDetailView({ userId }: AdminUserDetailViewProps) {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const detailQuery = useAdminUserDetail({
    userId,
    enabled: Boolean(userId),
  });
  const updateMutation = useAdminUpdateUserMutation();
  const deleteMutation = useAdminDeleteUserMutation();
  const reactivateMutation = useAdminReactivateUserMutation();

  const [roleDraft, setRoleDraft] = useState<UserRoleValue>("USER");
  const [verifiedDraft, setVerifiedDraft] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [latestAuditSummary, setLatestAuditSummary] = useState<{
    action: string;
    recordedAt: string;
  } | null>(null);

  const roleSelectId = useId();
  const verifiedSwitchTitleId = useId();
  const deactivateSwitchTitleId = useId();

  const user = detailQuery.user;
  const profile = user?.profile ?? null;
  const isSavePending = updateMutation.isPending && pendingAction === "save";
  const isReactivatePending = reactivateMutation.isPending && pendingAction === "reactivate";
  const isDeactivatePending = updateMutation.isPending && pendingAction === "deactivate";
  const isDeletePending = deleteMutation.isPending && pendingAction === "delete";

  useEffect(() => {
    if (!profile) return;

    setRoleDraft(profile.role);
    setVerifiedDraft(profile.isVerified);
  }, [profile]);

  const hasManagementChanges =
    profile !== null && (roleDraft !== profile.role || verifiedDraft !== profile.isVerified);

  const summaryValues = useMemo(() => {
    if (!user || !profile) {
      return {
        orders: "0",
        books: "0",
        payments: "0",
        profileStatus: "—",
      };
    }

    return {
      orders: String(user.orders.length),
      books: String(user.books.length),
      payments: String(user.payments.length),
      profileStatus: profile.isProfileComplete
        ? tAdmin("users_detail_metric_profile_complete")
        : tAdmin("users_detail_metric_profile_incomplete"),
    };
  }, [profile, tAdmin, user]);

  async function handleSaveManagement() {
    if (!profile || !hasManagementChanges) return;

    const input: Partial<Pick<AdminUserDetail["profile"], "role" | "isVerified">> = {};
    if (roleDraft !== profile.role) {
      input.role = roleDraft;
    }
    if (verifiedDraft !== profile.isVerified) {
      input.isVerified = verifiedDraft;
    }

    setPendingAction("save");

    try {
      const response = await updateMutation.mutateAsync({
        userId,
        input,
      });

      setLatestAuditSummary({
        action: response.audit.action,
        recordedAt: response.audit.recordedAt,
      });

      toast.success(tAdmin("users_detail_save_success"), {
        description: buildAuditDescription({
          action: response.audit.action,
          recordedAt: response.audit.recordedAt,
          locale,
          tAdmin,
        }),
      });
    } catch (error) {
      toast.error(tAdmin("users_detail_save_error_title"), {
        description: getErrorMessage(error, tAdmin("users_detail_save_error_description")),
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeactivate() {
    if (!profile || !profile.isActive) return;

    setPendingAction("deactivate");

    try {
      const response = await updateMutation.mutateAsync({
        userId,
        input: {
          isActive: false,
        },
      });

      setLatestAuditSummary({
        action: response.audit.action,
        recordedAt: response.audit.recordedAt,
      });
      setIsDeactivateDialogOpen(false);

      toast.success(tAdmin("users_detail_deactivate_success"), {
        description: buildAuditDescription({
          action: response.audit.action,
          recordedAt: response.audit.recordedAt,
          locale,
          tAdmin,
        }),
      });
    } catch (error) {
      toast.error(tAdmin("users_detail_deactivate_error_title"), {
        description: getErrorMessage(error, tAdmin("users_detail_deactivate_error_description")),
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleReactivate() {
    if (!profile || profile.isActive || isReactivatePending) return;

    setPendingAction("reactivate");

    try {
      const response = await reactivateMutation.mutateAsync({
        userId,
      });

      setLatestAuditSummary({
        action: response.audit.action,
        recordedAt: response.audit.recordedAt,
      });

      toast.success(tAdmin("users_detail_reactivate_success"), {
        description: buildAuditDescription({
          action: response.audit.action,
          recordedAt: response.audit.recordedAt,
          locale,
          tAdmin,
        }),
      });
    } catch (error) {
      toast.error(tAdmin("users_detail_reactivate_error_title"), {
        description: getErrorMessage(error, tAdmin("users_detail_reactivate_error_description")),
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeleteUser() {
    if (!profile || isDeletePending) return;

    setPendingAction("delete");

    try {
      const response = await deleteMutation.mutateAsync({ userId });

      setLatestAuditSummary({
        action: response.audit.action,
        recordedAt: response.audit.recordedAt,
      });
      setIsDeleteDialogOpen(false);

      toast.success(tAdmin("users_detail_delete_success"), {
        description: tAdmin("users_detail_delete_success_description"),
      });

      router.replace("/admin/users");
    } catch (error) {
      toast.error(tAdmin("users_detail_delete_error_title"), {
        description: getErrorMessage(error, tAdmin("users_detail_delete_error_description")),
      });
    } finally {
      setPendingAction(null);
    }
  }

  if (detailQuery.isInitialLoading) {
    return <DetailSkeleton />;
  }

  if (detailQuery.isError || !user || !profile) {
    return (
      <section className="grid min-w-0 gap-4">
        <div className="rounded-[1.75rem] border border-[#4A1616] bg-[linear-gradient(180deg,#160707_0%,#0C0A0A_100%)] p-6 md:p-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 size-5 shrink-0 text-[#ff6b6b]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold tracking-tight text-white">
                {tAdmin("users_detail_error_title")}
              </p>
              <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#FFC5C5]">
                {detailQuery.error instanceof Error && detailQuery.error.message
                  ? detailQuery.error.message
                  : tAdmin("users_detail_error_description")}
              </p>
              <div className="mt-6 flex flex-col gap-3 md:flex-row">
                <Button
                  type="button"
                  onClick={() => detailQuery.refetch()}
                  className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                >
                  <RefreshCcw className="size-4" aria-hidden="true" />
                  {tAdmin("users_detail_refetch")}
                </Button>
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                >
                  <Link href="/admin/users">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {tAdmin("users_back_to_list")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="grid min-w-0 gap-4"
      >
        <header className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <Button
                asChild
                type="button"
                variant="ghost"
                className="h-auto rounded-full border border-[#202020] bg-[#0C0C0C] px-4 py-2 font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#C9C9C9] hover:bg-[#111111]"
              >
                <Link href="/admin/users">
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  {tAdmin("users_back_to_list")}
                </Link>
              </Button>

              <p className="font-sans mt-4 text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
                {tAdmin("panel_label")}
              </p>
              <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                {profile.fullName}
              </h1>
              <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
                {tAdmin("users_detail_description")}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <UserRoleBadge
                  role={profile.role}
                  label={formatAdminUserRole(profile.role, tAdmin)}
                />
                <AccountStateBadge
                  verified={profile.isVerified}
                  label={
                    profile.isVerified
                      ? tAdmin("users_status_verified")
                      : tAdmin("users_status_unverified")
                  }
                />
                <AccountStateBadge
                  active={profile.isActive}
                  label={
                    profile.isActive
                      ? tAdmin("users_status_active")
                      : tAdmin("users_status_inactive")
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:min-w-[22rem]">
              <DetailValue label={tAdmin("users_table_email")} value={profile.email} />
              <DetailValue
                label={tAdmin("users_table_joined")}
                value={formatDate(profile.createdAt, locale, tAdmin("users_joined_unavailable"))}
              />
              <DetailValue
                label={tAdmin("users_detail_updated")}
                value={formatDateTime(profile.updatedAt, locale, tAdmin("users_detail_unknown"))}
              />
              <DetailValue
                label={tAdmin("users_detail_preferred_language")}
                value={profile.preferredLanguage.toUpperCase()}
              />
            </div>
          </div>
        </header>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.95fr)]">
          <div className="grid min-w-0 gap-4">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label={tAdmin("users_detail_metric_orders")}
                value={summaryValues.orders}
                hint={tAdmin("users_detail_section_orders")}
              />
              <MetricTile
                label={tAdmin("users_detail_metric_books")}
                value={summaryValues.books}
                hint={tAdmin("users_detail_section_books")}
              />
              <MetricTile
                label={tAdmin("users_detail_metric_payments")}
                value={summaryValues.payments}
                hint={tAdmin("users_detail_section_payments")}
              />
              <MetricTile
                label={tAdmin("users_detail_metric_profile")}
                value={summaryValues.profileStatus}
                hint={tAdmin("users_detail_metric_profile_hint")}
              />
            </section>

            <InfoCard
              eyebrow={tAdmin("users_detail_section_orders_eyebrow")}
              title={tAdmin("users_detail_section_orders")}
              description={tAdmin("users_detail_section_orders_description")}
            >
              {user.orders.length === 0 ? (
                <p className="font-sans text-sm text-[#8F8F8F]">
                  {tAdmin("users_detail_no_orders")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {user.orders.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-display text-2xl font-semibold tracking-tight text-white">
                            {order.orderNumber}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(order.orderType)}
                            </span>
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(order.orderStatus)}
                            </span>
                            {order.bookStatus ? (
                              <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                                {humanizeAdminOrderStatus(order.bookStatus)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <Button
                          asChild
                          type="button"
                          variant="outline"
                          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                        >
                          <Link href={order.detailUrl}>
                            <span>{tAdmin("users_detail_open_order")}</span>
                            <span className="sr-only"> {order.orderNumber}</span>
                          </Link>
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <DetailValue
                          label={tAdmin("users_detail_order_package")}
                          value={order.package.name}
                        />
                        <DetailValue
                          label={tAdmin("users_detail_order_total")}
                          value={formatCurrency(order.totalAmount, order.currency, locale, "—")}
                        />
                        <DetailValue
                          label={tAdmin("users_detail_order_created")}
                          value={formatDateTime(
                            order.createdAt,
                            locale,
                            tAdmin("users_detail_unknown")
                          )}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("users_detail_section_books_eyebrow")}
              title={tAdmin("users_detail_section_books")}
              description={tAdmin("users_detail_section_books_description")}
            >
              {user.books.length === 0 ? (
                <p className="font-sans text-sm text-[#8F8F8F]">
                  {tAdmin("users_detail_no_books")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {user.books.map((book) => (
                    <article
                      key={book.id}
                      className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-display text-2xl font-semibold tracking-tight text-white">
                            {book.title ?? tAdmin("books_title_untitled")}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminBookStatus(book.status)}
                            </span>
                            {book.productionStatus ? (
                              <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                                {humanizeAdminBookStatus(book.productionStatus)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 md:flex-row">
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                          >
                            <Link href={book.detailUrl}>
                              <span>{tAdmin("users_detail_open_book")}</span>
                              <span className="sr-only">
                                {" "}
                                {book.title ?? tAdmin("books_title_untitled")}
                              </span>
                            </Link>
                          </Button>
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                          >
                            <Link href={book.orderDetailUrl}>
                              <span>{tAdmin("users_detail_open_order")}</span>
                              <span className="sr-only"> {book.orderNumber}</span>
                            </Link>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <DetailValue
                          label={tAdmin("books_table_order_ref")}
                          value={book.orderNumber}
                        />
                        <DetailValue
                          label={tAdmin("users_detail_book_created")}
                          value={formatDateTime(
                            book.createdAt,
                            locale,
                            tAdmin("users_detail_unknown")
                          )}
                        />
                        <DetailValue
                          label={tAdmin("users_detail_book_updated")}
                          value={formatDateTime(
                            book.updatedAt,
                            locale,
                            tAdmin("users_detail_unknown")
                          )}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("users_detail_section_payments_eyebrow")}
              title={tAdmin("users_detail_section_payments")}
              description={tAdmin("users_detail_section_payments_description")}
            >
              {user.payments.length === 0 ? (
                <p className="font-sans text-sm text-[#8F8F8F]">
                  {tAdmin("users_detail_no_payments")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {user.payments.map((payment) => (
                    <article
                      key={payment.id}
                      className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(payment.provider)}
                            </span>
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(payment.type)}
                            </span>
                            <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                              {humanizeAdminOrderStatus(payment.status)}
                            </span>
                          </div>
                          <p className="font-display mt-3 text-2xl font-semibold tracking-tight text-white">
                            {formatCurrency(payment.amount, payment.currency, locale, "—")}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 md:flex-row">
                          {payment.orderDetailUrl ? (
                            <Button
                              asChild
                              type="button"
                              variant="outline"
                              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                            >
                              <Link href={payment.orderDetailUrl}>
                                <span>{tAdmin("users_detail_open_order")}</span>
                                <span className="sr-only">
                                  {" "}
                                  {payment.orderNumber ?? payment.providerRef ?? payment.id}
                                </span>
                              </Link>
                            </Button>
                          ) : null}
                          {payment.receiptUrl ? (
                            <ExternalResourceLink
                              href={payment.receiptUrl}
                              label={tAdmin("users_detail_open_receipt")}
                              srOnlyContext={
                                payment.orderNumber ?? payment.providerRef ?? payment.id
                              }
                            />
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <DetailValue
                          label={tAdmin("users_detail_payment_order")}
                          value={payment.orderNumber ?? tAdmin("users_detail_unknown")}
                        />
                        <DetailValue
                          label={tAdmin("users_detail_payment_provider_ref")}
                          value={payment.providerRef ?? tAdmin("users_detail_unknown")}
                        />
                        <DetailValue
                          label={tAdmin("users_detail_payment_created")}
                          value={formatDateTime(
                            payment.createdAt,
                            locale,
                            tAdmin("users_detail_unknown")
                          )}
                        />
                        <DetailValue
                          label={tAdmin("users_detail_payment_approved")}
                          value={formatDateTime(
                            payment.approvedAt,
                            locale,
                            tAdmin("users_detail_unknown")
                          )}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </InfoCard>
          </div>

          <aside className="grid min-w-0 gap-4 self-start">
            <InfoCard
              eyebrow={tAdmin("users_detail_section_management_eyebrow")}
              title={tAdmin("users_detail_section_management")}
              description={tAdmin("users_detail_section_management_description")}
            >
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor={roleSelectId}
                    className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                  >
                    {tAdmin("users_detail_role_label")}
                  </label>
                  <select
                    id={roleSelectId}
                    value={roleDraft}
                    onChange={(event) => setRoleDraft(event.target.value as UserRoleValue)}
                    aria-label={tAdmin("users_detail_role_label")}
                    disabled={isSavePending}
                    className="min-h-11 w-full rounded-2xl border border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white outline-none transition-colors duration-150 focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
                  >
                    {ADMIN_USER_ROLE_OPTIONS.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>
                        {formatAdminUserRole(roleOption, tAdmin)}
                      </option>
                    ))}
                  </select>
                </div>

                <ManagementSwitchRow
                  titleId={verifiedSwitchTitleId}
                  title={tAdmin("users_detail_verified_label")}
                  description={tAdmin("users_detail_verified_description")}
                  checked={verifiedDraft}
                  disabled={isSavePending}
                  onCheckedChange={setVerifiedDraft}
                />

                <ManagementSwitchRow
                  titleId={deactivateSwitchTitleId}
                  title={tAdmin("users_detail_deactivate_label")}
                  description={
                    profile.isActive
                      ? tAdmin("users_detail_deactivate_description")
                      : tAdmin("users_detail_deactivate_locked")
                  }
                  checked={!profile.isActive}
                  disabled={!profile.isActive || isDeactivatePending}
                  onCheckedChange={(checked) => {
                    if (checked && profile.isActive && !isDeactivatePending) {
                      setIsDeactivateDialogOpen(true);
                    }
                  }}
                />

                {!profile.isActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReactivate}
                    disabled={isReactivatePending}
                    className="min-h-11 w-full rounded-full border-[#1f5d36] bg-[#0d1e14] px-5 font-sans text-sm font-medium text-[#8ef0bb] hover:border-[#267447] hover:bg-[#11261a]"
                  >
                    {isReactivatePending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("users_action_reactivating")}
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-4" aria-hidden="true" />
                        {tAdmin("users_action_reactivate")}
                      </>
                    )}
                  </Button>
                ) : null}

                <p className="font-sans text-sm leading-6 text-[#8F8F8F]">
                  {tAdmin("users_detail_management_hint")}
                </p>

                {latestAuditSummary ? (
                  <div
                    aria-live="polite"
                    className="rounded-[1.25rem] border border-[#1E3A5F] bg-[#08111D] p-4"
                  >
                    <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#6EA8E8]">
                      {tAdmin("users_detail_latest_audit")}
                    </p>
                    <p className="font-sans mt-2 text-sm leading-6 text-[#D6E9FF]">
                      {buildAuditDescription({
                        action: latestAuditSummary.action,
                        recordedAt: latestAuditSummary.recordedAt,
                        locale,
                        tAdmin,
                      })}
                    </p>
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={handleSaveManagement}
                  disabled={!hasManagementChanges || isSavePending}
                  className="min-h-11 w-full rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8] disabled:bg-[#1C1C1C] disabled:text-[#7D7D7D]"
                >
                  {isSavePending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      {tAdmin("users_detail_saving")}
                    </>
                  ) : (
                    tAdmin("users_detail_save")
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={isDeletePending}
                  className="min-h-11 w-full rounded-full border-[#5E1E1E] bg-[#1A0D0D] px-5 font-sans text-sm font-medium text-[#FFB3B3] hover:border-[#7A2727] hover:bg-[#220F0F]"
                >
                  {isDeletePending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      {tAdmin("users_detail_deleting")}
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" aria-hidden="true" />
                      {tAdmin("users_detail_delete")}
                    </>
                  )}
                </Button>
              </div>
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("users_detail_section_profile_eyebrow")}
              title={tAdmin("users_detail_section_profile")}
              description={tAdmin("users_detail_section_profile_description")}
            >
              <div className="space-y-4">
                <div className="grid gap-3">
                  <DetailValue
                    label={tAdmin("users_detail_first_name")}
                    value={profile.firstName}
                  />
                  <DetailValue
                    label={tAdmin("users_detail_last_name")}
                    value={profile.lastName ?? tAdmin("users_detail_unknown")}
                  />
                  <DetailValue
                    label={tAdmin("users_detail_phone")}
                    value={profile.phoneNumber ?? tAdmin("users_detail_unknown")}
                  />
                  <DetailValue
                    label={tAdmin("users_detail_whatsapp")}
                    value={profile.whatsAppNumber ?? tAdmin("users_detail_unknown")}
                  />
                  <DetailValue
                    label={tAdmin("users_detail_website")}
                    value={profile.websiteUrl ?? tAdmin("users_detail_unknown")}
                  />
                </div>

                <div className="rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("users_detail_bio")}
                  </p>
                  <p className="font-sans mt-3 text-sm leading-6 text-white">
                    {profile.bio ?? tAdmin("users_detail_no_bio")}
                  </p>
                </div>

                <div className="rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("users_detail_purchase_links")}
                  </p>
                  {profile.purchaseLinks.length === 0 ? (
                    <p className="font-sans mt-3 text-sm leading-6 text-[#8F8F8F]">
                      {tAdmin("users_detail_no_purchase_links")}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profile.purchaseLinks.map((link) => (
                        <ExternalResourceLink
                          key={`${link.label}-${link.url}`}
                          href={link.url}
                          label={link.label}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("users_detail_social_links")}
                  </p>
                  {profile.socialLinks.length === 0 ? (
                    <p className="font-sans mt-3 text-sm leading-6 text-[#8F8F8F]">
                      {tAdmin("users_detail_no_social_links")}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profile.socialLinks.map((link) => (
                        <ExternalResourceLink
                          key={`${link.platform}-${link.url}`}
                          href={link.url}
                          label={link.platform}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                    {tAdmin("users_detail_notification_preferences")}
                  </p>
                  <div className="mt-3 grid gap-3">
                    <DetailValue
                      label={tAdmin("users_detail_notification_email")}
                      value={
                        profile.notificationPreferences.email
                          ? tAdmin("users_detail_enabled")
                          : tAdmin("users_detail_disabled")
                      }
                    />
                    <DetailValue
                      label={tAdmin("users_detail_notification_whatsapp")}
                      value={
                        profile.notificationPreferences.whatsApp
                          ? tAdmin("users_detail_enabled")
                          : tAdmin("users_detail_disabled")
                      }
                    />
                    <DetailValue
                      label={tAdmin("users_detail_notification_in_app")}
                      value={
                        profile.notificationPreferences.inApp
                          ? tAdmin("users_detail_enabled")
                          : tAdmin("users_detail_disabled")
                      }
                    />
                  </div>
                </div>
              </div>
            </InfoCard>
          </aside>
        </div>
      </motion.section>

      <Dialog
        open={isDeactivateDialogOpen}
        onOpenChange={(open) => {
          if (!isDeactivatePending) {
            setIsDeactivateDialogOpen(open);
          }
        }}
      >
        <DialogContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] overflow-y-auto rounded-[1.5rem] border border-[#1D1D1D] bg-[#0B0B0B] p-6 text-white md:h-auto md:max-h-[calc(100dvh-4rem)] md:max-w-xl md:rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold tracking-tight text-white">
              {tAdmin("users_detail_deactivate_dialog_title")}
            </DialogTitle>
            <DialogDescription className="font-sans text-sm leading-6 text-[#B4B4B4]">
              {tAdmin("users_detail_deactivate_dialog_description")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2 md:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={isDeactivatePending}
              onClick={() => setIsDeactivateDialogOpen(false)}
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
            >
              {tAdmin("users_detail_deactivate_cancel")}
            </Button>
            <Button
              type="button"
              disabled={isDeactivatePending}
              onClick={handleDeactivate}
              className="min-h-11 rounded-full bg-[#A32020] px-5 font-sans text-sm font-medium text-white hover:bg-[#8d1a1a]"
            >
              {isDeactivatePending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {tAdmin("users_detail_deactivating")}
                </>
              ) : (
                tAdmin("users_detail_deactivate_confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeletePending) {
            setIsDeleteDialogOpen(open);
          }
        }}
      >
        <DialogContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] overflow-y-auto rounded-[1.5rem] border border-[#3E1414] bg-[#120909] p-6 text-white md:h-auto md:max-h-[calc(100dvh-4rem)] md:max-w-xl md:rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold tracking-tight text-white">
              {tAdmin("users_detail_delete_dialog_title")}
            </DialogTitle>
            <DialogDescription className="font-sans text-sm leading-6 text-[#FFCFCF]">
              {tAdmin("users_detail_delete_dialog_description")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2 md:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={isDeletePending}
              onClick={() => setIsDeleteDialogOpen(false)}
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
            >
              {tAdmin("users_detail_delete_cancel")}
            </Button>
            <Button
              type="button"
              disabled={isDeletePending}
              onClick={handleDeleteUser}
              className="min-h-11 rounded-full bg-[#A32020] px-5 font-sans text-sm font-medium text-white hover:bg-[#8d1a1a]"
            >
              {isDeletePending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {tAdmin("users_detail_deleting")}
                </>
              ) : (
                tAdmin("users_detail_delete_confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
