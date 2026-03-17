"use client";

import type { AdminOrderSortField, AdminOrdersListResponse } from "@bookprinta/shared";
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
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  ShoppingCart,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
import { OrderMetaText, OrderReferenceText, OrderStatusBadge } from "@/components/dashboard/orders";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_ORDER_STATUS_OPTIONS,
  DEFAULT_ADMIN_ORDER_SORT_BY,
  DEFAULT_ADMIN_ORDER_SORT_DIRECTION,
  humanizeAdminOrderStatus,
  useAdminOrdersFilters,
} from "@/hooks/use-admin-orders-filters";
import { useAdminArchiveOrderMutation } from "@/hooks/useAdminOrderActions";
import { useAdminOrders } from "@/hooks/useAdminOrders";
import { usePackages } from "@/hooks/usePackages";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type AdminOrderRow = AdminOrdersListResponse["items"][number];
type OrderActionTarget = {
  orderId: string;
};

const TABLE_SKELETON_ROWS = 6;
const MOBILE_SKELETON_CARDS = 4;
const ADMIN_ORDER_TABLE_COLUMN_IDS = [
  "orderNumber",
  "customerName",
  "customerEmail",
  "packageName",
  "displayStatus",
  "createdAt",
  "totalAmount",
  "actions",
] as const;
const ADMIN_ORDER_TABLE_TRANSITION_ROW_IDS = ["transition-row-1", "transition-row-2"] as const;
const ADMIN_ORDER_MOBILE_TRANSITION_CARD_IDS = ["transition-card-1", "transition-card-2"] as const;
const ADMIN_ORDER_MOBILE_SKELETON_CARD_IDS = [
  "mobile-skeleton-1",
  "mobile-skeleton-2",
  "mobile-skeleton-3",
  "mobile-skeleton-4",
] as const;
const ADMIN_ORDER_TABLE_SKELETON_ROW_IDS = [
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

function formatAdminCurrency(
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

  if (fromLabel) {
    return `${fromLabel} -`;
  }

  if (toLabel) {
    return `- ${toLabel}`;
  }

  return params.placeholder;
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
  columnId: AdminOrderSortField,
  sortBy: AdminOrderSortField,
  sortDirection: "asc" | "desc"
): "ascending" | "descending" | "none" {
  if (sortBy !== columnId) {
    return "none";
  }

  return sortDirection === "asc" ? "ascending" : "descending";
}

type SortableHeaderProps = {
  label: string;
  columnId: AdminOrderSortField;
  sortBy: AdminOrderSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminOrderSortField) => void;
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

function OrderRowActionsMenu({
  order,
  onArchive,
}: {
  order: AdminOrderRow;
  onArchive: (target: OrderActionTarget) => void;
}) {
  const tAdmin = useTranslations("admin");

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
          <span className="sr-only">{tAdmin("orders_actions_menu_sr")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[12rem] border-[#2A2A2A] bg-[#0B0B0B] text-white"
      >
        <DropdownMenuItem asChild>
          <Link href={order.detailUrl}>{tAdmin("orders_action_view")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!order.actions.canArchive}
          onSelect={() => onArchive({ orderId: order.id })}
        >
          <Archive className="size-4" aria-hidden="true" />
          {tAdmin("orders_action_archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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

function AdminOrdersDateRangePicker({
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

type FilterBarProps = {
  locale: string;
  searchDraft: string;
  status: string;
  packageId: string;
  dateFrom: string;
  dateTo: string;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  packages: Array<{ id: string; name: string }>;
  packagesLoading: boolean;
  onSearchDraftChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onPackageChange: (value: string) => void;
  onDateRangeChange: (range: { dateFrom?: string; dateTo?: string }) => void;
  onClearFilters: () => void;
};

function AdminOrdersFilterBar({
  locale,
  searchDraft,
  status,
  packageId,
  dateFrom,
  dateTo,
  activeFilterCount,
  hasActiveFilters,
  packages,
  packagesLoading,
  onSearchDraftChange,
  onStatusChange,
  onPackageChange,
  onDateRangeChange,
  onClearFilters,
}: FilterBarProps) {
  const tAdmin = useTranslations("admin");
  const searchInputId = useId();
  const statusSelectId = useId();
  const packageSelectId = useId();

  return (
    <section className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
            {tAdmin("panel_label")}
          </p>
          <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {tAdmin("orders")}
          </h2>
          <p className="font-sans mt-2 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
            {tAdmin("orders_workspace_description")}
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
              ? tAdmin("orders_filters_active", { count: activeFilterCount })
              : tAdmin("orders_filters_idle")}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="min-h-10 rounded-full border-[#2A2A2A] bg-[#080808] px-4 font-sans text-xs font-medium text-white hover:border-[#007eff] hover:bg-[#101010] disabled:opacity-45"
          >
            {tAdmin("orders_filters_clear")}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <label
            htmlFor={searchInputId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("orders_filters_search_label")}
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
              placeholder={tAdmin("orders_filters_search_placeholder")}
              aria-label={tAdmin("orders_filters_search_label")}
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
            {tAdmin("orders_filters_status_label")}
          </label>
          <select
            id={statusSelectId}
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            className={cn(getFilterControlClass(Boolean(status)), "w-full appearance-none")}
            aria-label={tAdmin("orders_filters_status_label")}
          >
            <option value="">{tAdmin("orders_filters_all_statuses")}</option>
            {ADMIN_ORDER_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {humanizeAdminOrderStatus(statusOption)}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor={packageSelectId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("orders_filters_package_label")}
          </label>
          <select
            id={packageSelectId}
            value={packageId}
            onChange={(event) => onPackageChange(event.target.value)}
            className={cn(getFilterControlClass(Boolean(packageId)), "w-full appearance-none")}
            aria-label={tAdmin("orders_filters_package_label")}
          >
            <option value="">{tAdmin("orders_filters_all_packages")}</option>
            {packagesLoading ? (
              <option value="" disabled>
                {tAdmin("orders_filters_packages_loading")}
              </option>
            ) : null}
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>
            ))}
          </select>
        </div>

        <AdminOrdersDateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          locale={locale}
          label={tAdmin("orders_filters_date_label")}
          placeholder={tAdmin("orders_filters_date_placeholder")}
          fromLabel={tAdmin("orders_filters_date_from")}
          toLabel={tAdmin("orders_filters_date_to")}
          clearLabel={tAdmin("orders_filters_date_clear")}
          onChange={onDateRangeChange}
        />
      </div>
    </section>
  );
}

type DesktopTableProps = {
  items: AdminOrderRow[];
  locale: string;
  sortBy: AdminOrderSortField;
  sortDirection: "asc" | "desc";
  onSort: (columnId: AdminOrderSortField) => void;
  onArchive: (target: OrderActionTarget) => void;
  transitioning: boolean;
};

function getHeaderCellClass(columnId: string): string {
  if (columnId === "orderNumber") return "min-w-[8.5rem]";
  if (columnId === "customerName") return "min-w-[10.5rem]";
  if (columnId === "customerEmail") return "hidden 2xl:table-cell 2xl:min-w-[14rem]";
  if (columnId === "packageName") return "min-w-[9.5rem]";
  if (columnId === "displayStatus") return "min-w-[8.5rem]";
  if (columnId === "createdAt") return "min-w-[7.5rem]";
  if (columnId === "totalAmount") return "min-w-[7rem] text-right";
  if (columnId === "actions") return "min-w-[7rem] text-right";
  return "";
}

function getBodyCellClass(columnId: string): string {
  if (columnId === "customerEmail") return "hidden max-w-[15rem] 2xl:table-cell";
  if (columnId === "totalAmount") return "text-right whitespace-nowrap";
  if (columnId === "actions") return "text-right whitespace-nowrap";
  return "";
}

function AdminOrdersDesktopTable({
  items,
  locale,
  sortBy,
  sortDirection,
  onSort,
  onArchive,
  transitioning,
}: DesktopTableProps) {
  const tAdmin = useTranslations("admin");

  const columns = useMemo<ColumnDef<AdminOrderRow>[]>(
    () => [
      createColumnHelper<AdminOrderRow>().display({
        id: "orderNumber",
        header: () => (
          <SortableHeader
            label={tAdmin("orders_table_order_ref")}
            columnId="orderNumber"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => <OrderReferenceText>{row.original.orderNumber}</OrderReferenceText>,
      }),
      createColumnHelper<AdminOrderRow>().display({
        id: "customerName",
        header: () => (
          <SortableHeader
            label={tAdmin("orders_table_customer")}
            columnId="customerName"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-sans text-sm font-medium text-white">
              {row.original.customer.fullName}
            </p>
            <p className="font-sans mt-1 text-xs text-[#8f8f8f]">
              {row.original.customer.phoneNumber ?? tAdmin("orders_customer_phone_unavailable")}
            </p>
            <p className="font-sans mt-1 truncate text-xs text-[#8f8f8f] 2xl:hidden">
              {row.original.customer.email}
            </p>
          </div>
        ),
      }),
      createColumnHelper<AdminOrderRow>().display({
        id: "customerEmail",
        header: () => (
          <SortableHeader
            label={tAdmin("orders_table_email")}
            columnId="customerEmail"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <p className="truncate font-sans text-sm text-[#d0d0d0]">{row.original.customer.email}</p>
        ),
      }),
      createColumnHelper<AdminOrderRow>().display({
        id: "packageName",
        header: () => (
          <SortableHeader
            label={tAdmin("orders_table_package")}
            columnId="packageName"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => <OrderMetaText>{row.original.package.name}</OrderMetaText>,
      }),
      createColumnHelper<AdminOrderRow>().display({
        id: "displayStatus",
        header: () => (
          <SortableHeader
            label={tAdmin("orders_table_status")}
            columnId="displayStatus"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <OrderStatusBadge
            orderStatus={row.original.orderStatus}
            bookStatus={row.original.bookStatus}
            label={humanizeAdminOrderStatus(row.original.displayStatus)}
          />
        ),
      }),
      createColumnHelper<AdminOrderRow>().display({
        id: "createdAt",
        header: () => (
          <SortableHeader
            label={tAdmin("orders_table_date")}
            columnId="createdAt"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <OrderMetaText>
            {formatAdminDate(row.original.createdAt, locale, tAdmin("orders_date_unavailable"))}
          </OrderMetaText>
        ),
      }),
      createColumnHelper<AdminOrderRow>().display({
        id: "totalAmount",
        header: () => (
          <SortableHeader
            label={tAdmin("orders_table_total")}
            columnId="totalAmount"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <OrderMetaText>
            {formatAdminCurrency(
              row.original.totalAmount,
              row.original.currency,
              locale,
              tAdmin("orders_total_unavailable")
            )}
          </OrderMetaText>
        ),
      }),
      createColumnHelper<AdminOrderRow>().display({
        id: "actions",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("orders_table_actions")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="inline-flex items-center justify-end gap-2">
            <Link
              href={row.original.detailUrl}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-3 py-2 font-sans text-[10px] font-medium tracking-[0.02em] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#101010] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 xl:px-4 xl:text-[11px]"
            >
              {tAdmin("orders_action_view")}
            </Link>
            <OrderRowActionsMenu order={row.original} onArchive={onArchive} />
          </div>
        ),
      }),
    ],
    [locale, onArchive, onSort, sortBy, sortDirection, tAdmin]
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DashboardTableViewport
      className="touch-pan-x"
      minWidthClassName="md:min-w-[900px] xl:min-w-[960px] 2xl:min-w-[1180px]"
    >
      <Table className="min-w-[900px] border-collapse xl:min-w-[960px] 2xl:min-w-[1180px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-[#2A2A2A]">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.id === "actions"
                      ? undefined
                      : resolveAriaSort(header.id as AdminOrderSortField, sortBy, sortDirection)
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
            ? ADMIN_ORDER_TABLE_TRANSITION_ROW_IDS.map((rowId) => (
                <tr key={rowId} className="border-b border-[#2A2A2A] bg-[#111111]">
                  {ADMIN_ORDER_TABLE_COLUMN_IDS.map((columnId) => (
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
  items: AdminOrderRow[];
  locale: string;
  transitioning: boolean;
  onArchive: (target: OrderActionTarget) => void;
};

function AdminOrdersMobileCards({ items, locale, transitioning, onArchive }: MobileCardsProps) {
  const tAdmin = useTranslations("admin");

  return (
    <>
      {items.map((order) => (
        <article
          key={order.id}
          className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4 transition-colors duration-150 hover:bg-[#1A1A1A]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <OrderReferenceText>{order.orderNumber}</OrderReferenceText>
              <p className="mt-1 truncate font-sans text-sm font-medium text-white">
                {order.customer.fullName}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <OrderStatusBadge
                orderStatus={order.orderStatus}
                bookStatus={order.bookStatus}
                label={humanizeAdminOrderStatus(order.displayStatus)}
              />
              <OrderRowActionsMenu order={order} onArchive={onArchive} />
            </div>
          </div>

          <dl className="mt-4 space-y-3">
            <div>
              <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tAdmin("orders_table_email")}
              </dt>
              <dd className="mt-1 font-sans text-sm text-[#d0d0d0]">{order.customer.email}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("orders_table_package")}
                </dt>
                <dd className="mt-1">
                  <OrderMetaText>{order.package.name}</OrderMetaText>
                </dd>
              </div>
              <div className="text-right">
                <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("orders_table_total")}
                </dt>
                <dd className="mt-1">
                  <OrderMetaText>
                    {formatAdminCurrency(
                      order.totalAmount,
                      order.currency,
                      locale,
                      tAdmin("orders_total_unavailable")
                    )}
                  </OrderMetaText>
                </dd>
              </div>
            </div>
            <div>
              <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                {tAdmin("orders_table_date")}
              </dt>
              <dd className="mt-1">
                <OrderMetaText>
                  {formatAdminDate(order.createdAt, locale, tAdmin("orders_date_unavailable"))}
                </OrderMetaText>
              </dd>
            </div>
          </dl>

          <Link
            href={order.detailUrl}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000] px-4 py-2 font-sans text-sm font-medium text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#101010] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {tAdmin("orders_action_view")}
          </Link>
        </article>
      ))}

      {transitioning
        ? ADMIN_ORDER_MOBILE_TRANSITION_CARD_IDS.map((cardId) => (
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

function AdminOrdersMobileSkeleton() {
  return (
    <>
      {ADMIN_ORDER_MOBILE_SKELETON_CARD_IDS.slice(0, MOBILE_SKELETON_CARDS).map((cardId) => (
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

function AdminOrdersTableSkeleton() {
  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[900px] xl:min-w-[960px] 2xl:min-w-[1180px]">
      <Table className="min-w-[900px] border-collapse xl:min-w-[960px] 2xl:min-w-[1180px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          <tr className="border-b border-[#2A2A2A]">
            {ADMIN_ORDER_TABLE_COLUMN_IDS.map((columnId) => (
              <TableHead
                key={`admin-orders-table-head-${columnId}`}
                className={cn("h-12 px-4", getHeaderCellClass(columnId))}
              >
                <div className="h-3 w-20 animate-pulse rounded bg-[#2A2A2A]" />
              </TableHead>
            ))}
          </tr>
        </TableHeader>
        <TableBody>
          {ADMIN_ORDER_TABLE_SKELETON_ROW_IDS.slice(0, TABLE_SKELETON_ROWS).map((rowId) => (
            <tr key={rowId} className="border-b border-[#2A2A2A] bg-[#111111]">
              {ADMIN_ORDER_TABLE_COLUMN_IDS.map((columnId) => (
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

function AdminOrdersEmptyState() {
  const tAdmin = useTranslations("admin");

  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <ShoppingCart className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {tAdmin("orders_empty_title")}
      </h2>
      <p className="font-sans mt-2 max-w-md text-sm leading-6 text-[#d0d0d0] md:text-base">
        {tAdmin("orders_empty_description")}
      </p>
    </section>
  );
}

function AdminOrdersErrorState({
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
            {tAdmin("orders_error_title")}
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

function AdminOrdersPagination({
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
      aria-label={tAdmin("orders_pagination_aria")}
      className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
        {totalPages > 0
          ? tAdmin("orders_pagination_page_of", {
              page: currentPage,
              totalPages,
            })
          : tAdmin("orders_pagination_page", { page: currentPage })}
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
          {tAdmin("orders_pagination_previous")}
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          variant="outline"
          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
        >
          {tAdmin("orders_pagination_next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function AdminOrdersView() {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const archiveOrderMutation = useAdminArchiveOrderMutation();
  const {
    status,
    packageId,
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
    setPackageId,
    setSearch,
    setDateRange,
    clearFilters,
    setSort,
    goToNextCursor,
    goToPreviousCursor,
    trail,
  } = useAdminOrdersFilters();

  const [searchDraft, setSearchDraft] = useState(q);
  const deferredSearch = useDeferredValue(searchDraft);
  const [archiveTarget, setArchiveTarget] = useState<OrderActionTarget | null>(null);
  const [archiveReason, setArchiveReason] = useState("");

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
  } = useAdminOrders({
    cursor,
    status,
    packageId,
    dateFrom,
    dateTo,
    q,
    sortBy,
    sortDirection,
  });
  const packagesQuery = usePackages();

  const packageOptions = useMemo(
    () =>
      [...(packagesQuery.data ?? [])]
        .map((pkg) => ({
          id: pkg.id,
          name: pkg.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [packagesQuery.data]
  );

  const handleSort = (columnId: AdminOrderSortField) => {
    if (sortBy === columnId) {
      setSort(columnId, sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    const initialDirection =
      columnId === DEFAULT_ADMIN_ORDER_SORT_BY ? DEFAULT_ADMIN_ORDER_SORT_DIRECTION : "asc";
    setSort(columnId, initialDirection);
  };

  const hasData = items.length > 0;
  const showPagination = hasData || data.totalItems > 0;
  const errorMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : tAdmin("orders_error_description");

  const openArchiveDialog = (target: OrderActionTarget) => {
    setArchiveTarget(target);
    setArchiveReason("");
  };

  const closeArchiveDialog = () => {
    setArchiveTarget(null);
    setArchiveReason("");
  };

  const submitArchive = async () => {
    if (!archiveTarget) return;
    const reason = archiveReason.trim();
    if (reason.length < 5) return;

    try {
      await archiveOrderMutation.mutateAsync({
        orderId: archiveTarget.orderId,
        input: { reason },
      });
      closeArchiveDialog();
    } catch {
      // Keep dialog open for retry.
    }
  };

  return (
    <section className="grid min-w-0 gap-4 md:gap-5">
      <AdminOrdersFilterBar
        locale={locale}
        searchDraft={searchDraft}
        status={status}
        packageId={packageId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        packages={packageOptions}
        packagesLoading={packagesQuery.isLoading}
        onSearchDraftChange={setSearchDraft}
        onStatusChange={(value) => setStatus(value as typeof status)}
        onPackageChange={setPackageId}
        onDateRangeChange={setDateRange}
        onClearFilters={clearFilters}
      />

      <section className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#0A0A0A] p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#8f8f8f]">
            {tAdmin("orders_summary_label")}
          </p>
          <p className="mt-1 font-sans text-sm text-[#d0d0d0] md:text-base">
            {tAdmin("orders_summary_total", {
              shown: items.length,
              total: data.totalItems,
            })}
          </p>
        </div>
        <div aria-live="polite" className="font-sans text-xs text-[#8f8f8f] md:text-sm">
          {isPageTransitioning ? tAdmin("orders_loading_more") : null}
        </div>
      </section>

      {isError ? (
        <AdminOrdersErrorState
          message={errorMessage}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : isInitialLoading ? (
        <DashboardResponsiveDataRegion
          mobileCards={<AdminOrdersMobileSkeleton />}
          desktopTable={<AdminOrdersTableSkeleton />}
        />
      ) : hasData ? (
        <DashboardResponsiveDataRegion
          mobileCards={
            <AdminOrdersMobileCards
              items={items}
              locale={locale}
              transitioning={isPageTransitioning}
              onArchive={openArchiveDialog}
            />
          }
          desktopTable={
            <AdminOrdersDesktopTable
              items={items}
              locale={locale}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSort={handleSort}
              onArchive={openArchiveDialog}
              transitioning={isPageTransitioning}
            />
          }
        />
      ) : (
        <AdminOrdersEmptyState />
      )}

      {!isError && !isInitialLoading && showPagination ? (
        <AdminOrdersPagination
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
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => (!open ? closeArchiveDialog() : null)}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0B0B0B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{tAdmin("orders_archive_dialog_title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#b8b8b8]">
              {tAdmin("orders_archive_dialog_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <label htmlFor="order-archive-reason" className="font-sans text-xs text-[#cfcfcf]">
              {tAdmin("orders_archive_dialog_reason_label")}
            </label>
            <Textarea
              id="order-archive-reason"
              value={archiveReason}
              onChange={(event) => setArchiveReason(event.target.value)}
              placeholder={tAdmin("orders_archive_dialog_reason_placeholder")}
              className="min-h-[90px] border-[#2A2A2A] bg-[#111111] text-white"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveOrderMutation.isPending}>
              {tAdmin("orders_archive_dialog_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveOrderMutation.isPending || archiveReason.trim().length < 5}
              onClick={() => {
                void submitArchive();
              }}
            >
              {tAdmin("orders_action_archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
