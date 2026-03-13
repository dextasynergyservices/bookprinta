"use client";

import type { AdminBookSortField, AdminBooksListResponse } from "@bookprinta/shared";
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
  BookOpenText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import { OrderMetaText, OrderReferenceText } from "@/components/dashboard/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import {
  ADMIN_BOOK_STATUS_OPTIONS,
  DEFAULT_ADMIN_BOOK_SORT_BY,
  DEFAULT_ADMIN_BOOK_SORT_DIRECTION,
  humanizeAdminBookStatus,
  useAdminBooksFilters,
} from "@/hooks/use-admin-books-filters";
import { useAdminBooks } from "@/hooks/useAdminBooks";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type AdminBookRow = AdminBooksListResponse["items"][number];

const TABLE_SKELETON_ROWS = 6;
const MOBILE_SKELETON_CARDS = 4;
const ADMIN_BOOK_TABLE_COLUMN_IDS = [
  "title",
  "authorName",
  "displayStatus",
  "orderNumber",
  "uploadedAt",
  "actions",
] as const;
const ADMIN_BOOK_TABLE_TRANSITION_ROW_IDS = ["transition-row-1", "transition-row-2"] as const;
const ADMIN_BOOK_MOBILE_TRANSITION_CARD_IDS = ["transition-card-1", "transition-card-2"] as const;
const ADMIN_BOOK_MOBILE_SKELETON_CARD_IDS = [
  "mobile-skeleton-1",
  "mobile-skeleton-2",
  "mobile-skeleton-3",
  "mobile-skeleton-4",
] as const;
const ADMIN_BOOK_TABLE_SKELETON_ROW_IDS = [
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

const ISSUE_BOOK_STATUSES = new Set(["REJECTED", "CANCELLED"]);
const PENDING_BOOK_STATUSES = new Set([
  "AWAITING_UPLOAD",
  "UPLOADED",
  "PAYMENT_RECEIVED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
]);
const DELIVERED_BOOK_STATUSES = new Set(["DELIVERED", "COMPLETED"]);

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
    "focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25",
    isActive
      ? "border-[#007eff]/65 shadow-[0_0_0_1px_rgba(0,126,255,0.25)]"
      : "border-[#2A2A2A] hover:border-[#3A3A3A]"
  );
}

function resolveBookStatusTone(
  status: string | null | undefined
): "active" | "delivered" | "pending" | "issue" {
  if (!status) return "pending";
  if (ISSUE_BOOK_STATUSES.has(status)) return "issue";
  if (DELIVERED_BOOK_STATUSES.has(status)) return "delivered";
  if (PENDING_BOOK_STATUSES.has(status)) return "pending";
  return "active";
}

function AdminBookStatusBadge({
  status,
  label,
  className,
}: {
  status: string | null | undefined;
  label: string;
  className?: string;
}) {
  const tone = resolveBookStatusTone(status);
  const toneClassName =
    tone === "issue"
      ? "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#ef4444]"
      : tone === "delivered"
        ? "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]"
        : tone === "pending"
          ? "border-[#facc15]/45 bg-[#facc15]/15 text-[#facc15]"
          : "border-[#007eff]/45 bg-[#007eff]/15 text-[#007eff]";

  return (
    <Badge
      variant="outline"
      data-tone={tone}
      data-status={status ?? ""}
      className={cn(
        "rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        toneClassName,
        className
      )}
    >
      {label}
    </Badge>
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
  columnId: AdminBookSortField,
  sortBy: AdminBookSortField,
  sortDirection: "asc" | "desc"
): "ascending" | "descending" | "none" {
  if (sortBy !== columnId) {
    return "none";
  }

  return sortDirection === "asc" ? "ascending" : "descending";
}

type SortableHeaderProps = {
  label: string;
  columnId: AdminBookSortField;
  sortBy: AdminBookSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminBookSortField) => void;
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

function getHeaderCellClass(columnId: string): string {
  if (columnId === "title") return "min-w-[15rem]";
  if (columnId === "authorName") return "min-w-[13rem]";
  if (columnId === "displayStatus") return "min-w-[10rem]";
  if (columnId === "orderNumber") return "min-w-[9rem]";
  if (columnId === "uploadedAt") return "min-w-[8rem]";
  if (columnId === "actions") return "min-w-[8rem] text-right";
  return "";
}

function getBodyCellClass(columnId: string): string {
  if (columnId === "title") return "max-w-[22rem]";
  if (columnId === "authorName") return "max-w-[18rem]";
  if (columnId === "actions") return "text-right whitespace-nowrap";
  return "";
}

function AdminBooksFilterBar({
  status,
  activeFilterCount,
  hasActiveFilters,
  onStatusChange,
  onClearFilters,
}: {
  status: string;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  onStatusChange: (value: string) => void;
  onClearFilters: () => void;
}) {
  const tAdmin = useTranslations("admin");

  return (
    <section className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
            {tAdmin("panel_label")}
          </p>
          <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {tAdmin("books")}
          </h2>
          <p className="font-sans mt-2 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
            {tAdmin("books_workspace_description")}
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
              ? tAdmin("books_filters_active", { count: activeFilterCount })
              : tAdmin("books_filters_idle")}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="min-h-10 rounded-full border-[#2A2A2A] bg-[#080808] px-4 font-sans text-xs font-medium text-white hover:border-[#007eff] hover:bg-[#101010] disabled:opacity-45"
          >
            {tAdmin("books_filters_clear")}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:max-w-sm">
        <div className="min-w-0">
          <label
            htmlFor="admin-books-status"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("books_filters_status_label")}
          </label>
          <select
            id="admin-books-status"
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            className={cn(getFilterControlClass(Boolean(status)), "w-full appearance-none")}
            aria-label={tAdmin("books_filters_status_label")}
          >
            <option value="">{tAdmin("books_filters_all_statuses")}</option>
            {ADMIN_BOOK_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {humanizeAdminBookStatus(statusOption)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function AdminBooksDesktopTable({
  items,
  locale,
  sortBy,
  sortDirection,
  onSort,
  transitioning,
}: {
  items: AdminBookRow[];
  locale: string;
  sortBy: AdminBookSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminBookSortField) => void;
  transitioning: boolean;
}) {
  const tAdmin = useTranslations("admin");

  const columns = useMemo<ColumnDef<AdminBookRow>[]>(
    () => [
      createColumnHelper<AdminBookRow>().display({
        id: "title",
        header: () => (
          <SortableHeader
            label={tAdmin("books_table_title")}
            columnId="title"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="truncate font-display text-sm font-semibold tracking-tight text-white md:text-base">
            {row.original.title ?? tAdmin("books_title_untitled")}
          </p>
        ),
      }),
      createColumnHelper<AdminBookRow>().display({
        id: "authorName",
        header: () => (
          <SortableHeader
            label={tAdmin("books_table_author")}
            columnId="authorName"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-sans text-sm font-medium text-white">
              {row.original.author.fullName || tAdmin("books_author_unknown")}
            </p>
            <p className="mt-1 truncate font-sans text-xs text-[#8f8f8f]">
              {row.original.author.email}
            </p>
          </div>
        ),
      }),
      createColumnHelper<AdminBookRow>().display({
        id: "displayStatus",
        header: () => (
          <SortableHeader
            label={tAdmin("books_table_status")}
            columnId="displayStatus"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <AdminBookStatusBadge
            status={row.original.displayStatus}
            label={humanizeAdminBookStatus(row.original.displayStatus)}
          />
        ),
      }),
      createColumnHelper<AdminBookRow>().display({
        id: "orderNumber",
        header: () => (
          <SortableHeader
            label={tAdmin("books_table_order_ref")}
            columnId="orderNumber"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <OrderReferenceText>
            {row.original.order.orderNumber || tAdmin("books_order_unavailable")}
          </OrderReferenceText>
        ),
      }),
      createColumnHelper<AdminBookRow>().display({
        id: "uploadedAt",
        header: () => (
          <SortableHeader
            label={tAdmin("books_table_upload_date")}
            columnId="uploadedAt"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <OrderMetaText>
            {formatAdminDate(
              row.original.uploadedAt,
              locale,
              tAdmin("books_upload_date_unavailable")
            )}
          </OrderMetaText>
        ),
      }),
      createColumnHelper<AdminBookRow>().display({
        id: "actions",
        header: () => <span className="sr-only">{tAdmin("books_table_actions")}</span>,
        cell: ({ row }) => (
          <Link
            href={row.original.detailUrl}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 font-sans text-xs font-medium text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#101010] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {tAdmin("books_action_view")}
          </Link>
        ),
      }),
    ],
    [locale, onSort, sortBy, sortDirection, tAdmin]
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[980px] xl:min-w-[1060px]">
      <Table className="min-w-[980px] border-collapse xl:min-w-[1060px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-[#2A2A2A]">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.id === "actions"
                      ? undefined
                      : resolveAriaSort(header.id as AdminBookSortField, sortBy, sortDirection)
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
            ? ADMIN_BOOK_TABLE_TRANSITION_ROW_IDS.map((rowId) => (
                <tr key={rowId} className="border-b border-[#2A2A2A] bg-[#111111]">
                  {ADMIN_BOOK_TABLE_COLUMN_IDS.map((columnId) => (
                    <TableCell key={`${rowId}-${columnId}`} className="px-4 py-4">
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

function AdminBooksMobileCards({
  items,
  locale,
  transitioning,
}: {
  items: AdminBookRow[];
  locale: string;
  transitioning: boolean;
}) {
  const tAdmin = useTranslations("admin");

  return (
    <>
      {items.map((book) => (
        <article
          key={book.id}
          className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4 transition-colors duration-150 hover:bg-[#1A1A1A]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold tracking-tight text-white">
                {book.title ?? tAdmin("books_title_untitled")}
              </p>
              <p className="mt-1 truncate font-sans text-sm text-[#d0d0d0]">
                {book.author.fullName || tAdmin("books_author_unknown")}
              </p>
            </div>
            <AdminBookStatusBadge
              status={book.displayStatus}
              label={humanizeAdminBookStatus(book.displayStatus)}
              className="shrink-0"
            />
          </div>

          <p className="mt-3 truncate font-sans text-xs text-[#8f8f8f]">{book.author.email}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tAdmin("books_table_order_ref")}
              </dt>
              <dd className="mt-1">
                <OrderReferenceText>
                  {book.order.orderNumber || tAdmin("books_order_unavailable")}
                </OrderReferenceText>
              </dd>
            </div>
            <div className="text-right">
              <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tAdmin("books_table_upload_date")}
              </dt>
              <dd className="mt-1">
                <OrderMetaText>
                  {formatAdminDate(
                    book.uploadedAt,
                    locale,
                    tAdmin("books_upload_date_unavailable")
                  )}
                </OrderMetaText>
              </dd>
            </div>
          </dl>

          <Link
            href={book.detailUrl}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 font-sans text-sm font-medium text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#101010] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {tAdmin("books_action_view")}
          </Link>
        </article>
      ))}

      {transitioning
        ? ADMIN_BOOK_MOBILE_TRANSITION_CARD_IDS.map((cardId) => (
            <div
              key={cardId}
              aria-hidden="true"
              className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4"
            >
              <div className="h-5 w-2/3 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
                <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
              </div>
              <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-[#2A2A2A]" />
            </div>
          ))
        : null}
    </>
  );
}

function AdminBooksMobileSkeleton() {
  return (
    <>
      {ADMIN_BOOK_MOBILE_SKELETON_CARD_IDS.slice(0, MOBILE_SKELETON_CARDS).map((cardId) => (
        <div
          key={cardId}
          aria-hidden="true"
          className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="h-5 w-2/3 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-[#2A2A2A]" />
        </div>
      ))}
    </>
  );
}

function AdminBooksTableSkeleton() {
  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[980px] xl:min-w-[1060px]">
      <Table className="min-w-[980px] border-collapse xl:min-w-[1060px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          <tr className="border-b border-[#2A2A2A]">
            {ADMIN_BOOK_TABLE_COLUMN_IDS.map((columnId) => (
              <TableHead key={`admin-books-table-head-${columnId}`} className="h-12 px-4">
                <div className="h-3 w-20 animate-pulse rounded bg-[#2A2A2A]" />
              </TableHead>
            ))}
          </tr>
        </TableHeader>
        <TableBody>
          {ADMIN_BOOK_TABLE_SKELETON_ROW_IDS.slice(0, TABLE_SKELETON_ROWS).map((rowId) => (
            <tr key={rowId} className="border-b border-[#2A2A2A] bg-[#111111]">
              {ADMIN_BOOK_TABLE_COLUMN_IDS.map((columnId) => (
                <TableCell key={`${rowId}-${columnId}`} className="px-4 py-4">
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

function AdminBooksEmptyState() {
  const tAdmin = useTranslations("admin");

  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <BookOpenText className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {tAdmin("books_empty_title")}
      </h2>
      <p className="font-sans mt-2 max-w-md text-sm leading-6 text-[#d0d0d0] md:text-base">
        {tAdmin("books_empty_description")}
      </p>
    </section>
  );
}

function AdminBooksErrorState({
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
            {tAdmin("books_error_title")}
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

function AdminBooksPagination({
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
      aria-label={tAdmin("books_pagination_aria")}
      className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
        {totalPages > 0
          ? tAdmin("books_pagination_page_of", {
              page: currentPage,
              totalPages,
            })
          : tAdmin("books_pagination_page", { page: currentPage })}
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
          {tAdmin("books_pagination_previous")}
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          variant="outline"
          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
        >
          {tAdmin("books_pagination_next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function AdminBooksView() {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const {
    status,
    cursor,
    sortBy,
    sortDirection,
    currentPage,
    activeFilterCount,
    hasActiveFilters,
    setStatus,
    clearFilters,
    setSort,
    goToNextCursor,
    goToPreviousCursor,
    trail,
  } = useAdminBooksFilters();

  const {
    data,
    items,
    isError,
    error,
    refetch,
    isFetching,
    isInitialLoading,
    isPageTransitioning,
  } = useAdminBooks({
    cursor,
    status,
    sortBy,
    sortDirection,
  });

  const handleSort = (columnId: AdminBookSortField) => {
    if (sortBy === columnId) {
      setSort(columnId, sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    const initialDirection =
      columnId === DEFAULT_ADMIN_BOOK_SORT_BY ? DEFAULT_ADMIN_BOOK_SORT_DIRECTION : "asc";
    setSort(columnId, initialDirection);
  };

  const hasData = items.length > 0;
  const showPagination = hasData || data.totalItems > 0;
  const errorMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : tAdmin("books_error_description");

  return (
    <section className="grid min-w-0 gap-4 md:gap-5">
      <AdminBooksFilterBar
        status={status}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        onStatusChange={(value) => setStatus(value as typeof status)}
        onClearFilters={clearFilters}
      />

      <section className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#0A0A0A] p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#8f8f8f]">
            {tAdmin("books_summary_label")}
          </p>
          <p className="mt-1 font-sans text-sm text-[#d0d0d0] md:text-base">
            {tAdmin("books_summary_total", {
              shown: items.length,
              total: data.totalItems,
            })}
          </p>
        </div>
        <div aria-live="polite" className="font-sans text-xs text-[#8f8f8f] md:text-sm">
          {isPageTransitioning ? tAdmin("books_loading_more") : null}
        </div>
      </section>

      {isError ? (
        <AdminBooksErrorState
          message={errorMessage}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : isInitialLoading ? (
        <DashboardResponsiveDataRegion
          mobileCards={<AdminBooksMobileSkeleton />}
          desktopTable={<AdminBooksTableSkeleton />}
        />
      ) : hasData ? (
        <DashboardResponsiveDataRegion
          mobileCards={
            <AdminBooksMobileCards
              items={items}
              locale={locale}
              transitioning={isPageTransitioning}
            />
          }
          desktopTable={
            <AdminBooksDesktopTable
              items={items}
              locale={locale}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSort={handleSort}
              transitioning={isPageTransitioning}
            />
          }
        />
      ) : (
        <AdminBooksEmptyState />
      )}

      {!isError && !isInitialLoading && showPagination ? (
        <AdminBooksPagination
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
    </section>
  );
}
