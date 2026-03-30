"use client";

import type {
  AdminOrderDetail,
  AdminOrderPaymentDetail,
  AdminPaymentSortField,
  AdminPaymentsListResponse,
  AdminRefundRequestInput,
  PaymentProvider,
} from "@bookprinta/shared";
import {
  type ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  RefreshCw,
  Search,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { lazy, memo, Suspense, useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_PAYMENT_PROVIDER_OPTIONS,
  ADMIN_PAYMENT_STATUS_OPTIONS,
  DEFAULT_ADMIN_PAYMENT_SORT_BY,
  DEFAULT_ADMIN_PAYMENT_SORT_DIRECTION,
  humanizeAdminPaymentValue,
  useAdminPaymentsFilters,
} from "@/hooks/use-admin-payments-filters";
import { useAdminOrderDetail } from "@/hooks/useAdminOrderDetail";
import { useAdminPaymentRefundMutation } from "@/hooks/useAdminPaymentActions";
import { useAdminPayments } from "@/hooks/useAdminPayments";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { PaymentReceiptPreviewTarget } from "./PaymentReceiptLightbox";

const ALL_PAYMENTS_CARD_SKELETON_KEYS = [
  "all-payments-card-1",
  "all-payments-card-2",
  "all-payments-card-3",
] as const;

const ALL_PAYMENTS_ROW_SKELETON_KEYS = [
  "all-payments-row-1",
  "all-payments-row-2",
  "all-payments-row-3",
  "all-payments-row-4",
] as const;

const LazyAdminOrderRefundModal = lazy(async () => {
  const module = await import("../orders/[id]/AdminOrderRefundModal");
  return { default: module.AdminOrderRefundModal };
});

type AdminPaymentRow = AdminPaymentsListResponse["items"][number];

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatAdminDate(
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
  }).format(parsedDate);
}

function formatAdminDateTime(
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

function formatAdminCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return fallback;

  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: (currency || "NGN").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return fallback;
  }
}

function formatAgeMinutesLabel(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getFilterControlClass(isActive: boolean): string {
  return cn(
    "min-h-11 rounded-full border bg-[#080808] px-4 font-sans text-sm text-white transition-colors duration-150 outline-none",
    "placeholder:text-[#6f6f6f] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25",
    isActive
      ? "border-[#007eff]/65 shadow-[0_0_0_1px_rgba(0,126,255,0.25)]"
      : "border-[#2A2A2A] hover:border-[#3A3A3A]"
  );
}

function formatDateRangeLabel(params: {
  dateFrom: string;
  dateTo: string;
  locale: string;
  placeholder: string;
}): string {
  const fromLabel = params.dateFrom
    ? formatAdminDate(params.dateFrom, params.locale, params.placeholder)
    : "";
  const toLabel = params.dateTo
    ? formatAdminDate(params.dateTo, params.locale, params.placeholder)
    : "";

  if (fromLabel && toLabel) {
    return `${fromLabel} - ${toLabel}`;
  }

  if (fromLabel) return `${fromLabel} -`;
  if (toLabel) return `- ${toLabel}`;
  return params.placeholder;
}

function resolvePaymentUserName(row: AdminPaymentRow, fallback: string): string {
  return row.payerName || row.customer.fullName || row.payerEmail || row.customer.email || fallback;
}

function resolvePaymentUserEmail(row: AdminPaymentRow, fallback: string): string {
  return row.payerEmail || row.customer.email || fallback;
}

function buildReceiptPreviewTarget(params: {
  row: AdminPaymentRow;
  locale: string;
  payerFallback: string;
  amountFallback: string;
  dateFallback: string;
}): PaymentReceiptPreviewTarget | null {
  if (!params.row.receiptUrl) return null;

  return {
    receiptUrl: params.row.receiptUrl,
    payerName: resolvePaymentUserName(params.row, params.payerFallback),
    orderReference: params.row.orderReference,
    amountLabel: formatAdminCurrency(
      params.row.amount,
      params.row.currency,
      params.locale,
      params.amountFallback
    ),
    receivedAtLabel: formatAdminDateTime(params.row.createdAt, params.locale, params.dateFallback),
  };
}

function getStatusBadgeClass(status: string): string {
  if (status === "SUCCESS") return "border-[#14532D] bg-[#0D1F12] text-[#86EFAC]";
  if (status === "AWAITING_APPROVAL") return "border-[#4A3915] bg-[#171108] text-[#FDE68A]";
  if (status === "FAILED") return "border-[#4A1D22] bg-[#16090B] text-[#FCA5A5]";
  if (status === "REFUNDED") return "border-[#1E3A5F] bg-[#08111E] text-[#93C5FD]";
  return "border-[#2A2A2A] bg-[#101010] text-[#D0D0D0]";
}

function getProviderBadgeClass(provider: PaymentProvider): string {
  if (provider === "BANK_TRANSFER") return "border-[#2A4C69] bg-[#09131D] text-[#9BD2FF]";
  if (provider === "PAYSTACK") return "border-[#174235] bg-[#0B1915] text-[#86EFAC]";
  if (provider === "STRIPE") return "border-[#3E286B] bg-[#120C20] text-[#C4B5FD]";
  return "border-[#5A2E16] bg-[#1B0F09] text-[#FDBA74]";
}

function getPendingCheckoutBadgeClass(): string {
  return "border-[#5A2E16] bg-[#1B0F09] text-[#FDBA74]";
}

function resolvePendingCheckoutStaleLabel(
  row: AdminPaymentRow,
  tAdmin: ReturnType<typeof useTranslations>
): string | null {
  if (!row.pendingCheckout?.isStale) {
    return null;
  }

  return tAdmin("payments_pending_checkout_stale", {
    age: formatAgeMinutesLabel(row.pendingCheckout.ageMinutes),
  });
}

function resolveRefundActionLabel(
  row: AdminPaymentRow,
  tAdmin: ReturnType<typeof useTranslations>
) {
  return row.refundability.processingMode === "manual"
    ? tAdmin("payments_action_manual_refund")
    : tAdmin("payments_action_refund");
}

function SortIndicator({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) {
    return <ArrowUpDown className="size-3.5 text-[#6f6f6f]" aria-hidden="true" />;
  }

  return direction === "asc" ? (
    <ArrowUp className="size-3.5 text-[#007eff]" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3.5 text-[#007eff]" aria-hidden="true" />
  );
}

function resolveAriaSort(
  columnId: AdminPaymentSortField,
  sortBy: AdminPaymentSortField,
  sortDirection: "asc" | "desc"
): "ascending" | "descending" | "none" {
  if (sortBy !== columnId) {
    return "none";
  }

  return sortDirection === "asc" ? "ascending" : "descending";
}

type SortableHeaderProps = {
  label: string;
  columnId: AdminPaymentSortField;
  sortBy: AdminPaymentSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminPaymentSortField) => void;
  className?: string;
};

function SortableHeader({
  label,
  columnId,
  sortBy,
  sortDirection,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = sortBy === columnId;

  return (
    <button
      type="button"
      onClick={() => onSort(columnId)}
      className={cn(
        "inline-flex items-center gap-2 font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
        className
      )}
    >
      <span>{label}</span>
      <SortIndicator active={isActive} direction={sortDirection} />
    </button>
  );
}

type DateRangePickerProps = {
  dateFrom: string;
  dateTo: string;
  locale: string;
  label: string;
  placeholder: string;
  fromLabel: string;
  toLabel: string;
  clearLabel: string;
  onChange: (range: { dateFrom?: string; dateTo?: string }) => void;
};

function AdminPaymentsDateRangePicker({
  dateFrom,
  dateTo,
  locale,
  label,
  placeholder,
  fromLabel,
  toLabel,
  clearLabel,
  onChange,
}: DateRangePickerProps) {
  const hasValue = Boolean(dateFrom || dateTo);
  const triggerId = useId();
  const fromInputId = useId();
  const toInputId = useId();

  return (
    <div className="min-w-0">
      <label
        htmlFor={triggerId}
        className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
      >
        {label}
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={triggerId}
            type="button"
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-3 rounded-full border bg-[#080808] px-4 text-left font-sans text-sm text-white transition-colors duration-150",
              "focus-visible:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]/25",
              hasValue
                ? "border-[#007eff]/65 shadow-[0_0_0_1px_rgba(0,126,255,0.25)]"
                : "border-[#2A2A2A] hover:border-[#3A3A3A]"
            )}
          >
            <span className={cn(hasValue ? "text-white" : "text-[#6f6f6f]")}>
              {formatDateRangeLabel({
                dateFrom,
                dateTo,
                locale,
                placeholder,
              })}
            </span>
            <CalendarDays className="size-4 shrink-0 text-[#007eff]" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(22rem,calc(100vw-2rem))] rounded-[1.25rem] border-[#2A2A2A] bg-[#0B0B0B] p-4 text-white"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor={fromInputId}
                className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
              >
                {fromLabel}
              </label>
              <Input
                id={fromInputId}
                type="date"
                value={dateFrom}
                onChange={(event) => onChange({ dateFrom: event.target.value, dateTo })}
                className={getFilterControlClass(Boolean(dateFrom))}
              />
            </div>
            <div>
              <label
                htmlFor={toInputId}
                className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
              >
                {toLabel}
              </label>
              <Input
                id={toInputId}
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => onChange({ dateFrom, dateTo: event.target.value })}
                className={getFilterControlClass(Boolean(dateTo))}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange({ dateFrom: "", dateTo: "" })}
              className="min-h-10 w-full rounded-full border-[#2A2A2A] bg-[#080808] font-sans text-sm text-white hover:border-[#007eff] hover:bg-[#101010]"
            >
              {clearLabel}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type AllPaymentsFilterBarProps = {
  locale: string;
  searchDraft: string;
  status: string;
  provider: string;
  dateFrom: string;
  dateTo: string;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  onSearchDraftChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onDateRangeChange: (range: { dateFrom?: string; dateTo?: string }) => void;
  onClearFilters: () => void;
};

function AllPaymentsFilterBar({
  locale,
  searchDraft,
  status,
  provider,
  dateFrom,
  dateTo,
  activeFilterCount,
  hasActiveFilters,
  onSearchDraftChange,
  onStatusChange,
  onProviderChange,
  onDateRangeChange,
  onClearFilters,
}: AllPaymentsFilterBarProps) {
  const tAdmin = useTranslations("admin");
  const searchInputId = useId();
  const statusSelectId = useId();
  const providerSelectId = useId();

  return (
    <section className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
            {tAdmin("payments_all_eyebrow")}
          </p>
          <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {tAdmin("payments_all_title")}
          </h2>
          <p className="font-sans mt-2 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
            {tAdmin("payments_all_description")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 font-sans text-xs font-medium",
              hasActiveFilters
                ? "border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]"
                : "border-[#2A2A2A] bg-[#101010] text-[#b4b4b4]"
            )}
          >
            {hasActiveFilters
              ? tAdmin("payments_filters_active", { count: activeFilterCount })
              : tAdmin("payments_filters_idle")}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="min-h-10 rounded-full border-[#2A2A2A] bg-[#080808] px-4 font-sans text-xs font-medium text-white hover:border-[#007eff] hover:bg-[#101010] disabled:opacity-45"
          >
            {tAdmin("payments_filters_clear")}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <label
            htmlFor={searchInputId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("payments_filters_search_label")}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#007eff]"
              aria-hidden="true"
            />
            <Input
              id={searchInputId}
              value={searchDraft}
              onChange={(event) => onSearchDraftChange(event.target.value)}
              placeholder={tAdmin("payments_filters_search_placeholder")}
              aria-label={tAdmin("payments_filters_search_label")}
              className={cn(
                getFilterControlClass(Boolean(searchDraft)),
                "pl-11 text-white md:text-sm"
              )}
            />
          </div>
        </div>

        <div className="min-w-0">
          <label
            htmlFor={statusSelectId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("payments_filters_status_label")}
          </label>
          <select
            id={statusSelectId}
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            className={cn(getFilterControlClass(Boolean(status)), "w-full appearance-none")}
            aria-label={tAdmin("payments_filters_status_label")}
          >
            <option value="">{tAdmin("payments_filters_all_statuses")}</option>
            {ADMIN_PAYMENT_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {humanizeAdminPaymentValue(statusOption)}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor={providerSelectId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("payments_filters_provider_label")}
          </label>
          <select
            id={providerSelectId}
            value={provider}
            onChange={(event) => onProviderChange(event.target.value)}
            className={cn(getFilterControlClass(Boolean(provider)), "w-full appearance-none")}
            aria-label={tAdmin("payments_filters_provider_label")}
          >
            <option value="">{tAdmin("payments_filters_all_providers")}</option>
            {ADMIN_PAYMENT_PROVIDER_OPTIONS.map((providerOption) => (
              <option key={providerOption} value={providerOption}>
                {humanizeAdminPaymentValue(providerOption)}
              </option>
            ))}
          </select>
        </div>

        <AdminPaymentsDateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          locale={locale}
          label={tAdmin("payments_filters_date_label")}
          placeholder={tAdmin("payments_filters_date_placeholder")}
          fromLabel={tAdmin("payments_filters_date_from")}
          toLabel={tAdmin("payments_filters_date_to")}
          clearLabel={tAdmin("payments_filters_date_clear")}
          onChange={onDateRangeChange}
        />
      </div>
    </section>
  );
}

function AllPaymentsSkeletons() {
  return (
    <DashboardResponsiveDataRegion
      mobileCards={ALL_PAYMENTS_CARD_SKELETON_KEYS.map((key) => (
        <div key={key} className="rounded-[1.5rem] border border-[#1D1D1D] bg-[#090909] p-4">
          <Skeleton className="h-4 w-24 bg-[#171717]" />
          <Skeleton className="mt-3 h-12 w-32 bg-[#171717]" />
          <Skeleton className="mt-4 h-20 rounded-[1.25rem] bg-[#121212]" />
          <Skeleton className="mt-4 h-12 rounded-full bg-[#121212]" />
        </div>
      ))}
      desktopTable={
        <DashboardTableViewport minWidthClassName="md:min-w-[1080px]">
          <div className="space-y-3 p-4">
            {ALL_PAYMENTS_ROW_SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-20 rounded-[1rem] bg-[#121212]" />
            ))}
          </div>
        </DashboardTableViewport>
      }
    />
  );
}

function AllPaymentsEmptyState() {
  const tAdmin = useTranslations("admin");

  return (
    <section className="flex min-h-[280px] flex-col items-center justify-center rounded-[1.5rem] border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <CreditCard className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h3 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {tAdmin("payments_empty_title")}
      </h3>
      <p className="font-sans mt-2 max-w-md text-sm leading-6 text-[#d0d0d0] md:text-base">
        {tAdmin("payments_empty_description")}
      </p>
    </section>
  );
}

function AllPaymentsErrorState({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");

  return (
    <section className="rounded-[1.5rem] border border-[#ef4444]/45 bg-[#111111] p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-[#ef4444]" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold text-white">
            {tAdmin("payments_error_title")}
          </h3>
          <p className="font-sans mt-1 text-sm leading-6 text-[#d0d0d0]">{message}</p>
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-4 min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-5 font-sans text-sm text-white hover:bg-[#101010]"
          >
            {isRetrying ? tCommon("loading") : tCommon("retry")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function AllPaymentsPagination({
  currentPage,
  totalItems,
  limit,
  canPrevious,
  canNext,
  loading,
  onPrevious,
  onNext,
}: {
  currentPage: number;
  totalItems: number;
  limit: number;
  canPrevious: boolean;
  canNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const tAdmin = useTranslations("admin");
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / Math.max(limit, 1)) : 0;

  return (
    <nav
      aria-label={tAdmin("payments_pagination_aria")}
      className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
        {totalPages > 0
          ? tAdmin("payments_pagination_page_of", {
              page: currentPage,
              totalPages,
            })
          : tAdmin("payments_pagination_page", { page: currentPage })}
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious || loading}
          variant="outline"
          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {tAdmin("payments_pagination_previous")}
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          variant="outline"
          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
        >
          {tAdmin("payments_pagination_next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

type AllPaymentsRowActionsProps = {
  row: AdminPaymentRow;
  locale: string;
  onViewReceipt: (preview: PaymentReceiptPreviewTarget) => void;
  onRefund: (row: AdminPaymentRow) => void;
  refundLoading: boolean;
};

function AllPaymentsRowActions({
  row,
  locale,
  onViewReceipt,
  onRefund,
  refundLoading,
}: AllPaymentsRowActionsProps) {
  const tAdmin = useTranslations("admin");
  const canRefund = row.refundability.isRefundable && Boolean(row.orderId);
  const preview = buildReceiptPreviewTarget({
    row,
    locale,
    payerFallback: tAdmin("payments_pending_payer_unknown"),
    amountFallback: tAdmin("payments_total_unavailable"),
    dateFallback: tAdmin("payments_date_unavailable"),
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {preview ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => onViewReceipt(preview)}
          className="min-h-10 rounded-full border-[#2A2A2A] bg-[#090909] px-3 font-sans text-xs text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-haspopup="dialog"
        >
          {tAdmin("payments_action_view_receipt")}
        </Button>
      ) : null}

      {row.orderId ? (
        <Button
          type="button"
          variant="outline"
          asChild
          className="min-h-10 rounded-full border-[#2A2A2A] bg-[#090909] px-3 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#101010]"
        >
          <Link href={`/admin/orders/${row.orderId}`}>{tAdmin("payments_action_view_order")}</Link>
        </Button>
      ) : null}

      <Button
        type="button"
        onClick={() => onRefund(row)}
        disabled={!canRefund || refundLoading}
        className={cn(
          "min-h-10 rounded-full px-3 font-sans text-xs font-bold text-white",
          canRefund
            ? "bg-[#007eff] hover:bg-[#0069d9]"
            : "cursor-not-allowed bg-[#1A1A1A] text-[#777777]"
        )}
        title={
          !canRefund
            ? row.refundability.reason || tAdmin("payments_action_refund_unavailable")
            : undefined
        }
      >
        {refundLoading
          ? tAdmin("payments_action_loading_refund")
          : canRefund
            ? resolveRefundActionLabel(row, tAdmin)
            : tAdmin("payments_action_refund_unavailable")}
      </Button>
    </div>
  );
}

function AllPaymentsMobileCards({
  items,
  locale,
  onViewReceipt,
  onRefund,
  refundIntentId,
}: {
  items: AdminPaymentRow[];
  locale: string;
  onViewReceipt: (preview: PaymentReceiptPreviewTarget) => void;
  onRefund: (row: AdminPaymentRow) => void;
  refundIntentId: string | null;
}) {
  const tAdmin = useTranslations("admin");

  return (
    <>
      {items.map((row) => {
        const userName = resolvePaymentUserName(row, tAdmin("payments_pending_payer_unknown"));
        const userEmail = resolvePaymentUserEmail(row, tAdmin("payments_user_email_missing"));
        const stalePendingLabel = resolvePendingCheckoutStaleLabel(row, tAdmin);
        const amount = formatAdminCurrency(
          row.amount,
          row.currency,
          locale,
          tAdmin("payments_total_unavailable")
        );
        const createdAt = formatAdminDate(
          row.createdAt,
          locale,
          tAdmin("payments_date_unavailable")
        );

        return (
          <article
            key={row.id}
            className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-[#7D7D7D]">
                  {tAdmin("payments_table_ref")}
                </p>
                <p className="mt-2 font-display text-xl font-semibold text-white">
                  {row.orderReference}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-3 py-1 font-sans text-[11px] font-medium",
                  getStatusBadgeClass(row.status)
                )}
              >
                {humanizeAdminPaymentValue(row.status)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-[#1A1A1A] bg-[#080808] p-4">
              <div>
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-[#7D7D7D]">
                  {tAdmin("payments_table_user")}
                </p>
                <p className="mt-2 font-sans text-base font-semibold text-white">{userName}</p>
                <p className="mt-1 break-all font-sans text-sm text-[#B4B4B4]">{userEmail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#2A2A2A] bg-[#101010] px-3 py-1 font-sans text-xs text-[#D0D0D0]">
                  {amount}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 font-sans text-xs",
                    getProviderBadgeClass(row.provider)
                  )}
                >
                  {humanizeAdminPaymentValue(row.provider)}
                </span>
                {stalePendingLabel ? (
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 font-sans text-xs",
                      getPendingCheckoutBadgeClass()
                    )}
                  >
                    {stalePendingLabel}
                  </span>
                ) : null}
                <span className="rounded-full border border-[#2A2A2A] bg-[#101010] px-3 py-1 font-sans text-xs text-[#D0D0D0]">
                  {createdAt}
                </span>
              </div>
              {row.refundability.reason ? (
                <p className="font-sans text-xs leading-5 text-[#8F8F8F]">
                  {row.refundability.reason}
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <AllPaymentsRowActions
                row={row}
                locale={locale}
                onViewReceipt={onViewReceipt}
                onRefund={onRefund}
                refundLoading={refundIntentId === row.id}
              />
            </div>
          </article>
        );
      })}
    </>
  );
}

function AllPaymentsDesktopTable({
  items,
  locale,
  sortBy,
  sortDirection,
  onSort,
  onViewReceipt,
  onRefund,
  refundIntentId,
}: {
  items: AdminPaymentRow[];
  locale: string;
  sortBy: AdminPaymentSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminPaymentSortField) => void;
  onViewReceipt: (preview: PaymentReceiptPreviewTarget) => void;
  onRefund: (row: AdminPaymentRow) => void;
  refundIntentId: string | null;
}) {
  const tAdmin = useTranslations("admin");

  const columns = useMemo<ColumnDef<AdminPaymentRow>[]>(
    () => [
      createColumnHelper<AdminPaymentRow>().display({
        id: "orderReference",
        header: () => (
          <SortableHeader
            label={tAdmin("payments_table_ref")}
            columnId="orderReference"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-sans text-sm font-semibold text-white">
              {row.original.orderReference}
            </p>
            <p className="mt-1 font-sans text-xs text-[#7D7D7D]">
              {row.original.providerRef || tAdmin("payments_pending_provider_ref_missing")}
            </p>
          </div>
        ),
      }),
      createColumnHelper<AdminPaymentRow>().display({
        id: "customerName",
        header: () => (
          <SortableHeader
            label={tAdmin("payments_table_user")}
            columnId="customerName"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-sans text-sm font-medium text-white">
              {resolvePaymentUserName(row.original, tAdmin("payments_pending_payer_unknown"))}
            </p>
            <p className="mt-1 truncate font-sans text-xs text-[#8f8f8f]">
              {resolvePaymentUserEmail(row.original, tAdmin("payments_user_email_missing"))}
            </p>
          </div>
        ),
      }),
      createColumnHelper<AdminPaymentRow>().display({
        id: "amount",
        header: () => (
          <SortableHeader
            label={tAdmin("payments_table_amount")}
            columnId="amount"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm font-semibold text-white">
            {formatAdminCurrency(
              row.original.amount,
              row.original.currency,
              locale,
              tAdmin("payments_total_unavailable")
            )}
          </p>
        ),
      }),
      createColumnHelper<AdminPaymentRow>().display({
        id: "provider",
        header: () => (
          <SortableHeader
            label={tAdmin("payments_table_provider")}
            columnId="provider"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex rounded-full border px-3 py-1 font-sans text-xs",
              getProviderBadgeClass(row.original.provider)
            )}
          >
            {humanizeAdminPaymentValue(row.original.provider)}
          </span>
        ),
      }),
      createColumnHelper<AdminPaymentRow>().display({
        id: "status",
        header: () => (
          <SortableHeader
            label={tAdmin("payments_table_status")}
            columnId="status"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-2">
            <span
              className={cn(
                "inline-flex rounded-full border px-3 py-1 font-sans text-xs font-medium",
                getStatusBadgeClass(row.original.status)
              )}
            >
              {humanizeAdminPaymentValue(row.original.status)}
            </span>
            {resolvePendingCheckoutStaleLabel(row.original, tAdmin) ? (
              <span
                className={cn(
                  "inline-flex rounded-full border px-3 py-1 font-sans text-xs",
                  getPendingCheckoutBadgeClass()
                )}
              >
                {resolvePendingCheckoutStaleLabel(row.original, tAdmin)}
              </span>
            ) : null}
          </div>
        ),
      }),
      createColumnHelper<AdminPaymentRow>().display({
        id: "createdAt",
        header: () => (
          <SortableHeader
            label={tAdmin("payments_table_date")}
            columnId="createdAt"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm text-[#D0D0D0]">
            {formatAdminDate(row.original.createdAt, locale, tAdmin("payments_date_unavailable"))}
          </p>
        ),
      }),
      createColumnHelper<AdminPaymentRow>().display({
        id: "actions",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("payments_table_actions")}
          </span>
        ),
        cell: ({ row }) => (
          <AllPaymentsRowActions
            row={row.original}
            locale={locale}
            onViewReceipt={onViewReceipt}
            onRefund={onRefund}
            refundLoading={refundIntentId === row.original.id}
          />
        ),
      }),
    ],
    [locale, onRefund, onSort, onViewReceipt, refundIntentId, sortBy, sortDirection, tAdmin]
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[1160px]">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-[#1D1D1D] bg-[#0A0A0A] hover:bg-[#0A0A0A]"
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.id === "actions"
                      ? undefined
                      : resolveAriaSort(header.id as AdminPaymentSortField, sortBy, sortDirection)
                  }
                  className={cn(
                    "h-12 px-4",
                    header.id === "amount" || header.id === "actions" ? "text-right" : "text-left"
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className="border-[#1D1D1D] hover:bg-[#101010]">
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    "px-4 py-4 align-top",
                    cell.column.id === "amount" || cell.column.id === "actions"
                      ? "text-right"
                      : "text-left"
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

export const AllPaymentsSection = memo(function AllPaymentsSection({
  onViewReceipt,
}: {
  onViewReceipt: (preview: PaymentReceiptPreviewTarget) => void;
}) {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const {
    status,
    provider,
    dateFrom,
    dateTo,
    q,
    cursor,
    sortBy,
    sortDirection,
    currentPage,
    activeFilterCount,
    hasActiveFilters,
    setStatus,
    setProvider,
    setSearch,
    setDateRange,
    clearFilters,
    setSort,
    goToNextCursor,
    goToPreviousCursor,
    trail,
  } = useAdminPaymentsFilters();

  const [searchDraft, setSearchDraft] = useState(q);
  const [refundIntent, setRefundIntent] = useState<AdminPaymentRow | null>(null);
  const deferredSearch = useDeferredValue(searchDraft);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (deferredSearch.trim() === q) return;
      setSearch(deferredSearch);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [deferredSearch, q, setSearch]);

  const paymentsQuery = useAdminPayments({
    cursor,
    status,
    provider,
    dateFrom,
    dateTo,
    q,
    sortBy,
    sortDirection,
  });
  const refundMutation = useAdminPaymentRefundMutation();
  const refundOrderQuery = useAdminOrderDetail({
    orderId: refundIntent?.orderId,
    enabled: Boolean(refundIntent?.orderId),
  });

  const refundOrder = refundOrderQuery.order;
  const refundPayment = useMemo<AdminOrderPaymentDetail | null>(() => {
    if (!refundIntent || !refundOrder) return null;
    return refundOrder.payments.find((payment) => payment.id === refundIntent.id) ?? null;
  }, [refundIntent, refundOrder]);

  useEffect(() => {
    if (!refundIntent || !refundOrderQuery.isError) return;

    toast.error(tAdmin("payments_refund_order_error"), {
      description:
        refundOrderQuery.error instanceof Error
          ? refundOrderQuery.error.message
          : tAdmin("payments_error_description"),
    });
    setRefundIntent(null);
  }, [refundIntent, refundOrderQuery.error, refundOrderQuery.isError, tAdmin]);

  useEffect(() => {
    if (!refundIntent || refundOrderQuery.isInitialLoading || !refundOrder || refundPayment) return;

    toast.error(tAdmin("payments_refund_payment_error"), {
      description: tAdmin("payments_error_description"),
    });
    setRefundIntent(null);
  }, [refundIntent, refundOrder, refundOrderQuery.isInitialLoading, refundPayment, tAdmin]);

  const handleSort = (columnId: AdminPaymentSortField) => {
    if (sortBy === columnId) {
      setSort(columnId, sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    const initialDirection =
      columnId === DEFAULT_ADMIN_PAYMENT_SORT_BY ? DEFAULT_ADMIN_PAYMENT_SORT_DIRECTION : "asc";
    setSort(columnId, initialDirection);
  };

  const handleRefund = (row: AdminPaymentRow) => {
    if (!row.orderId || !row.refundability.isRefundable) return;
    setRefundIntent(row);
  };

  const handleRefundSubmit = async (params: {
    paymentId: string;
    input: AdminRefundRequestInput;
  }) => {
    if (!refundIntent?.orderId) {
      throw new Error(tAdmin("payments_refund_order_error"));
    }

    return refundMutation.mutateAsync({
      paymentId: params.paymentId,
      orderId: refundIntent.orderId,
      input: params.input,
    });
  };

  const hasData = paymentsQuery.items.length > 0;
  const showPagination = hasData || paymentsQuery.data.totalItems > 0;
  const errorMessage =
    paymentsQuery.error instanceof Error && paymentsQuery.error.message.trim().length > 0
      ? paymentsQuery.error.message
      : tAdmin("payments_error_description");
  const refundIntentId =
    refundIntent && (refundOrderQuery.isInitialLoading || !refundPayment) ? refundIntent.id : null;
  const showRefundModal = Boolean(refundIntent && refundOrder && refundPayment);

  return (
    <>
      <section className="grid min-w-0 gap-4 md:gap-5">
        <AllPaymentsFilterBar
          locale={locale}
          searchDraft={searchDraft}
          status={status}
          provider={provider}
          dateFrom={dateFrom}
          dateTo={dateTo}
          activeFilterCount={activeFilterCount}
          hasActiveFilters={hasActiveFilters}
          onSearchDraftChange={setSearchDraft}
          onStatusChange={(value) => setStatus(value as typeof status)}
          onProviderChange={(value) => setProvider(value as typeof provider)}
          onDateRangeChange={setDateRange}
          onClearFilters={clearFilters}
        />

        <section className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#0A0A0A] p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#8f8f8f]">
              {tAdmin("payments_summary_label")}
            </p>
            <p className="mt-1 font-sans text-sm text-[#d0d0d0] md:text-base">
              {tAdmin("payments_summary_total", {
                shown: paymentsQuery.items.length,
                total: paymentsQuery.data.totalItems,
              })}
            </p>
          </div>
          <div aria-live="polite" className="font-sans text-xs text-[#8f8f8f] md:text-sm">
            {paymentsQuery.isPageTransitioning ? (
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin text-[#007eff]" aria-hidden="true" />
                {tAdmin("payments_loading_more")}
              </span>
            ) : null}
          </div>
        </section>

        {paymentsQuery.isInitialLoading ? <AllPaymentsSkeletons /> : null}

        {!paymentsQuery.isInitialLoading && paymentsQuery.isError && !hasData ? (
          <AllPaymentsErrorState
            message={errorMessage}
            onRetry={() => {
              void paymentsQuery.refetch();
            }}
            isRetrying={paymentsQuery.isFetching}
          />
        ) : null}

        {!paymentsQuery.isInitialLoading && !paymentsQuery.isError && !hasData ? (
          <AllPaymentsEmptyState />
        ) : null}

        {!paymentsQuery.isInitialLoading && hasData ? (
          <DashboardResponsiveDataRegion
            mobileCards={
              <AllPaymentsMobileCards
                items={paymentsQuery.items}
                locale={locale}
                onViewReceipt={onViewReceipt}
                onRefund={handleRefund}
                refundIntentId={refundIntentId}
              />
            }
            desktopTable={
              <AllPaymentsDesktopTable
                items={paymentsQuery.items}
                locale={locale}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={handleSort}
                onViewReceipt={onViewReceipt}
                onRefund={handleRefund}
                refundIntentId={refundIntentId}
              />
            }
          />
        ) : null}

        {showPagination ? (
          <AllPaymentsPagination
            currentPage={currentPage}
            totalItems={paymentsQuery.data.totalItems}
            limit={paymentsQuery.data.limit}
            canPrevious={trail.length > 0}
            canNext={Boolean(paymentsQuery.data.nextCursor)}
            loading={paymentsQuery.isFetching}
            onPrevious={goToPreviousCursor}
            onNext={() => goToNextCursor(paymentsQuery.data.nextCursor)}
          />
        ) : null}
      </section>

      {showRefundModal ? (
        <Suspense fallback={null}>
          <LazyAdminOrderRefundModal
            open={showRefundModal}
            order={(refundOrder as AdminOrderDetail | null) ?? null}
            payment={refundPayment}
            locale={locale}
            isPending={refundMutation.isPending}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                setRefundIntent(null);
              }
            }}
            onSubmit={handleRefundSubmit}
          />
        </Suspense>
      ) : null}
    </>
  );
});

AllPaymentsSection.displayName = "AllPaymentsSection";
