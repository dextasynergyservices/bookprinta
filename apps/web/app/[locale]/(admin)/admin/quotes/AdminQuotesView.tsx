"use client";

import type { AdminQuoteSortField, AdminQuotesListResponse } from "@bookprinta/shared";
import {
  type ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2Off,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_QUOTES_STATUS_OPTIONS,
  DEFAULT_ADMIN_QUOTES_SORT_BY,
  DEFAULT_ADMIN_QUOTES_SORT_DIRECTION,
  humanizeAdminQuoteStatus,
  useAdminQuotesFilters,
} from "@/hooks/use-admin-quotes-filters";
import {
  useAdminArchiveQuoteMutation,
  useAdminDeleteQuoteMutation,
  useAdminRejectQuoteMutation,
  useAdminRevokeQuotePaymentLinkMutation,
} from "@/hooks/useAdminQuoteActions";
import { useAdminQuotes } from "@/hooks/useAdminQuotes";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type AdminQuoteRow = AdminQuotesListResponse["items"][number];
type QuoteActionKind = "revoke" | "reject" | "archive" | "delete";

type QuoteActionTarget = {
  quoteId: string;
  action: QuoteActionKind;
};

const TABLE_SKELETON_ROWS = 6;
const MOBILE_SKELETON_CARDS = 4;
const ADMIN_QUOTES_TABLE_COLUMN_IDS = [
  "fullName",
  "email",
  "workingTitle",
  "bookPrintSize",
  "quantity",
  "estimate",
  "status",
  "paymentLinkStatus",
  "createdAt",
  "actions",
] as const;
const ADMIN_QUOTES_TABLE_TRANSITION_ROW_IDS = ["transition-row-1", "transition-row-2"] as const;
const ADMIN_QUOTES_MOBILE_TRANSITION_CARD_IDS = ["transition-card-1", "transition-card-2"] as const;
const ADMIN_QUOTES_MOBILE_SKELETON_CARD_IDS = [
  "mobile-skeleton-1",
  "mobile-skeleton-2",
  "mobile-skeleton-3",
  "mobile-skeleton-4",
] as const;
const ADMIN_QUOTES_TABLE_SKELETON_ROW_IDS = [
  "table-skeleton-row-1",
  "table-skeleton-row-2",
  "table-skeleton-row-3",
  "table-skeleton-row-4",
  "table-skeleton-row-5",
  "table-skeleton-row-6",
] as const;

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const SORT_FIELD_OPTIONS: AdminQuoteSortField[] = [
  "createdAt",
  "updatedAt",
  "fullName",
  "email",
  "workingTitle",
  "bookPrintSize",
  "quantity",
  "status",
  "finalPrice",
];

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

function getFilterControlClass(isActive: boolean): string {
  return cn(
    "min-h-11 rounded-full border bg-[#080808] px-4 font-sans text-sm text-white transition-colors duration-150 outline-none",
    "placeholder:text-[#6f6f6f] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25",
    isActive
      ? "border-[#007eff]/65 shadow-[0_0_0_1px_rgba(0,126,255,0.25)]"
      : "border-[#2A2A2A] hover:border-[#3A3A3A]"
  );
}

function resolveQuoteStatusLabel(
  status: AdminQuoteRow["status"],
  tAdmin: ReturnType<typeof useTranslations>
) {
  switch (status) {
    case "PENDING":
      return tAdmin("quotes_status_pending");
    case "PAYMENT_LINK_SENT":
      return tAdmin("quotes_status_payment_link_sent");
    case "PAID":
      return tAdmin("quotes_status_paid");
    case "REJECTED":
      return tAdmin("quotes_status_rejected");
    case "REVIEWING":
      return tAdmin("quotes_status_reviewing");
    case "COMPLETED":
      return tAdmin("quotes_status_completed");
    default:
      return humanizeAdminQuoteStatus(status);
  }
}

function resolvePaymentLinkStatusLabel(
  value: AdminQuoteRow["paymentLinkStatus"],
  tAdmin: ReturnType<typeof useTranslations>
) {
  switch (value) {
    case "NOT_SENT":
      return tAdmin("quotes_link_status_not_sent");
    case "SENT":
      return tAdmin("quotes_link_status_sent");
    case "EXPIRED":
      return tAdmin("quotes_link_status_expired");
    case "PAID":
      return tAdmin("quotes_link_status_paid");
    default:
      return value;
  }
}

function resolveQuoteStatusTone(status: AdminQuoteRow["status"]): string {
  switch (status) {
    case "PAID":
      return "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]";
    case "PAYMENT_LINK_SENT":
      return "border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]";
    case "REJECTED":
      return "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#ef4444]";
    case "PENDING":
      return "border-[#f59e0b]/45 bg-[#f59e0b]/15 text-[#f59e0b]";
    default:
      return "border-[#2A2A2A] bg-[#131313] text-[#d0d0d0]";
  }
}

function resolvePaymentLinkTone(status: AdminQuoteRow["paymentLinkStatus"]): string {
  switch (status) {
    case "SENT":
      return "border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]";
    case "PAID":
      return "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]";
    case "EXPIRED":
      return "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#ef4444]";
    default:
      return "border-[#2A2A2A] bg-[#131313] text-[#d0d0d0]";
  }
}

function canDeleteQuoteFromRow(quote: AdminQuoteRow): boolean {
  if (quote.actions.canDelete) return true;

  if (quote.status === "PAID" || quote.status === "COMPLETED") {
    return false;
  }

  if (quote.status === "PENDING" || quote.status === "REJECTED") {
    return true;
  }

  return quote.paymentLinkStatus !== "SENT";
}

function BadgePill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium tracking-[0.01em]",
        className
      )}
    >
      {label}
    </span>
  );
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
  columnId: AdminQuoteSortField,
  sortBy: AdminQuoteSortField,
  sortDirection: "asc" | "desc"
): "ascending" | "descending" | "none" {
  if (sortBy !== columnId) {
    return "none";
  }

  return sortDirection === "asc" ? "ascending" : "descending";
}

type SortableHeaderProps = {
  label: string;
  columnId: AdminQuoteSortField;
  sortBy: AdminQuoteSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminQuoteSortField) => void;
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

function QuoteRowActionsMenu({
  quote,
  onAction,
}: {
  quote: AdminQuoteRow;
  onAction: (target: QuoteActionTarget) => void;
}) {
  const tAdmin = useTranslations("admin");
  const canDelete = canDeleteQuoteFromRow(quote);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
          <span className="sr-only">{tAdmin("quotes_actions_menu_sr")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[13rem] border-[#2A2A2A] bg-[#0B0B0B] text-white"
      >
        <DropdownMenuItem asChild>
          <Link href={`/admin/quotes/${quote.id}`}>{tAdmin("quotes_action_view")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[#2A2A2A]" />
        <DropdownMenuItem
          disabled={!quote.actions.canRevokePaymentLink}
          onSelect={() => onAction({ quoteId: quote.id, action: "revoke" })}
        >
          <Link2Off className="size-4" aria-hidden="true" />
          {tAdmin("quotes_action_revoke_link")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!quote.actions.canReject}
          onSelect={() => onAction({ quoteId: quote.id, action: "reject" })}
        >
          <Ban className="size-4" aria-hidden="true" />
          {tAdmin("quotes_action_reject")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!quote.actions.canArchive}
          onSelect={() => onAction({ quoteId: quote.id, action: "archive" })}
        >
          <Archive className="size-4" aria-hidden="true" />
          {tAdmin("quotes_action_archive")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          onSelect={() => onAction({ quoteId: quote.id, action: "delete" })}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {tAdmin("quotes_action_delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type FilterBarProps = {
  searchDraft: string;
  status: string;
  sortBy: AdminQuoteSortField;
  sortDirection: "asc" | "desc";
  activeFilterCount: number;
  hasActiveFilters: boolean;
  onSearchDraftChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSortByChange: (value: AdminQuoteSortField) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
  onClearFilters: () => void;
};

function AdminQuotesFilterBar({
  searchDraft,
  status,
  sortBy,
  sortDirection,
  activeFilterCount,
  hasActiveFilters,
  onSearchDraftChange,
  onStatusChange,
  onSortByChange,
  onSortDirectionChange,
  onClearFilters,
}: FilterBarProps) {
  const tAdmin = useTranslations("admin");
  const searchInputId = useId();
  const statusSelectId = useId();
  const sortFieldId = useId();
  const sortDirectionId = useId();

  return (
    <section className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
            {tAdmin("panel_label")}
          </p>
          <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {tAdmin("quotes")}
          </h2>
          <p className="font-sans mt-2 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
            {tAdmin("quotes_workspace_description")}
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
              ? tAdmin("quotes_filters_active", { count: activeFilterCount })
              : tAdmin("quotes_filters_idle")}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="min-h-10 rounded-full border-[#2A2A2A] bg-[#080808] px-4 font-sans text-xs font-medium text-white hover:border-[#007eff] hover:bg-[#101010] disabled:opacity-45"
          >
            {tAdmin("quotes_filters_clear")}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStatusChange("")}
          className={cn(
            "min-h-10 rounded-full border px-4 font-sans text-xs font-medium transition-colors",
            status === ""
              ? "border-[#007eff]/65 bg-[#007eff]/15 text-[#007eff]"
              : "border-[#2A2A2A] bg-[#101010] text-[#d0d0d0] hover:border-[#3A3A3A]"
          )}
        >
          {tAdmin("quotes_filters_all_statuses")}
        </button>
        {ADMIN_QUOTES_STATUS_OPTIONS.map((statusOption) => (
          <button
            key={statusOption}
            type="button"
            onClick={() => onStatusChange(statusOption)}
            className={cn(
              "min-h-10 rounded-full border px-4 font-sans text-xs font-medium transition-colors",
              status === statusOption
                ? "border-[#007eff]/65 bg-[#007eff]/15 text-[#007eff]"
                : "border-[#2A2A2A] bg-[#101010] text-[#d0d0d0] hover:border-[#3A3A3A]"
            )}
          >
            {humanizeAdminQuoteStatus(statusOption)}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 md:col-span-2 xl:col-span-2">
          <label
            htmlFor={searchInputId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("quotes_filters_search_label")}
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
              placeholder={tAdmin("quotes_filters_search_placeholder")}
              aria-label={tAdmin("quotes_filters_search_label")}
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
            {tAdmin("quotes_filters_status_label")}
          </label>
          <select
            id={statusSelectId}
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            className={cn(getFilterControlClass(Boolean(status)), "w-full appearance-none")}
            aria-label={tAdmin("quotes_filters_status_label")}
          >
            <option value="">{tAdmin("quotes_filters_all_statuses")}</option>
            {ADMIN_QUOTES_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {humanizeAdminQuoteStatus(statusOption)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={sortFieldId}
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("quotes_filters_sort_label")}
            </label>
            <select
              id={sortFieldId}
              value={sortBy}
              onChange={(event) => onSortByChange(event.target.value as AdminQuoteSortField)}
              className={cn(getFilterControlClass(Boolean(sortBy)), "w-full appearance-none")}
              aria-label={tAdmin("quotes_filters_sort_label")}
            >
              {SORT_FIELD_OPTIONS.map((field) => (
                <option key={field} value={field}>
                  {tAdmin(`quotes_sort_${field}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={sortDirectionId}
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("quotes_filters_sort_direction_label")}
            </label>
            <select
              id={sortDirectionId}
              value={sortDirection}
              onChange={(event) => onSortDirectionChange(event.target.value as "asc" | "desc")}
              className={cn(
                getFilterControlClass(Boolean(sortDirection)),
                "w-full appearance-none"
              )}
              aria-label={tAdmin("quotes_filters_sort_direction_label")}
            >
              <option value="desc">{tAdmin("quotes_sort_direction_desc")}</option>
              <option value="asc">{tAdmin("quotes_sort_direction_asc")}</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}

type DesktopTableProps = {
  items: AdminQuoteRow[];
  locale: string;
  sortBy: AdminQuoteSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminQuoteSortField) => void;
  onAction: (target: QuoteActionTarget) => void;
  transitioning: boolean;
};

function getHeaderCellClass(columnId: string): string {
  if (columnId === "fullName") return "min-w-[10rem]";
  if (columnId === "email") return "min-w-[12rem]";
  if (columnId === "workingTitle") return "min-w-[10rem]";
  if (columnId === "bookPrintSize") return "min-w-[6rem]";
  if (columnId === "quantity") return "min-w-[5rem]";
  if (columnId === "estimate") return "min-w-[9rem]";
  if (columnId === "status") return "min-w-[7rem]";
  if (columnId === "paymentLinkStatus") return "min-w-[8rem]";
  if (columnId === "createdAt") return "min-w-[7rem]";
  if (columnId === "actions") {
    return "sticky right-0 z-20 min-w-[12rem] text-right bg-[#0A0A0A] shadow-[-8px_0_16px_rgba(0,0,0,0.35)]";
  }
  return "";
}

function getBodyCellClass(columnId: string): string {
  if (columnId === "actions") {
    return "sticky right-0 z-10 text-right whitespace-nowrap bg-[#111111] shadow-[-8px_0_16px_rgba(0,0,0,0.35)]";
  }
  return "";
}

function AdminQuotesDesktopTable({
  items,
  locale,
  sortBy,
  sortDirection,
  onSort,
  onAction,
  transitioning,
}: DesktopTableProps) {
  const tAdmin = useTranslations("admin");
  const columnHelper = createColumnHelper<AdminQuoteRow>();

  const columns = useMemo<ColumnDef<AdminQuoteRow>[]>(
    () => [
      columnHelper.display({
        id: "fullName",
        header: () => (
          <SortableHeader
            label={tAdmin("quotes_table_customer")}
            columnId="fullName"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm font-medium text-white">{row.original.fullName}</p>
        ),
      }),
      columnHelper.display({
        id: "email",
        header: () => (
          <SortableHeader
            label={tAdmin("quotes_table_email")}
            columnId="email"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="truncate font-sans text-sm text-[#d0d0d0]">{row.original.email}</p>
        ),
      }),
      columnHelper.display({
        id: "workingTitle",
        header: () => (
          <SortableHeader
            label={tAdmin("quotes_table_title")}
            columnId="workingTitle"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="truncate font-sans text-sm text-[#d0d0d0]">{row.original.workingTitle}</p>
        ),
      }),
      columnHelper.display({
        id: "bookPrintSize",
        header: () => (
          <SortableHeader
            label={tAdmin("quotes_table_format")}
            columnId="bookPrintSize"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm text-[#d0d0d0]">{row.original.bookPrintSize}</p>
        ),
      }),
      columnHelper.display({
        id: "quantity",
        header: () => (
          <SortableHeader
            label={tAdmin("quotes_table_quantity")}
            columnId="quantity"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm text-[#d0d0d0]">{row.original.quantity}</p>
        ),
      }),
      columnHelper.display({
        id: "estimate",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("quotes_table_estimate")}
          </span>
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm text-[#d0d0d0]">
            {row.original.estimate.mode === "MANUAL_REQUIRED"
              ? tAdmin("quotes_estimate_manual")
              : row.original.estimate.label}
          </p>
        ),
      }),
      columnHelper.display({
        id: "status",
        header: () => (
          <SortableHeader
            label={tAdmin("quotes_table_status")}
            columnId="status"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <BadgePill
            label={resolveQuoteStatusLabel(row.original.status, tAdmin)}
            className={resolveQuoteStatusTone(row.original.status)}
          />
        ),
      }),
      columnHelper.display({
        id: "paymentLinkStatus",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("quotes_table_link_status")}
          </span>
        ),
        cell: ({ row }) => (
          <BadgePill
            label={resolvePaymentLinkStatusLabel(row.original.paymentLinkStatus, tAdmin)}
            className={resolvePaymentLinkTone(row.original.paymentLinkStatus)}
          />
        ),
      }),
      columnHelper.display({
        id: "createdAt",
        header: () => (
          <SortableHeader
            label={tAdmin("quotes_table_created")}
            columnId="createdAt"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm text-[#d0d0d0]">
            {formatAdminDate(row.original.createdAt, locale, tAdmin("quotes_date_unavailable"))}
          </p>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("quotes_table_actions")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="inline-flex items-center justify-end gap-2">
            <Link
              href={`/admin/quotes/${row.original.id}`}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 font-sans text-[11px] font-semibold whitespace-nowrap tracking-[0.02em] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#101010] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 lg:min-h-11 lg:text-xs"
            >
              {tAdmin("quotes_action_view")}
            </Link>
            <QuoteRowActionsMenu quote={row.original} onAction={onAction} />
          </div>
        ),
      }),
    ],
    [columnHelper, locale, onAction, onSort, sortBy, sortDirection, tAdmin]
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DashboardTableViewport
      className="touch-pan-x"
      minWidthClassName="md:min-w-[920px] lg:min-w-[1040px]"
    >
      <Table className="min-w-[920px] border-collapse lg:min-w-[1040px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-[#2A2A2A]">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.id === "actions"
                      ? undefined
                      : resolveAriaSort(header.id as AdminQuoteSortField, sortBy, sortDirection)
                  }
                  className={cn("h-12 px-4 align-middle", getHeaderCellClass(header.id))}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </tr>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[#2A2A2A] bg-[#111111] transition-colors duration-150 hover:bg-[#1A1A1A] last:border-b-0"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn("px-4 py-4 align-middle", getBodyCellClass(cell.column.id))}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </tr>
          ))}
          {transitioning
            ? ADMIN_QUOTES_TABLE_TRANSITION_ROW_IDS.map((rowId) => (
                <tr key={rowId} className="border-b border-[#2A2A2A] bg-[#111111]">
                  {ADMIN_QUOTES_TABLE_COLUMN_IDS.map((columnId) => (
                    <TableCell
                      key={`${rowId}-${columnId}`}
                      className={cn("px-4 py-4", getBodyCellClass(columnId))}
                    >
                      <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
                    </TableCell>
                  ))}
                </tr>
              ))
            : null}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

type MobileCardsProps = {
  items: AdminQuoteRow[];
  locale: string;
  transitioning: boolean;
  onAction: (target: QuoteActionTarget) => void;
};

function AdminQuotesMobileCards({ items, locale, transitioning, onAction }: MobileCardsProps) {
  const tAdmin = useTranslations("admin");

  return (
    <>
      {items.map((quote) => (
        <article
          key={quote.id}
          className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4 transition-colors duration-150 hover:bg-[#1A1A1A]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-sans text-sm font-medium text-white">{quote.fullName}</p>
              <p className="mt-1 truncate font-sans text-xs text-[#8f8f8f]">{quote.email}</p>
            </div>
            <div className="flex items-start gap-2">
              <BadgePill
                label={resolveQuoteStatusLabel(quote.status, tAdmin)}
                className={resolveQuoteStatusTone(quote.status)}
              />
              <QuoteRowActionsMenu quote={quote} onAction={onAction} />
            </div>
          </div>

          <dl className="mt-4 space-y-3">
            <div>
              <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tAdmin("quotes_table_title")}
              </dt>
              <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">{quote.workingTitle}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("quotes_table_format")}
                </dt>
                <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">{quote.bookPrintSize}</dd>
              </div>
              <div className="text-right">
                <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("quotes_table_quantity")}
                </dt>
                <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">{quote.quantity}</dd>
              </div>
            </div>
            <div>
              <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tAdmin("quotes_table_estimate")}
              </dt>
              <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">
                {quote.estimate.mode === "MANUAL_REQUIRED"
                  ? tAdmin("quotes_estimate_manual")
                  : quote.estimate.label}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("quotes_table_link_status")}
                </dt>
                <dd className="mt-1">
                  <BadgePill
                    label={resolvePaymentLinkStatusLabel(quote.paymentLinkStatus, tAdmin)}
                    className={resolvePaymentLinkTone(quote.paymentLinkStatus)}
                  />
                </dd>
              </div>
              <div className="text-right">
                <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("quotes_table_created")}
                </dt>
                <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">
                  {formatAdminDate(quote.createdAt, locale, tAdmin("quotes_date_unavailable"))}
                </dd>
              </div>
            </div>
          </dl>

          <Link
            href={`/admin/quotes/${quote.id}`}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 font-sans text-sm font-medium text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#101010] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {tAdmin("quotes_action_view")}
          </Link>
        </article>
      ))}

      {transitioning
        ? ADMIN_QUOTES_MOBILE_TRANSITION_CARD_IDS.map((cardId) => (
            <div
              key={cardId}
              aria-hidden="true"
              className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4"
            >
              <div className="h-4 w-32 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[#2A2A2A]" />
              </div>
              <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-[#2A2A2A]" />
            </div>
          ))
        : null}
    </>
  );
}

function AdminQuotesMobileSkeleton() {
  return (
    <>
      {ADMIN_QUOTES_MOBILE_SKELETON_CARD_IDS.slice(0, MOBILE_SKELETON_CARDS).map((cardId) => (
        <div
          key={cardId}
          aria-hidden="true"
          className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-28 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-4 w-4/5 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-[#2A2A2A]" />
        </div>
      ))}
    </>
  );
}

function AdminQuotesTableSkeleton() {
  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[920px] lg:min-w-[1040px]">
      <Table className="min-w-[920px] border-collapse lg:min-w-[1040px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          <tr className="border-b border-[#2A2A2A]">
            {ADMIN_QUOTES_TABLE_COLUMN_IDS.map((columnId) => (
              <TableHead
                key={`admin-quotes-table-head-${columnId}`}
                className={cn("h-12 px-4", getHeaderCellClass(columnId))}
              >
                <div className="h-3 w-20 animate-pulse rounded bg-[#2A2A2A]" />
              </TableHead>
            ))}
          </tr>
        </TableHeader>
        <TableBody>
          {ADMIN_QUOTES_TABLE_SKELETON_ROW_IDS.slice(0, TABLE_SKELETON_ROWS).map((rowId) => (
            <tr key={rowId} className="border-b border-[#2A2A2A] bg-[#111111]">
              {ADMIN_QUOTES_TABLE_COLUMN_IDS.map((columnId) => (
                <TableCell
                  key={`${rowId}-${columnId}`}
                  className={cn("px-4 py-4", getBodyCellClass(columnId))}
                >
                  <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
                </TableCell>
              ))}
            </tr>
          ))}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

function AdminQuotesEmptyState() {
  const tAdmin = useTranslations("admin");

  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <FileText className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {tAdmin("quotes_empty_title")}
      </h2>
      <p className="font-sans mt-2 max-w-md text-sm leading-6 text-[#d0d0d0] md:text-base">
        {tAdmin("quotes_empty_description")}
      </p>
    </section>
  );
}

function AdminQuotesErrorState({
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
          <h2 className="font-display text-xl font-semibold text-white">
            {tAdmin("quotes_error_title")}
          </h2>
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

function AdminQuotesPagination({
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
      aria-label={tAdmin("quotes_pagination_aria")}
      className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
        {totalPages > 0
          ? tAdmin("quotes_pagination_page_of", {
              page: currentPage,
              totalPages,
            })
          : tAdmin("quotes_pagination_page", { page: currentPage })}
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
          {tAdmin("quotes_pagination_previous")}
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          variant="outline"
          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
        >
          {tAdmin("quotes_pagination_next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function AdminQuotesView() {
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const rejectQuoteMutation = useAdminRejectQuoteMutation();
  const archiveQuoteMutation = useAdminArchiveQuoteMutation();
  const revokeQuotePaymentLinkMutation = useAdminRevokeQuotePaymentLinkMutation();
  const deleteQuoteMutation = useAdminDeleteQuoteMutation();
  const {
    status,
    q,
    cursor,
    sortBy,
    sortDirection,
    currentPage,
    activeFilterCount,
    hasActiveFilters,
    setStatus,
    setSearch,
    clearFilters,
    setSort,
    goToNextCursor,
    goToPreviousCursor,
    trail,
  } = useAdminQuotesFilters();

  const [searchDraft, setSearchDraft] = useState(q);
  const deferredSearch = useDeferredValue(searchDraft);
  const [actionTarget, setActionTarget] = useState<QuoteActionTarget | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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

  const {
    data,
    items,
    isError,
    error,
    refetch,
    isFetching,
    isInitialLoading,
    isPageTransitioning,
  } = useAdminQuotes({
    cursor,
    status,
    q,
    sortBy,
    sortDirection,
  });

  const handleSort = (columnId: AdminQuoteSortField) => {
    if (sortBy === columnId) {
      setSort(columnId, sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    const initialDirection =
      columnId === DEFAULT_ADMIN_QUOTES_SORT_BY ? DEFAULT_ADMIN_QUOTES_SORT_DIRECTION : "asc";
    setSort(columnId, initialDirection);
  };

  const hasData = items.length > 0;
  const showPagination = hasData || data.totalItems > 0;
  const errorMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : tAdmin("quotes_error_description");

  const isActionPending =
    rejectQuoteMutation.isPending ||
    archiveQuoteMutation.isPending ||
    revokeQuotePaymentLinkMutation.isPending ||
    deleteQuoteMutation.isPending;

  const selectedQuote =
    actionTarget == null ? null : (items.find((item) => item.id === actionTarget.quoteId) ?? null);

  const resetActionDialog = () => {
    setActionTarget(null);
    setActionReason("");
    setDeleteConfirmText("");
  };

  const openActionDialog = (target: QuoteActionTarget) => {
    setActionTarget(target);
    setActionReason("");
    setDeleteConfirmText("");
  };

  const submitAction = async () => {
    if (!actionTarget) return;

    const reason = actionReason.trim();
    if (reason.length < 5) {
      return;
    }

    if (actionTarget.action === "delete" && deleteConfirmText.trim() !== "DELETE") {
      return;
    }

    try {
      if (actionTarget.action === "revoke") {
        await revokeQuotePaymentLinkMutation.mutateAsync({
          quoteId: actionTarget.quoteId,
          input: {
            reason,
            notifyCustomer: false,
            customerMessage: null,
          },
        });
        toast.success(tAdmin("quotes_action_revoke_link"));
        resetActionDialog();
        return;
      }

      if (actionTarget.action === "reject") {
        await rejectQuoteMutation.mutateAsync({
          quoteId: actionTarget.quoteId,
          input: { reason },
        });
        toast.success(tAdmin("quotes_action_reject"));
        resetActionDialog();
        return;
      }

      if (actionTarget.action === "archive") {
        await archiveQuoteMutation.mutateAsync({
          quoteId: actionTarget.quoteId,
          input: { reason },
        });
        toast.success(tAdmin("quotes_action_archive"));
        resetActionDialog();
        return;
      }

      await deleteQuoteMutation.mutateAsync({
        quoteId: actionTarget.quoteId,
        input: {
          reason,
          confirmText: "DELETE",
        },
      });
      toast.success(tAdmin("quotes_action_delete"));
      resetActionDialog();
    } catch (actionError) {
      const fallbackMessage = tAdmin("quotes_error_description");
      const message =
        actionError instanceof Error && actionError.message.trim().length > 0
          ? actionError.message
          : fallbackMessage;

      toast.error(message);
    }
  };

  return (
    <section className="grid min-w-0 gap-4 md:gap-5">
      <AdminQuotesFilterBar
        searchDraft={searchDraft}
        status={status}
        sortBy={sortBy}
        sortDirection={sortDirection}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        onSearchDraftChange={setSearchDraft}
        onStatusChange={(value) => setStatus(value as typeof status)}
        onSortByChange={(value) => setSort(value, sortDirection)}
        onSortDirectionChange={(value) => setSort(sortBy, value)}
        onClearFilters={clearFilters}
      />

      <section className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#0A0A0A] p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#8f8f8f]">
            {tAdmin("quotes_summary_label")}
          </p>
          <p className="mt-1 font-sans text-sm text-[#d0d0d0] md:text-base">
            {tAdmin("quotes_summary_total", {
              shown: items.length,
              total: data.totalItems,
            })}
          </p>
        </div>
        <div aria-live="polite" className="font-sans text-xs text-[#8f8f8f] md:text-sm">
          {isPageTransitioning ? tAdmin("quotes_loading_more") : null}
        </div>
      </section>

      {isError ? (
        <AdminQuotesErrorState
          message={errorMessage}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : isInitialLoading ? (
        <DashboardResponsiveDataRegion
          mobileCards={<AdminQuotesMobileSkeleton />}
          desktopTable={<AdminQuotesTableSkeleton />}
        />
      ) : hasData ? (
        <DashboardResponsiveDataRegion
          mobileCards={
            <AdminQuotesMobileCards
              items={items}
              locale={locale}
              transitioning={isPageTransitioning}
              onAction={openActionDialog}
            />
          }
          desktopTable={
            <AdminQuotesDesktopTable
              items={items}
              locale={locale}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSort={handleSort}
              onAction={openActionDialog}
              transitioning={isPageTransitioning}
            />
          }
        />
      ) : (
        <AdminQuotesEmptyState />
      )}

      {!isError && !isInitialLoading && showPagination ? (
        <AdminQuotesPagination
          currentPage={currentPage}
          totalItems={data.totalItems}
          limit={data.limit}
          canPrevious={trail.length > 0}
          canNext={Boolean(data.hasMore && data.nextCursor)}
          loading={isFetching}
          onPrevious={goToPreviousCursor}
          onNext={() => goToNextCursor(data.nextCursor)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(actionTarget)}
        onOpenChange={(open) => (!open ? resetActionDialog() : null)}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0B0B0B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionTarget?.action === "delete"
                ? tAdmin("quotes_delete_dialog_title")
                : actionTarget?.action === "archive"
                  ? tAdmin("quotes_archive_dialog_title")
                  : actionTarget?.action === "reject"
                    ? tAdmin("quotes_reject_dialog_title")
                    : tAdmin("quotes_revoke_dialog_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#b8b8b8]">
              {actionTarget?.action === "delete"
                ? tAdmin("quotes_delete_dialog_description")
                : actionTarget?.action === "archive"
                  ? tAdmin("quotes_archive_dialog_description")
                  : actionTarget?.action === "reject"
                    ? tAdmin("quotes_reject_dialog_description")
                    : tAdmin("quotes_revoke_dialog_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedQuote ? (
            <p className="font-sans text-xs text-[#9a9a9a]">
              {tAdmin("quotes_dialog_target", { title: selectedQuote.workingTitle })}
            </p>
          ) : null}

          {actionTarget ? (
            <div className="grid gap-2">
              <label htmlFor="quote-action-reason" className="font-sans text-xs text-[#cfcfcf]">
                {tAdmin("quotes_dialog_reason_label")}
              </label>
              <Textarea
                id="quote-action-reason"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder={tAdmin("quotes_dialog_reason_placeholder")}
                className="min-h-[90px] border-[#2A2A2A] bg-[#111111] text-white"
              />
            </div>
          ) : null}

          {actionTarget?.action === "delete" ? (
            <div className="grid gap-2">
              <label htmlFor="quote-delete-confirm" className="font-sans text-xs text-[#cfcfcf]">
                {tAdmin("quotes_delete_dialog_confirm_label")}
              </label>
              <Input
                id="quote-delete-confirm"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
                className="border-[#2A2A2A] bg-[#111111] text-white"
              />
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionPending}>
              {tAdmin("quotes_dialog_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                isActionPending ||
                actionReason.trim().length < 5 ||
                (actionTarget?.action === "delete" && deleteConfirmText.trim() !== "DELETE")
              }
              onClick={(event) => {
                event.preventDefault();
                void submitAction();
              }}
              variant={actionTarget?.action === "delete" ? "destructive" : "default"}
            >
              {isActionPending
                ? tCommon("loading")
                : actionTarget?.action === "delete"
                  ? tAdmin("quotes_action_delete")
                  : actionTarget?.action === "archive"
                    ? tAdmin("quotes_action_archive")
                    : actionTarget?.action === "reject"
                      ? tAdmin("quotes_action_reject")
                      : tAdmin("quotes_action_revoke_link")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
