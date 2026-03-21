"use client";

import type {
  AdminCreatableRole,
  AdminUserSortField,
  AdminUsersListResponse,
  UserRoleValue,
} from "@bookprinta/shared";
import {
  type Cell,
  type Column,
  createColumnHelper,
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  type Row,
  type SortingState,
  type Table as TanStackTable,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  ShieldX,
  UserRoundCog,
  UserRoundX,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DashboardResponsiveDataRegion,
  DashboardTableViewport,
} from "@/components/dashboard/dashboard-content-frame";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_USER_ROLE_OPTIONS,
  DEFAULT_ADMIN_USER_SORT_BY,
  DEFAULT_ADMIN_USER_SORT_DIRECTION,
  useAdminUsersFilters,
} from "@/hooks/use-admin-users-filters";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  useAdminCreateUserMutation,
  useAdminDeleteUserMutation,
  useAdminReactivateUserMutation,
  useAdminUpdateUserMutation,
} from "@/hooks/useAdminUserActions";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type AdminUserRow = AdminUsersListResponse["items"][number];
type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;
type AdminUserMobileSlot = "primary" | "secondary" | "badges" | "details" | "actions";
type PendingListActionType = "reactivate" | "deactivate" | "delete";
type AdminUserColumnMeta = {
  mobileSlot: AdminUserMobileSlot;
  mobileLabel?: string;
  mobileDetailClassName?: string;
};

const TABLE_SKELETON_ROWS = 6;
const MOBILE_SKELETON_CARDS = 4;
const ADMIN_USER_TABLE_COLUMN_IDS = [
  "fullName",
  "email",
  "role",
  "isVerified",
  "createdAt",
  "actions",
] as const;
const ADMIN_USER_TABLE_TRANSITION_ROW_IDS = ["transition-row-1", "transition-row-2"] as const;
const ADMIN_USER_MOBILE_TRANSITION_CARD_IDS = ["transition-card-1", "transition-card-2"] as const;
const ADMIN_USER_MOBILE_SKELETON_CARD_IDS = [
  "mobile-skeleton-1",
  "mobile-skeleton-2",
  "mobile-skeleton-3",
  "mobile-skeleton-4",
] as const;
const ADMIN_USER_TABLE_SKELETON_ROW_IDS = [
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

const adminUserColumnHelper = createColumnHelper<AdminUserRow>();

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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
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

function formatAdminUserRole(role: UserRoleValue, tAdmin: TranslateFn): string {
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

function AdminUserRoleBadge({
  role,
  label,
  className,
}: {
  role: UserRoleValue;
  label: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        resolveRoleTone(role),
        className
      )}
    >
      {label}
    </Badge>
  );
}

function AdminUserVerificationBadge({ isVerified, label }: { isVerified: boolean; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        isVerified
          ? "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#22c55e]"
          : "border-[#f59e0b]/45 bg-[#f59e0b]/15 text-[#f59e0b]"
      )}
    >
      {isVerified ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : null}
      {!isVerified ? <ShieldX className="size-3.5" aria-hidden="true" /> : null}
      <span>{label}</span>
    </Badge>
  );
}

function AdminUserAccountBadge({
  isActive,
  isDeleted,
  label,
}: {
  isActive: boolean;
  isDeleted?: boolean;
  label: string;
}) {
  const tone = isDeleted
    ? "border-[#ef4444]/60 bg-[#ef4444]/20 text-[#ff8a8a]"
    : isActive
      ? "border-[#2A2A2A] bg-[#0F0F0F] text-[#bdbdbd]"
      : "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#ef4444]";

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-medium tracking-[0.01em]",
        tone
      )}
    >
      {isDeleted ? (
        <UserRoundX className="size-3.5" aria-hidden="true" />
      ) : isActive ? (
        <UserRoundCog className="size-3.5" aria-hidden="true" />
      ) : (
        <UserRoundX className="size-3.5" aria-hidden="true" />
      )}
      <span>{label}</span>
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
  column: Column<AdminUserRow, unknown>
): "ascending" | "descending" | "none" {
  const sortState = column.getIsSorted();

  if (sortState === "asc") return "ascending";
  if (sortState === "desc") return "descending";
  return "none";
}

function SortableHeader({
  label,
  column,
  className,
}: {
  label: string;
  column: Column<AdminUserRow, unknown>;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 font-sans text-[11px] font-medium tracking-[0.08em] text-[#7D7D7D] uppercase",
          className
        )}
      >
        {label}
      </span>
    );
  }

  const sortState = column.getIsSorted();
  const isActive = sortState !== false;
  const direction = sortState === "asc" ? "asc" : "desc";

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "inline-flex items-center gap-2 font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
        className
      )}
    >
      <span>{label}</span>
      <SortIndicator active={isActive} direction={direction} />
    </button>
  );
}

function getHeaderCellClass(columnId: string): string {
  if (columnId === "fullName") return "min-w-[14rem]";
  if (columnId === "email") return "min-w-[15rem]";
  if (columnId === "role") return "min-w-[10rem]";
  if (columnId === "isVerified") return "min-w-[12rem]";
  if (columnId === "createdAt") return "min-w-[8rem]";
  if (columnId === "actions") return "min-w-[9rem] text-right";
  return "";
}

function getBodyCellClass(columnId: string): string {
  if (columnId === "email") return "max-w-[18rem]";
  if (columnId === "actions") return "text-right whitespace-nowrap";
  return "";
}

function getAdminUserColumnMeta(cell: Cell<AdminUserRow, unknown>): AdminUserColumnMeta | null {
  const meta = cell.column.columnDef.meta as AdminUserColumnMeta | undefined;
  return meta ?? null;
}

function getAdminUserMobileCells(params: { row: Row<AdminUserRow>; slot: AdminUserMobileSlot }) {
  return params.row
    .getVisibleCells()
    .filter((cell) => getAdminUserColumnMeta(cell)?.mobileSlot === params.slot);
}

const ADMIN_CREATABLE_ROLES: { value: AdminCreatableRole; labelKey: string }[] = [
  { value: "ADMIN", labelKey: "role_admin" },
  { value: "EDITOR", labelKey: "role_editor" },
  { value: "MANAGER", labelKey: "role_manager" },
];

function CreateAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tAdmin = useTranslations("admin");
  const createMutation = useAdminCreateUserMutation();
  const formRef = useRef<HTMLFormElement>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    formRef.current?.reset();
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const email = (formData.get("email") as string)?.trim() ?? "";
    const firstName = (formData.get("firstName") as string)?.trim() ?? "";
    const lastName = (formData.get("lastName") as string)?.trim() ?? "";
    const password = (formData.get("password") as string) ?? "";
    const role = formData.get("role") as AdminCreatableRole;

    if (!email || !firstName || !password || !role) {
      setFormError("All required fields must be filled.");
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        input: {
          email,
          firstName,
          ...(lastName ? { lastName } : {}),
          password,
          role,
        },
      });

      toast.success(tAdmin("users_create_success"), {
        description: tAdmin("users_create_success_description", {
          fullName: result.fullName,
          email: result.email,
          role: formatAdminUserRole(result.role as UserRoleValue, tAdmin),
        }),
      });

      resetForm();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : tAdmin("users_create_error");
      setFormError(message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-[#2A2A2A] bg-[#111111] text-white sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-tight">
            {tAdmin("users_create_dialog_title")}
          </DialogTitle>
          <DialogDescription className="font-sans text-sm text-[#B4B4B4]">
            {tAdmin("users_create_dialog_description")}
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="create-admin-email" className="font-sans text-sm text-[#d0d0d0]">
              {tAdmin("users_create_email")}
            </Label>
            <Input
              id="create-admin-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder={tAdmin("users_create_email_placeholder")}
              className="min-h-11 rounded-xl border-[#2A2A2A] bg-[#080808] text-white placeholder:text-[#6f6f6f] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="create-admin-first-name" className="font-sans text-sm text-[#d0d0d0]">
                {tAdmin("users_create_first_name")}
              </Label>
              <Input
                id="create-admin-first-name"
                name="firstName"
                type="text"
                required
                autoComplete="off"
                placeholder={tAdmin("users_create_first_name_placeholder")}
                className="min-h-11 rounded-xl border-[#2A2A2A] bg-[#080808] text-white placeholder:text-[#6f6f6f] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-admin-last-name" className="font-sans text-sm text-[#d0d0d0]">
                {tAdmin("users_create_last_name")}
              </Label>
              <Input
                id="create-admin-last-name"
                name="lastName"
                type="text"
                autoComplete="off"
                placeholder={tAdmin("users_create_last_name_placeholder")}
                className="min-h-11 rounded-xl border-[#2A2A2A] bg-[#080808] text-white placeholder:text-[#6f6f6f] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-admin-password" className="font-sans text-sm text-[#d0d0d0]">
              {tAdmin("users_create_password")}
            </Label>
            <Input
              id="create-admin-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={tAdmin("users_create_password_placeholder")}
              className="min-h-11 rounded-xl border-[#2A2A2A] bg-[#080808] text-white placeholder:text-[#6f6f6f] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-admin-role" className="font-sans text-sm text-[#d0d0d0]">
              {tAdmin("users_create_role")}
            </Label>
            <select
              id="create-admin-role"
              name="role"
              required
              defaultValue=""
              className="min-h-11 w-full appearance-none rounded-xl border border-[#2A2A2A] bg-[#080808] px-4 font-sans text-sm text-white outline-none placeholder:text-[#6f6f6f] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
            >
              <option value="" disabled>
                {tAdmin("users_create_role_placeholder")}
              </option>
              {ADMIN_CREATABLE_ROLES.map(({ value, labelKey }) => (
                <option key={value} value={value}>
                  {tAdmin(labelKey)}
                </option>
              ))}
            </select>
          </div>

          {formError ? (
            <p className="flex items-center gap-2 font-sans text-sm text-[#ef4444]">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          ) : null}

          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] px-5 font-sans text-sm text-white hover:bg-[#101010]"
            >
              {tAdmin("users_create_cancel")}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0066cc]"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  {tAdmin("users_create_submitting")}
                </>
              ) : (
                tAdmin("users_create_submit")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminUsersFilterBar({
  searchDraft,
  role,
  isVerified,
  includeDeleted,
  activeFilterCount,
  hasActiveFilters,
  onSearchDraftChange,
  onRoleChange,
  onVerificationChange,
  onIncludeDeletedChange,
  onClearFilters,
}: {
  searchDraft: string;
  role: UserRoleValue | "";
  isVerified: boolean | "";
  includeDeleted: boolean | "";
  activeFilterCount: number;
  hasActiveFilters: boolean;
  onSearchDraftChange: (value: string) => void;
  onRoleChange: (value: UserRoleValue | "") => void;
  onVerificationChange: (value: boolean | "") => void;
  onIncludeDeletedChange: (value: boolean) => void;
  onClearFilters: () => void;
}) {
  const tAdmin = useTranslations("admin");
  const sectionTitleId = useId();
  const searchInputId = useId();
  const roleSelectId = useId();
  const includeDeletedId = useId();
  const verificationSelectId = useId();
  const verificationValue = typeof isVerified === "boolean" ? String(isVerified) : "";

  return (
    <section
      aria-labelledby={sectionTitleId}
      className="rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
            {tAdmin("panel_label")}
          </p>
          <h2
            id={sectionTitleId}
            className="font-display mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl"
          >
            {tAdmin("users")}
          </h2>
          <p className="font-sans mt-2 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
            {tAdmin("users_workspace_description")}
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
              ? tAdmin("users_filters_active", { count: activeFilterCount })
              : tAdmin("users_filters_idle")}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] px-4 font-sans text-xs font-medium text-white hover:border-[#007eff] hover:bg-[#101010] disabled:opacity-45"
          >
            {tAdmin("users_filters_clear")}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,1fr))]">
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <label
            htmlFor={searchInputId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("users_filters_search_label")}
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
              placeholder={tAdmin("users_filters_search_placeholder")}
              aria-label={tAdmin("users_filters_search_label")}
              className={cn(
                getFilterControlClass(Boolean(searchDraft)),
                "pl-11 text-white md:text-sm"
              )}
            />
          </div>
        </div>

        <div className="min-w-0">
          <label
            htmlFor={roleSelectId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("users_filters_role_label")}
          </label>
          <select
            id={roleSelectId}
            value={role}
            onChange={(event) => onRoleChange((event.target.value || "") as UserRoleValue | "")}
            className={cn(getFilterControlClass(Boolean(role)), "w-full appearance-none")}
            aria-label={tAdmin("users_filters_role_label")}
          >
            <option value="">{tAdmin("users_filters_all_roles")}</option>
            {ADMIN_USER_ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {formatAdminUserRole(roleOption, tAdmin)}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor={verificationSelectId}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("users_filters_verified_label")}
          </label>
          <select
            id={verificationSelectId}
            value={verificationValue}
            onChange={(event) =>
              onVerificationChange(
                event.target.value === "true" ? true : event.target.value === "false" ? false : ""
              )
            }
            className={cn(
              getFilterControlClass(typeof isVerified === "boolean"),
              "w-full appearance-none"
            )}
            aria-label={tAdmin("users_filters_verified_label")}
          >
            <option value="">{tAdmin("users_filters_all_verification")}</option>
            <option value="true">{tAdmin("users_filters_verified_true")}</option>
            <option value="false">{tAdmin("users_filters_verified_false")}</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          id={includeDeletedId}
          type="checkbox"
          checked={includeDeleted === true}
          onChange={(event) => onIncludeDeletedChange(event.target.checked)}
          className="size-4 rounded border-[#2A2A2A] bg-[#0B0B0B] accent-[#007eff]"
        />
        <label htmlFor={includeDeletedId} className="font-sans text-xs font-medium text-[#8f8f8f]">
          {tAdmin("users_filters_include_deleted")}
        </label>
      </div>
    </section>
  );
}

function AdminUsersDesktopTable({
  table,
  transitioning,
}: {
  table: TanStackTable<AdminUserRow>;
  transitioning: boolean;
}) {
  return (
    <DashboardTableViewport
      className="touch-pan-x"
      minWidthClassName="md:min-w-[1020px] xl:min-w-[1080px]"
    >
      <Table className="min-w-[1020px] border-collapse xl:min-w-[1080px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-b border-[#2A2A2A] hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.id === "actions"
                      ? undefined
                      : resolveAriaSort(header.column as Column<AdminUserRow, unknown>)
                  }
                  className={cn("h-12 px-4 align-middle", getHeaderCellClass(header.id))}
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
            <TableRow
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
            </TableRow>
          ))}
          {transitioning
            ? ADMIN_USER_TABLE_TRANSITION_ROW_IDS.map((rowId) => (
                <TableRow
                  key={rowId}
                  aria-hidden="true"
                  className="border-b border-[#2A2A2A] bg-[#111111] hover:bg-[#111111]"
                >
                  {ADMIN_USER_TABLE_COLUMN_IDS.map((columnId) => (
                    <TableCell
                      key={`${rowId}-${columnId}`}
                      className={cn("px-4 py-4", getBodyCellClass(columnId))}
                    >
                      <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

function AdminUsersMobileCards({
  table,
  transitioning,
}: {
  table: TanStackTable<AdminUserRow>;
  transitioning: boolean;
}) {
  return (
    <>
      {table.getRowModel().rows.map((row) => {
        const primaryCells = getAdminUserMobileCells({ row, slot: "primary" });
        const secondaryCells = getAdminUserMobileCells({ row, slot: "secondary" });
        const badgeCells = getAdminUserMobileCells({ row, slot: "badges" });
        const detailCells = getAdminUserMobileCells({ row, slot: "details" });
        const actionCells = getAdminUserMobileCells({ row, slot: "actions" });

        return (
          <article
            key={row.id}
            className="overflow-hidden rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4 transition-colors duration-150 hover:bg-[#1A1A1A]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {primaryCells.map((cell) => (
                  <div key={cell.id} className="min-w-0">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
                {secondaryCells.map((cell) => (
                  <div key={cell.id} className="mt-1 min-w-0">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
              <div className="shrink-0">
                {badgeCells.map((cell) => (
                  <div key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            </div>

            {detailCells.length > 0 ? (
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {detailCells.map((cell) => {
                  const meta = getAdminUserColumnMeta(cell);

                  return (
                    <div key={cell.id} className={cn("min-w-0", meta?.mobileDetailClassName)}>
                      {meta?.mobileLabel ? (
                        <dt className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                          {meta.mobileLabel}
                        </dt>
                      ) : null}
                      <dd className="mt-1 min-w-0">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}

            {actionCells.map((cell) => (
              <div key={cell.id} className="mt-4">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ))}
          </article>
        );
      })}

      {transitioning
        ? ADMIN_USER_MOBILE_TRANSITION_CARD_IDS.map((cardId) => (
            <div
              key={cardId}
              aria-hidden="true"
              className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="h-5 w-1/2 animate-pulse rounded bg-[#2A2A2A]" />
                <div className="h-6 w-24 animate-pulse rounded-full bg-[#2A2A2A]" />
              </div>
              <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-[#2A2A2A]" />
              <div className="mt-4 flex gap-2">
                <div className="h-6 w-28 animate-pulse rounded-full bg-[#2A2A2A]" />
                <div className="h-6 w-28 animate-pulse rounded-full bg-[#2A2A2A]" />
              </div>
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

function AdminUsersMobileSkeleton() {
  return (
    <>
      {ADMIN_USER_MOBILE_SKELETON_CARD_IDS.slice(0, MOBILE_SKELETON_CARDS).map((cardId) => (
        <div
          key={cardId}
          aria-hidden="true"
          className="rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="h-5 w-1/2 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-[#2A2A2A]" />
          </div>
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-[#2A2A2A]" />
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-28 animate-pulse rounded-full bg-[#2A2A2A]" />
            <div className="h-6 w-28 animate-pulse rounded-full bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[#2A2A2A]" />
            <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
          </div>
          <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-[#2A2A2A]" />
        </div>
      ))}
    </>
  );
}

function AdminUsersTableSkeleton() {
  return (
    <DashboardTableViewport minWidthClassName="md:min-w-[1020px] xl:min-w-[1080px]">
      <Table className="min-w-[1020px] border-collapse xl:min-w-[1080px]">
        <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
          <TableRow className="border-b border-[#2A2A2A] hover:bg-transparent">
            {ADMIN_USER_TABLE_COLUMN_IDS.map((columnId) => (
              <TableHead key={`admin-users-table-head-${columnId}`} className="h-12 px-4">
                <div className="h-3 w-20 animate-pulse rounded bg-[#2A2A2A]" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ADMIN_USER_TABLE_SKELETON_ROW_IDS.slice(0, TABLE_SKELETON_ROWS).map((rowId) => (
            <TableRow
              key={rowId}
              aria-hidden="true"
              className="border-b border-[#2A2A2A] bg-[#111111] hover:bg-[#111111]"
            >
              {ADMIN_USER_TABLE_COLUMN_IDS.map((columnId) => (
                <TableCell key={`${rowId}-${columnId}`} className="px-4 py-4">
                  <div className="h-4 w-full animate-pulse rounded bg-[#2A2A2A]" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DashboardTableViewport>
  );
}

function AdminUsersEmptyState({
  hasActiveFilters,
  onClearFilters,
}: {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const tAdmin = useTranslations("admin");

  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-[#2A2A2A] bg-[#111111] px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#000000]">
        <Users className="size-7 text-[#007eff]" aria-hidden="true" />
      </div>
      <h2 className="font-display mt-5 text-2xl font-semibold tracking-tight text-white">
        {tAdmin("users_empty_title")}
      </h2>
      <p className="font-sans mt-2 max-w-md text-sm leading-6 text-[#d0d0d0] md:text-base">
        {hasActiveFilters
          ? tAdmin("users_empty_filtered_description")
          : tAdmin("users_empty_description")}
      </p>
      {hasActiveFilters ? (
        <Button
          type="button"
          variant="outline"
          onClick={onClearFilters}
          className="mt-5 min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-5 font-sans text-sm text-white hover:border-[#007eff] hover:bg-[#101010]"
        >
          {tAdmin("users_filters_clear")}
        </Button>
      ) : null}
    </section>
  );
}

function AdminUsersErrorState({
  message,
  onRetry,
  isRetrying,
  hasActiveFilters,
  onClearFilters,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");

  return (
    <section className="rounded-[1.5rem] border border-[#ef4444]/45 bg-[#111111] p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-[#ef4444]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-white">
            {tAdmin("users_error_title")}
          </h2>
          <p className="font-sans mt-1 text-sm leading-6 text-[#d0d0d0]">{message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-5 font-sans text-sm text-white hover:bg-[#101010]"
            >
              {isRetrying ? tCommon("loading") : tCommon("retry")}
            </Button>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                onClick={onClearFilters}
                className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#007eff] hover:bg-[#101010]"
              >
                {tAdmin("users_filters_clear")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminUsersPagination({
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
      aria-label={tAdmin("users_pagination_aria")}
      className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between"
    >
      <p className="font-sans text-xs font-medium text-[#d0d0d0] md:text-sm">
        {totalPages > 0
          ? tAdmin("users_pagination_page_of", {
              page: currentPage,
              totalPages,
            })
          : tAdmin("users_pagination_page", { page: currentPage })}
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
          {tAdmin("users_pagination_previous")}
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          variant="outline"
          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
        >
          {tAdmin("users_pagination_next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function AdminUsersView() {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const { user: sessionUser } = useAuthSession();
  const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const updateMutation = useAdminUpdateUserMutation();
  const deleteMutation = useAdminDeleteUserMutation();
  const reactivateMutation = useAdminReactivateUserMutation();
  const [pendingListAction, setPendingListAction] = useState<{
    userId: string;
    action: PendingListActionType;
  } | null>(null);
  const {
    role,
    isVerified,
    q,
    cursor,
    sortBy,
    sortDirection,
    currentPage,
    activeFilterCount,
    hasActiveFilters,
    setRole,
    setVerification,
    setIncludeDeleted,
    setSearch,
    clearFilters,
    setSort,
    goToNextCursor,
    goToPreviousCursor,
    trail,
    includeDeleted,
  } = useAdminUsersFilters();

  const [searchDraft, setSearchDraft] = useState(q);
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

  const {
    data,
    items,
    isError,
    error,
    refetch,
    isFetching,
    isInitialLoading,
    isPageTransitioning,
  } = useAdminUsers({
    cursor,
    q,
    role,
    isVerified,
    includeDeleted,
    sortBy,
    sortDirection,
  });
  const sortableFieldSet = useMemo(() => new Set(data.sortableFields), [data.sortableFields]);

  const sorting = useMemo<SortingState>(
    () => [
      {
        id: sortBy,
        desc: sortDirection === "desc",
      },
    ],
    [sortBy, sortDirection]
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const nextSorting = functionalUpdate(updater, sorting);
      const nextColumn = nextSorting[0];

      if (!nextColumn) {
        setSort(DEFAULT_ADMIN_USER_SORT_BY, DEFAULT_ADMIN_USER_SORT_DIRECTION);
        return;
      }

      setSort(nextColumn.id as AdminUserSortField, nextColumn.desc ? "desc" : "asc");
    },
    [setSort, sorting]
  );

  const runListAction = useCallback(
    async (
      params: {
        userId: string;
        action: PendingListActionType;
      },
      execute: () => Promise<void>
    ) => {
      if (pendingListAction) {
        return;
      }

      setPendingListAction({
        userId: params.userId,
        action: params.action,
      });

      try {
        await execute();
      } finally {
        setPendingListAction((current) => {
          if (!current) return current;
          if (current.userId !== params.userId || current.action !== params.action) return current;
          return null;
        });
      }
    },
    [pendingListAction]
  );

  const handleReactivateFromList = useCallback(
    async (row: AdminUserRow) => {
      await runListAction(
        {
          userId: row.id,
          action: "reactivate",
        },
        async () => {
          const response = await reactivateMutation.mutateAsync({
            userId: row.id,
          });

          toast.success(tAdmin("users_action_reactivate_success"), {
            description: tAdmin("users_detail_save_success_description", {
              action: response.audit.action,
              date: formatAdminDate(
                response.audit.recordedAt,
                locale,
                tAdmin("users_detail_unknown")
              ),
            }),
          });
        }
      );
    },
    [locale, reactivateMutation, runListAction, tAdmin]
  );

  const handleDeactivateFromList = useCallback(
    async (row: AdminUserRow) => {
      await runListAction(
        {
          userId: row.id,
          action: "deactivate",
        },
        async () => {
          try {
            const response = await updateMutation.mutateAsync({
              userId: row.id,
              input: {
                isActive: false,
              },
            });

            toast.success(tAdmin("users_detail_deactivate_success"), {
              description: tAdmin("users_detail_save_success_description", {
                action: response.audit.action,
                date: formatAdminDate(
                  response.audit.recordedAt,
                  locale,
                  tAdmin("users_detail_unknown")
                ),
              }),
            });
          } catch (error) {
            toast.error(tAdmin("users_detail_deactivate_error_title"), {
              description: getErrorMessage(
                error,
                tAdmin("users_detail_deactivate_error_description")
              ),
            });
          }
        }
      );
    },
    [locale, runListAction, tAdmin, updateMutation]
  );

  const handleDeleteFromList = useCallback(
    async (row: AdminUserRow) => {
      await runListAction(
        {
          userId: row.id,
          action: "delete",
        },
        async () => {
          try {
            await deleteMutation.mutateAsync({
              userId: row.id,
            });

            toast.success(tAdmin("users_detail_delete_success"), {
              description: tAdmin("users_detail_delete_success_description"),
            });
          } catch (error) {
            toast.error(tAdmin("users_detail_delete_error_title"), {
              description: getErrorMessage(error, tAdmin("users_detail_delete_error_description")),
            });
          }
        }
      );
    },
    [deleteMutation, runListAction, tAdmin]
  );

  const columns = useMemo(
    () => [
      adminUserColumnHelper.accessor("fullName", {
        id: "fullName",
        enableSorting: sortableFieldSet.has("fullName"),
        meta: {
          mobileSlot: "primary",
        } satisfies AdminUserColumnMeta,
        header: ({ column }) => (
          <SortableHeader label={tAdmin("users_table_name")} column={column} />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-display text-lg font-semibold tracking-tight text-white">
                {row.original.fullName}
              </p>
              {!row.original.isActive ? (
                <AdminUserAccountBadge isActive={false} label={tAdmin("users_status_inactive")} />
              ) : null}
              {row.original.isDeleted ? (
                <AdminUserAccountBadge
                  isActive={false}
                  isDeleted
                  label={tAdmin("users_status_deleted")}
                />
              ) : null}
            </div>
          </div>
        ),
      }),
      adminUserColumnHelper.accessor("email", {
        id: "email",
        enableSorting: sortableFieldSet.has("email"),
        meta: {
          mobileSlot: "secondary",
          mobileLabel: tAdmin("users_table_email"),
        } satisfies AdminUserColumnMeta,
        header: ({ column }) => (
          <SortableHeader label={tAdmin("users_table_email")} column={column} />
        ),
        cell: ({ row }) => (
          <p className="truncate font-sans text-sm text-[#d0d0d0]">{row.original.email}</p>
        ),
      }),
      adminUserColumnHelper.accessor("role", {
        id: "role",
        enableSorting: sortableFieldSet.has("role"),
        meta: {
          mobileSlot: "badges",
        } satisfies AdminUserColumnMeta,
        header: ({ column }) => (
          <SortableHeader label={tAdmin("users_table_role")} column={column} />
        ),
        cell: ({ row }) => (
          <AdminUserRoleBadge
            role={row.original.role}
            label={formatAdminUserRole(row.original.role, tAdmin)}
          />
        ),
      }),
      adminUserColumnHelper.accessor("isVerified", {
        id: "isVerified",
        enableSorting: sortableFieldSet.has("isVerified"),
        meta: {
          mobileSlot: "details",
          mobileLabel: tAdmin("users_table_verified"),
        } satisfies AdminUserColumnMeta,
        header: ({ column }) => (
          <SortableHeader label={tAdmin("users_table_verified")} column={column} />
        ),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <AdminUserVerificationBadge
              isVerified={row.original.isVerified}
              label={
                row.original.isVerified
                  ? tAdmin("users_status_verified")
                  : tAdmin("users_status_unverified")
              }
            />
            <AdminUserAccountBadge
              isActive={row.original.isActive}
              isDeleted={row.original.isDeleted}
              label={
                row.original.isDeleted
                  ? tAdmin("users_status_deleted")
                  : row.original.isActive
                    ? tAdmin("users_status_active")
                    : tAdmin("users_status_inactive")
              }
            />
          </div>
        ),
      }),
      adminUserColumnHelper.accessor("createdAt", {
        id: "createdAt",
        enableSorting: sortableFieldSet.has("createdAt"),
        meta: {
          mobileSlot: "details",
          mobileLabel: tAdmin("users_table_joined"),
          mobileDetailClassName: "text-right",
        } satisfies AdminUserColumnMeta,
        header: ({ column }) => (
          <SortableHeader label={tAdmin("users_table_joined")} column={column} />
        ),
        cell: ({ row }) => (
          <p className="font-sans text-sm text-[#d0d0d0]">
            {formatAdminDate(row.original.createdAt, locale, tAdmin("users_joined_unavailable"))}
          </p>
        ),
      }),
      adminUserColumnHelper.display({
        id: "actions",
        enableSorting: false,
        meta: {
          mobileSlot: "actions",
        } satisfies AdminUserColumnMeta,
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#bdbdbd] uppercase">
            {tAdmin("users_table_actions")}
          </span>
        ),
        cell: ({ row }) => {
          const isReactivatePending =
            pendingListAction?.userId === row.original.id &&
            pendingListAction.action === "reactivate";
          const isDeactivatePending =
            pendingListAction?.userId === row.original.id &&
            pendingListAction.action === "deactivate";
          const isDeletePending =
            pendingListAction?.userId === row.original.id && pendingListAction.action === "delete";
          const anyRowActionPending = isReactivatePending || isDeactivatePending || isDeletePending;

          return (
            <div className="flex w-full items-center justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={anyRowActionPending}
                    className="size-11 rounded-full border-[#2A2A2A] bg-[#000000] p-0 text-white hover:border-[#007eff] hover:bg-[#101010] disabled:opacity-55"
                    aria-label={tAdmin("users_actions_menu_sr")}
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-[14.5rem] rounded-2xl border-[#2A2A2A] bg-[#111111] p-1.5 text-white"
                >
                  <DropdownMenuItem asChild className="min-h-11 rounded-xl font-sans text-sm">
                    <Link href={row.original.detailUrl}>
                      <span>{tAdmin("users_action_view")}</span>
                      <span className="sr-only"> {row.original.fullName}</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 bg-[#2A2A2A]" />

                  {row.original.isDeleted ? (
                    <DropdownMenuItem
                      disabled
                      className="min-h-11 rounded-xl font-sans text-sm text-[#666]"
                    >
                      <span>{tAdmin("users_status_deleted")}</span>
                    </DropdownMenuItem>
                  ) : row.original.isActive ? (
                    <DropdownMenuItem
                      disabled={isDeactivatePending}
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleDeactivateFromList(row.original);
                      }}
                      className="min-h-11 rounded-xl font-sans text-sm"
                    >
                      <span>{tAdmin("users_detail_deactivate_confirm")}</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={isReactivatePending}
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleReactivateFromList(row.original);
                      }}
                      className="min-h-11 rounded-xl font-sans text-sm"
                    >
                      <span>
                        {isReactivatePending
                          ? tAdmin("users_action_reactivating")
                          : tAdmin("users_action_reactivate")}
                      </span>
                    </DropdownMenuItem>
                  )}

                  {!row.original.isDeleted ? (
                    <DropdownMenuItem
                      disabled={isDeletePending}
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleDeleteFromList(row.original);
                      }}
                      className="min-h-11 rounded-xl font-sans text-sm text-[#ffb3b3] focus:text-[#ffb3b3]"
                    >
                      <span>
                        {isDeletePending
                          ? tAdmin("users_detail_deleting")
                          : tAdmin("users_detail_delete")}
                      </span>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }),
    ],
    [
      handleDeactivateFromList,
      handleDeleteFromList,
      handleReactivateFromList,
      locale,
      pendingListAction,
      sortableFieldSet,
      tAdmin,
    ]
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    state: {
      sorting,
    },
    onSortingChange: handleSortingChange,
  });

  const hasData = items.length > 0;
  const showPagination = hasData || data.totalItems > 0;
  const errorMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : tAdmin("users_error_description");

  return (
    <section aria-busy={isFetching} className="grid min-w-0 gap-4 md:gap-5">
      <AdminUsersFilterBar
        searchDraft={searchDraft}
        role={role}
        isVerified={isVerified}
        includeDeleted={includeDeleted}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        onSearchDraftChange={setSearchDraft}
        onRoleChange={setRole}
        onVerificationChange={setVerification}
        onIncludeDeletedChange={setIncludeDeleted}
        onClearFilters={clearFilters}
      />

      <section className="flex flex-col gap-3 overflow-hidden rounded-[1.35rem] border border-[#2A2A2A] bg-[#0A0A0A] p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#8f8f8f]">
            {tAdmin("users_summary_label")}
          </p>
          <p className="mt-1 truncate font-sans text-sm text-[#d0d0d0] md:text-base">
            {tAdmin("users_summary_total", {
              shown: items.length,
              total: data.totalItems,
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div aria-live="polite" className="font-sans text-xs text-[#8f8f8f] md:text-sm">
            {isPageTransitioning ? tAdmin("users_loading_more") : null}
          </div>
          {isSuperAdmin ? (
            <Button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0066cc]"
            >
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {tAdmin("users_create_button")}
            </Button>
          ) : null}
        </div>
      </section>

      {isError ? (
        <AdminUsersErrorState
          message={errorMessage}
          onRetry={() => refetch()}
          isRetrying={isFetching}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />
      ) : isInitialLoading ? (
        <DashboardResponsiveDataRegion
          mobileCards={<AdminUsersMobileSkeleton />}
          desktopTable={<AdminUsersTableSkeleton />}
        />
      ) : hasData ? (
        <DashboardResponsiveDataRegion
          mobileCards={<AdminUsersMobileCards table={table} transitioning={isPageTransitioning} />}
          desktopTable={
            <AdminUsersDesktopTable table={table} transitioning={isPageTransitioning} />
          }
        />
      ) : (
        <AdminUsersEmptyState hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters} />
      )}

      {!isError && !isInitialLoading && showPagination ? (
        <AdminUsersPagination
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

      {isSuperAdmin ? (
        <CreateAdminDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      ) : null}
    </section>
  );
}
