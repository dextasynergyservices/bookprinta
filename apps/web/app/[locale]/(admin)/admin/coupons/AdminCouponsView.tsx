"use client";

import type {
  Coupon,
  CouponDiscountType,
  CreateCouponInput,
  UpdateCouponInput,
} from "@bookprinta/shared";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertCircle, MoreHorizontal, Pencil, Power, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AdminCouponAnalyticsItem,
  useAdminCouponAnalytics,
  useAdminCoupons,
  useCreateAdminCouponMutation,
  useDeleteAdminCouponMutation,
  useToggleAdminCouponActiveMutation,
  useUpdateAdminCouponMutation,
} from "@/hooks/useAdminCoupons";
import { usePackages } from "@/hooks/usePackages";
import { cn } from "@/lib/utils";

type CouponFormState = {
  code: string;
  discountType: CouponDiscountType;
  discountValue: string;
  hasMaxUses: boolean;
  maxUses: string;
  hasExpiry: boolean;
  expiresAt: string;
  isActive: boolean;
  appliesToAll: boolean;
  eligiblePackageIds: string[];
  eligibleCategoryIds: string[];
};

type CouponValidationErrors = Partial<Record<keyof CouponFormState | "eligibleTargets", string>>;

type CouponRowModel = Coupon & {
  isExpired: boolean;
  usagePercent: number;
};

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const couponColumnHelper = createColumnHelper<CouponRowModel>();

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function isCouponExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return false;
  return expiresAtMs <= Date.now();
}

function toDateTimeLocalInput(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60_000;
  const localDate = new Date(date.getTime() - offsetMs);
  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string | null {
  if (!value.trim()) return null;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return parsedDate.toISOString();
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function getInitialFormState(): CouponFormState {
  return {
    code: "",
    discountType: "percentage",
    discountValue: "",
    hasMaxUses: false,
    maxUses: "",
    hasExpiry: false,
    expiresAt: "",
    isActive: true,
    appliesToAll: true,
    eligiblePackageIds: [],
    eligibleCategoryIds: [],
  };
}

function toFormState(coupon: Coupon): CouponFormState {
  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: String(coupon.discountValue),
    hasMaxUses: coupon.maxUses !== null,
    maxUses: coupon.maxUses !== null ? String(coupon.maxUses) : "",
    hasExpiry: coupon.expiresAt !== null,
    expiresAt: toDateTimeLocalInput(coupon.expiresAt),
    isActive: coupon.isActive,
    appliesToAll: coupon.appliesToAll,
    eligiblePackageIds: coupon.eligiblePackageIds,
    eligibleCategoryIds: coupon.eligibleCategoryIds,
  };
}

function resolveUsagePercent(coupon: Coupon): number {
  if (coupon.maxUses === null || coupon.maxUses <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((coupon.currentUses / coupon.maxUses) * 100)));
}

function validateFormState(params: {
  state: CouponFormState;
  tAdmin: ReturnType<typeof useTranslations>;
  availablePackageIds: Set<string>;
  availableCategoryIds: Set<string>;
}): {
  errors: CouponValidationErrors;
  createPayload?: CreateCouponInput;
  updatePayload?: UpdateCouponInput;
} {
  const errors: CouponValidationErrors = {};
  const code = params.state.code.trim().toUpperCase();
  const discountValue = Number.parseFloat(params.state.discountValue);

  if (!code) {
    errors.code = params.tAdmin("coupons_validation_code_required");
  } else if (!/^[A-Z0-9_-]+$/.test(code)) {
    errors.code = params.tAdmin("coupons_validation_code_pattern");
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    errors.discountValue = params.tAdmin("coupons_validation_discount_value_required");
  }

  if (params.state.discountType === "percentage" && Number.isFinite(discountValue)) {
    if (discountValue > 100) {
      errors.discountValue = params.tAdmin("coupons_validation_discount_percentage_max");
    }
  }

  let maxUses: number | null = null;
  if (params.state.hasMaxUses) {
    const parsedMaxUses = Number.parseInt(params.state.maxUses, 10);
    if (!Number.isFinite(parsedMaxUses) || parsedMaxUses < 1) {
      errors.maxUses = params.tAdmin("coupons_validation_max_uses_required");
    } else {
      maxUses = parsedMaxUses;
    }
  }

  let expiresAt: string | null = null;
  if (params.state.hasExpiry) {
    const parsed = toIsoDateTime(params.state.expiresAt);
    if (!parsed) {
      errors.expiresAt = params.tAdmin("coupons_validation_expires_at_invalid");
    } else {
      expiresAt = parsed;
    }
  }

  const eligiblePackageIds = Array.from(new Set(params.state.eligiblePackageIds));
  const eligibleCategoryIds = Array.from(new Set(params.state.eligibleCategoryIds));

  if (!params.state.appliesToAll) {
    if (eligiblePackageIds.length === 0 && eligibleCategoryIds.length === 0) {
      errors.eligibleTargets = params.tAdmin("coupons_validation_eligible_required");
    }

    if (eligiblePackageIds.some((id) => !params.availablePackageIds.has(id))) {
      errors.eligibleTargets = params.tAdmin("coupons_validation_eligible_packages_invalid");
    }

    if (eligibleCategoryIds.some((id) => !params.availableCategoryIds.has(id))) {
      errors.eligibleTargets = params.tAdmin("coupons_validation_eligible_categories_invalid");
    }
  }

  if (Object.keys(errors).length > 0 || !Number.isFinite(discountValue) || discountValue <= 0) {
    return { errors };
  }

  const createPayload: CreateCouponInput = {
    code,
    discountType: params.state.discountType,
    discountValue,
    maxUses,
    expiresAt,
    isActive: params.state.isActive,
    appliesToAll: params.state.appliesToAll,
    eligiblePackageIds: params.state.appliesToAll ? [] : eligiblePackageIds,
    eligibleCategoryIds: params.state.appliesToAll ? [] : eligibleCategoryIds,
  };

  const updatePayload: UpdateCouponInput = {
    code,
    discountType: params.state.discountType,
    discountValue,
    maxUses,
    expiresAt,
    isActive: params.state.isActive,
    appliesToAll: params.state.appliesToAll,
    eligiblePackageIds: params.state.appliesToAll ? [] : eligiblePackageIds,
    eligibleCategoryIds: params.state.appliesToAll ? [] : eligibleCategoryIds,
  };

  return {
    errors,
    createPayload,
    updatePayload,
  };
}

function CouponStatusPill({
  isActive,
  tAdmin,
}: {
  isActive: boolean;
  tAdmin: ReturnType<typeof useTranslations>;
}) {
  const label = isActive ? tAdmin("coupons_status_active") : tAdmin("coupons_status_inactive");
  const className = isActive
    ? "border-[#1E5F31] bg-[#0A1B11] text-[#7DE29B]"
    : "border-[#5F5F5F] bg-[#1A1A1A] text-[#C8C8C8]";

  return (
    <span
      className={cn("inline-flex rounded-full border px-2.5 py-1 font-sans text-[11px]", className)}
    >
      {label}
    </span>
  );
}

function CouponExpiredPill({ tAdmin }: { tAdmin: ReturnType<typeof useTranslations> }) {
  return (
    <span className="inline-flex rounded-full border border-[#7A2C2C] bg-[#2A1212] px-2.5 py-1 font-sans text-[11px] text-[#FFB3B3]">
      {tAdmin("coupons_status_expired")}
    </span>
  );
}

function CouponStatusGroup({
  isExpired,
  isActive,
  tAdmin,
}: {
  isExpired: boolean;
  isActive: boolean;
  tAdmin: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <CouponStatusPill isActive={isActive} tAdmin={tAdmin} />
      {isExpired ? <CouponExpiredPill tAdmin={tAdmin} /> : null}
    </div>
  );
}

function CouponUsage({
  coupon,
  tAdmin,
}: {
  coupon: CouponRowModel;
  tAdmin: ReturnType<typeof useTranslations>;
}) {
  const isUnlimited = coupon.maxUses === null;
  const maxUses = coupon.maxUses ?? 0;
  const isLimitReached = !isUnlimited && coupon.currentUses >= maxUses;
  const isNearLimit = !isUnlimited && !isLimitReached && coupon.usagePercent >= 80;

  const usageStateLabel = isUnlimited
    ? tAdmin("coupons_usage_state_unlimited")
    : isLimitReached
      ? tAdmin("coupons_usage_state_limit_reached")
      : isNearLimit
        ? tAdmin("coupons_usage_state_near_limit")
        : tAdmin("coupons_usage_state_healthy");

  const usageClassName = isUnlimited
    ? "border-[#2A2A2A] bg-[#171717]"
    : isLimitReached
      ? "border-[#7A2C2C] bg-[#2A1212]"
      : isNearLimit
        ? "border-[#7A6224] bg-[#241B0B]"
        : "border-[#1C3556] bg-[#08111D]";

  return (
    <div className="min-w-[9.5rem] space-y-2">
      <p className="font-sans text-xs text-[#B4B4B4]">
        {isUnlimited
          ? tAdmin("coupons_usage_unlimited", { current: coupon.currentUses })
          : tAdmin("coupons_usage_limited", {
              current: coupon.currentUses,
              max: maxUses,
            })}
      </p>
      <p className="font-sans text-[11px] text-[#8F8F8F]">{usageStateLabel}</p>
      <Progress
        value={isUnlimited ? 100 : coupon.usagePercent}
        className={cn("h-2 rounded-full border", usageClassName)}
      />
    </div>
  );
}

function CouponForm({
  state,
  errors,
  tAdmin,
  packageOptions,
  categoryOptions,
  onChange,
}: {
  state: CouponFormState;
  errors: CouponValidationErrors;
  tAdmin: ReturnType<typeof useTranslations>;
  packageOptions: Array<{ id: string; name: string }>;
  categoryOptions: Array<{ id: string; name: string }>;
  onChange: (nextState: CouponFormState | ((previous: CouponFormState) => CouponFormState)) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(errors.code)}>
          <FieldLabel className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tAdmin("coupons_form_code")}
          </FieldLabel>
          <FieldContent>
            <Input
              value={state.code}
              onChange={(event) =>
                onChange((previous) => ({
                  ...previous,
                  code: event.target.value.toUpperCase(),
                }))
              }
              placeholder="SAVE20"
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] text-white"
              aria-invalid={Boolean(errors.code)}
            />
            {errors.code ? (
              <FieldError className="font-sans text-xs">{errors.code}</FieldError>
            ) : null}
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tAdmin("coupons_form_type")}
          </FieldLabel>
          <FieldContent>
            <Select
              value={state.discountType}
              onValueChange={(value) =>
                onChange((previous) => ({
                  ...previous,
                  discountType: value as CouponDiscountType,
                }))
              }
            >
              <SelectTrigger className="min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[#2A2A2A] bg-[#090909] text-white">
                <SelectItem value="percentage">{tAdmin("coupons_type_percentage")}</SelectItem>
                <SelectItem value="fixed">{tAdmin("coupons_type_fixed")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(errors.discountValue)}>
          <FieldLabel className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tAdmin("coupons_form_value")}
          </FieldLabel>
          <FieldContent>
            <Input
              type="number"
              min={0}
              step={state.discountType === "percentage" ? "1" : "100"}
              value={state.discountValue}
              onChange={(event) =>
                onChange((previous) => ({
                  ...previous,
                  discountValue: event.target.value,
                }))
              }
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] text-white"
              aria-invalid={Boolean(errors.discountValue)}
            />
            {errors.discountValue ? (
              <FieldError className="font-sans text-xs">{errors.discountValue}</FieldError>
            ) : null}
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tAdmin("coupons_form_active")}
          </FieldLabel>
          <FieldContent>
            <div className="flex min-h-11 items-center justify-between rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <p className="font-sans text-sm text-[#D5D5D5]">
                {state.isActive
                  ? tAdmin("coupons_status_active")
                  : tAdmin("coupons_status_inactive")}
              </p>
              <Switch
                checked={state.isActive}
                aria-label={tAdmin("coupons_form_active")}
                onCheckedChange={(checked) =>
                  onChange((previous) => ({
                    ...previous,
                    isActive: checked,
                  }))
                }
              />
            </div>
          </FieldContent>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(errors.maxUses)}>
          <FieldLabel className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tAdmin("coupons_form_max_uses")}
          </FieldLabel>
          <FieldContent>
            <div className="flex min-h-11 items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Checkbox
                checked={state.hasMaxUses}
                aria-label={tAdmin("coupons_form_set_max_uses")}
                onCheckedChange={(checked) =>
                  onChange((previous) => ({
                    ...previous,
                    hasMaxUses: checked === true,
                    maxUses: checked === true ? previous.maxUses : "",
                  }))
                }
              />
              <span className="font-sans text-sm text-[#D5D5D5]">
                {tAdmin("coupons_form_set_max_uses")}
              </span>
            </div>
            {state.hasMaxUses ? (
              <Input
                type="number"
                min={1}
                step="1"
                value={state.maxUses}
                onChange={(event) =>
                  onChange((previous) => ({
                    ...previous,
                    maxUses: event.target.value,
                  }))
                }
                className="mt-2 min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] text-white"
                aria-invalid={Boolean(errors.maxUses)}
              />
            ) : null}
            {errors.maxUses ? (
              <FieldError className="font-sans text-xs">{errors.maxUses}</FieldError>
            ) : null}
          </FieldContent>
        </Field>

        <Field data-invalid={Boolean(errors.expiresAt)}>
          <FieldLabel className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
            {tAdmin("coupons_form_expiry")}
          </FieldLabel>
          <FieldContent>
            <div className="flex min-h-11 items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Checkbox
                checked={state.hasExpiry}
                aria-label={tAdmin("coupons_form_set_expiry")}
                onCheckedChange={(checked) =>
                  onChange((previous) => ({
                    ...previous,
                    hasExpiry: checked === true,
                    expiresAt: checked === true ? previous.expiresAt : "",
                  }))
                }
              />
              <span className="font-sans text-sm text-[#D5D5D5]">
                {tAdmin("coupons_form_set_expiry")}
              </span>
            </div>
            {state.hasExpiry ? (
              <Input
                type="datetime-local"
                value={state.expiresAt}
                onChange={(event) =>
                  onChange((previous) => ({
                    ...previous,
                    expiresAt: event.target.value,
                  }))
                }
                className="mt-2 min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] text-white"
                aria-invalid={Boolean(errors.expiresAt)}
              />
            ) : null}
            {errors.expiresAt ? (
              <FieldError className="font-sans text-xs">{errors.expiresAt}</FieldError>
            ) : null}
          </FieldContent>
        </Field>
      </div>

      <Field data-invalid={Boolean(errors.eligibleTargets)}>
        <FieldLabel className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
          {tAdmin("coupons_form_scope")}
        </FieldLabel>
        <FieldContent>
          <div className="flex min-h-11 items-center justify-between rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
            <p className="font-sans text-sm text-[#D5D5D5]">
              {state.appliesToAll ? tAdmin("coupons_scope_all") : tAdmin("coupons_scope_targeted")}
            </p>
            <Switch
              checked={state.appliesToAll}
              aria-label={tAdmin("coupons_form_scope")}
              onCheckedChange={(checked) =>
                onChange((previous) => ({
                  ...previous,
                  appliesToAll: checked,
                  eligiblePackageIds: checked ? [] : previous.eligiblePackageIds,
                  eligibleCategoryIds: checked ? [] : previous.eligibleCategoryIds,
                }))
              }
            />
          </div>

          {!state.appliesToAll ? (
            <div className="mt-3 grid gap-4 rounded-2xl border border-[#2A2A2A] bg-[#060606] p-4">
              <div>
                <p className="font-sans text-xs font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("coupons_form_eligible_packages")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {packageOptions.map((pkg) => {
                    const checked = state.eligiblePackageIds.includes(pkg.id);
                    return (
                      <div
                        key={pkg.id}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#0A0A0A] px-3"
                      >
                        <Checkbox
                          checked={checked}
                          aria-label={pkg.name}
                          onCheckedChange={(nextChecked) =>
                            onChange((previous) => ({
                              ...previous,
                              eligiblePackageIds:
                                nextChecked === true
                                  ? [...previous.eligiblePackageIds, pkg.id]
                                  : previous.eligiblePackageIds.filter((id) => id !== pkg.id),
                            }))
                          }
                        />
                        <span className="font-sans text-xs text-[#D5D5D5]">{pkg.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="font-sans text-xs font-medium tracking-[0.08em] text-[#8f8f8f] uppercase">
                  {tAdmin("coupons_form_eligible_categories")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {categoryOptions.map((category) => {
                    const checked = state.eligibleCategoryIds.includes(category.id);
                    return (
                      <div
                        key={category.id}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#0A0A0A] px-3"
                      >
                        <Checkbox
                          checked={checked}
                          aria-label={category.name}
                          onCheckedChange={(nextChecked) =>
                            onChange((previous) => ({
                              ...previous,
                              eligibleCategoryIds:
                                nextChecked === true
                                  ? [...previous.eligibleCategoryIds, category.id]
                                  : previous.eligibleCategoryIds.filter((id) => id !== category.id),
                            }))
                          }
                        />
                        <span className="font-sans text-xs text-[#D5D5D5]">{category.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="font-sans text-xs text-[#8F8F8F]">
                {tAdmin("coupons_form_scope_hint")}
              </p>
            </div>
          ) : null}

          {errors.eligibleTargets ? (
            <FieldError className="mt-2 font-sans text-xs">{errors.eligibleTargets}</FieldError>
          ) : null}
        </FieldContent>
      </Field>
    </div>
  );
}

export function AdminCouponsView() {
  const locale = useLocale();
  const tAdmin = useTranslations("admin");

  const packagesQuery = usePackages();
  const couponsQuery = useAdminCoupons();
  const couponAnalyticsQuery = useAdminCouponAnalytics();
  const createCouponMutation = useCreateAdminCouponMutation();
  const updateCouponMutation = useUpdateAdminCouponMutation();
  const toggleCouponActiveMutation = useToggleAdminCouponActiveMutation();
  const deleteCouponMutation = useDeleteAdminCouponMutation();

  const [createState, setCreateState] = useState<CouponFormState>(getInitialFormState);
  const [createErrors, setCreateErrors] = useState<CouponValidationErrors>({});
  const [createSummaryError, setCreateSummaryError] = useState<string>();

  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [editState, setEditState] = useState<CouponFormState>(getInitialFormState);
  const [editErrors, setEditErrors] = useState<CouponValidationErrors>({});
  const [editSummaryError, setEditSummaryError] = useState<string>();

  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);

  const couponRows = useMemo<CouponRowModel[]>(() => {
    return couponsQuery.items.map((coupon) => ({
      ...coupon,
      isExpired: isCouponExpired(coupon.expiresAt),
      usagePercent: resolveUsagePercent(coupon),
    }));
  }, [couponsQuery.items]);

  const analyticsRows = couponAnalyticsQuery.items;

  const analyticsSummary = useMemo(() => {
    const totals = analyticsRows.reduce(
      (accumulator, item) => {
        accumulator.orderCount += item.orderCount;
        accumulator.totalDiscountAmount += item.totalDiscountAmount;
        accumulator.totalRevenueAmount += item.totalRevenueAmount;
        return accumulator;
      },
      {
        orderCount: 0,
        totalDiscountAmount: 0,
        totalRevenueAmount: 0,
      }
    );

    return totals;
  }, [analyticsRows]);

  const topPerformingCoupon = useMemo<AdminCouponAnalyticsItem | null>(() => {
    if (analyticsRows.length === 0) {
      return null;
    }

    return [...analyticsRows].sort(
      (left, right) => right.totalRevenueAmount - left.totalRevenueAmount
    )[0];
  }, [analyticsRows]);

  const packageOptions = useMemo(
    () =>
      (packagesQuery.data ?? []).map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
      })),
    [packagesQuery.data]
  );

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, { id: string; name: string }>();
    for (const pkg of packagesQuery.data ?? []) {
      categories.set(pkg.category.id, {
        id: pkg.category.id,
        name: pkg.category.name,
      });
    }

    return Array.from(categories.values());
  }, [packagesQuery.data]);

  const availablePackageIds = useMemo(
    () => new Set(packageOptions.map((option) => option.id)),
    [packageOptions]
  );
  const availableCategoryIds = useMemo(
    () => new Set(categoryOptions.map((option) => option.id)),
    [categoryOptions]
  );

  async function onCreateCoupon() {
    const validation = validateFormState({
      state: createState,
      tAdmin,
      availablePackageIds,
      availableCategoryIds,
    });

    setCreateErrors(validation.errors);

    if (!validation.createPayload) {
      setCreateSummaryError(tAdmin("coupons_form_validation_summary"));
      return;
    }

    setCreateSummaryError(undefined);

    try {
      await createCouponMutation.mutateAsync(validation.createPayload);
      toast.success(tAdmin("coupons_toast_created"));
      setCreateState(getInitialFormState());
      setCreateErrors({});
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("coupons_toast_create_failed")));
    }
  }

  const openEditCoupon = useCallback((coupon: Coupon) => {
    setEditingCoupon(coupon);
    setEditState(toFormState(coupon));
    setEditErrors({});
    setEditSummaryError(undefined);
  }, []);

  async function onSaveEditCoupon() {
    if (!editingCoupon) return;

    const validation = validateFormState({
      state: editState,
      tAdmin,
      availablePackageIds,
      availableCategoryIds,
    });

    setEditErrors(validation.errors);

    if (!validation.updatePayload) {
      setEditSummaryError(tAdmin("coupons_form_validation_summary"));
      return;
    }

    setEditSummaryError(undefined);

    try {
      await updateCouponMutation.mutateAsync({
        couponId: editingCoupon.id,
        input: validation.updatePayload,
      });
      toast.success(tAdmin("coupons_toast_updated"));
      setEditingCoupon(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("coupons_toast_update_failed")));
    }
  }

  const onToggleActive = useCallback(
    async (coupon: Coupon) => {
      try {
        await toggleCouponActiveMutation.mutateAsync({
          couponId: coupon.id,
          isActive: !coupon.isActive,
        });
        toast.success(
          coupon.isActive ? tAdmin("coupons_toast_deactivated") : tAdmin("coupons_toast_activated")
        );
      } catch (error) {
        toast.error(getErrorMessage(error, tAdmin("coupons_toast_update_failed")));
      }
    },
    [toggleCouponActiveMutation, tAdmin]
  );

  async function onDeleteCoupon() {
    if (!deleteTarget) return;

    try {
      await deleteCouponMutation.mutateAsync(deleteTarget.id);
      toast.success(tAdmin("coupons_toast_deleted"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("coupons_toast_delete_failed")));
    }
  }

  const columns = useMemo(
    () => [
      couponColumnHelper.accessor("code", {
        header: () => tAdmin("coupons_table_code"),
        cell: ({ row }) => (
          <p className="font-sans text-sm font-semibold tracking-[0.08em] text-white uppercase">
            {row.original.code}
          </p>
        ),
      }),
      couponColumnHelper.accessor("discountType", {
        header: () => tAdmin("coupons_table_type"),
        cell: ({ row }) =>
          row.original.discountType === "percentage"
            ? tAdmin("coupons_type_percentage")
            : tAdmin("coupons_type_fixed"),
      }),
      couponColumnHelper.accessor("discountValue", {
        header: () => tAdmin("coupons_table_value"),
        cell: ({ row }) =>
          row.original.discountType === "percentage"
            ? `${row.original.discountValue}%`
            : formatCurrency(row.original.discountValue, locale),
      }),
      couponColumnHelper.display({
        id: "scope",
        header: () => tAdmin("coupons_table_scope"),
        cell: ({ row }) => {
          if (row.original.appliesToAll) {
            return (
              <p className="font-sans text-sm text-[#D5D5D5]">{tAdmin("coupons_scope_all")}</p>
            );
          }

          return (
            <p className="font-sans text-sm text-[#D5D5D5]">
              {tAdmin("coupons_scope_targeted_count", {
                packages: row.original.eligiblePackageIds.length,
                categories: row.original.eligibleCategoryIds.length,
              })}
            </p>
          );
        },
      }),
      couponColumnHelper.display({
        id: "usage",
        header: () => tAdmin("coupons_table_usage"),
        cell: ({ row }) => <CouponUsage coupon={row.original} tAdmin={tAdmin} />,
      }),
      couponColumnHelper.accessor("expiresAt", {
        header: () => tAdmin("coupons_table_expiry"),
        cell: ({ row }) => (
          <p
            className={cn(
              "font-sans text-sm",
              row.original.isExpired ? "text-[#FFB3B3]" : "text-[#D5D5D5]"
            )}
          >
            {formatDateTime(row.original.expiresAt, locale, tAdmin("coupons_expiry_none"))}
          </p>
        ),
      }),
      couponColumnHelper.display({
        id: "status",
        header: () => tAdmin("coupons_table_status"),
        cell: ({ row }) => (
          <CouponStatusGroup
            isExpired={row.original.isExpired}
            isActive={row.original.isActive}
            tAdmin={tAdmin}
          />
        ),
      }),
      couponColumnHelper.display({
        id: "actions",
        header: () => tAdmin("coupons_table_actions"),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 rounded-full border border-[#2A2A2A] bg-[#0B0B0B] text-[#D5D5D5] hover:bg-[#151515] focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090909]"
                aria-label={tAdmin("coupons_actions_for_code", { code: row.original.code })}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 border-[#2A2A2A] bg-[#090909] text-white"
            >
              <DropdownMenuItem onClick={() => openEditCoupon(row.original)}>
                <Pencil className="mr-2 size-4" aria-hidden="true" />
                {tAdmin("coupons_action_edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(row.original)}>
                <Power className="mr-2 size-4" aria-hidden="true" />
                {row.original.isActive
                  ? tAdmin("coupons_action_deactivate")
                  : tAdmin("coupons_action_activate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[#FF9A9A] focus:text-[#FFD0D0]"
                onClick={() => setDeleteTarget(row.original)}
              >
                <Trash2 className="mr-2 size-4" aria-hidden="true" />
                {tAdmin("coupons_action_delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ],
    [locale, onToggleActive, openEditCoupon, tAdmin]
  );

  const table = useReactTable({
    data: couponRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (couponsQuery.isInitialLoading) {
    return (
      <section className="grid min-w-0 gap-4">
        <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
          <Skeleton className="h-6 w-48 bg-[#171717]" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl bg-[#171717]" />
          <Skeleton className="mt-8 h-44 rounded-[1.25rem] bg-[#171717]" />
          <Skeleton className="mt-4 h-56 rounded-[1.25rem] bg-[#171717]" />
        </div>
      </section>
    );
  }

  if (couponsQuery.isError) {
    return (
      <section className="grid min-w-0 gap-4">
        <div className="rounded-[1.75rem] border border-[#4A1616] bg-[linear-gradient(180deg,#160707_0%,#0C0A0A_100%)] p-6 md:p-8">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full border border-[#6A1B1B] bg-[#1F0D0D] text-[#FF9A9A]">
              <AlertCircle className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-sans text-sm font-semibold text-[#FFD0D0]">
                {tAdmin("coupons_error_title")}
              </p>
              <p className="font-sans mt-1 text-sm leading-6 text-[#FFB8B8]">
                {getErrorMessage(couponsQuery.error, tAdmin("coupons_error_description"))}
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => couponsQuery.refetch()}
            variant="outline"
            className="mt-4 min-h-11 rounded-full border-[#6A1B1B] bg-[#1A0D0D] px-4 font-sans text-sm font-medium text-[#FFD0D0] hover:bg-[#251111] focus-visible:ring-2 focus-visible:ring-[#FFD0D0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0C0A0A]"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {tAdmin("coupons_retry")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {tAdmin("coupons")}
        </h1>
        <p className="font-sans mt-3 max-w-3xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("coupons_workspace_description")}
        </p>

        <div className="mt-8 rounded-[1.25rem] border border-[#1D1D1D] bg-[#090909] p-4 md:p-5">
          <h2 className="font-display text-2xl font-semibold text-white">
            {tAdmin("coupons_create_title")}
          </h2>

          <div className="mt-4">
            <CouponForm
              state={createState}
              errors={createErrors}
              tAdmin={tAdmin}
              packageOptions={packageOptions}
              categoryOptions={categoryOptions}
              onChange={(nextState) => {
                setCreateState((previous) =>
                  typeof nextState === "function"
                    ? (nextState as (previous: CouponFormState) => CouponFormState)(previous)
                    : nextState
                );
              }}
            />
          </div>

          {createSummaryError ? (
            <p
              role="alert"
              className="font-sans mt-3 rounded-xl border border-[#6A1B1B] bg-[#1F0D0D] px-3 py-2 text-xs text-[#FFD0D0]"
            >
              {createSummaryError}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={onCreateCoupon}
              disabled={createCouponMutation.isPending}
              className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white hover:bg-[#0f8aff]"
            >
              {createCouponMutation.isPending
                ? tAdmin("coupons_action_creating")
                : tAdmin("coupons_action_create")}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateState(getInitialFormState());
                setCreateErrors({});
                setCreateSummaryError(undefined);
              }}
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#090909] px-5 font-sans text-sm text-white hover:bg-[#111111]"
            >
              {tAdmin("coupons_action_reset")}
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-[1.25rem] border border-[#1D1D1D] bg-[#090909] p-4 md:p-5">
          <h2 className="font-display text-2xl font-semibold text-white">
            {tAdmin("coupons_list_title")}
          </h2>

          {couponRows.length === 0 ? (
            <p className="font-sans mt-4 text-sm text-[#B4B4B4]">{tAdmin("coupons_empty")}</p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:hidden">
                {couponRows.map((coupon) => (
                  <article
                    key={coupon.id}
                    className={cn(
                      "rounded-[1.25rem] border p-4",
                      coupon.isExpired
                        ? "border-[#4A1D22] bg-[linear-gradient(180deg,rgba(239,68,68,0.08)_0%,rgba(11,11,11,1)_100%)]"
                        : "border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-sans text-[11px] font-medium tracking-[0.2em] text-[#7D7D7D] uppercase">
                          {tAdmin("coupons_table_code")}
                        </p>
                        <p className="font-sans mt-1 text-base font-semibold tracking-[0.08em] text-white uppercase">
                          {coupon.code}
                        </p>
                      </div>
                      <CouponStatusGroup
                        isExpired={coupon.isExpired}
                        isActive={coupon.isActive}
                        tAdmin={tAdmin}
                      />
                    </div>

                    <div className="mt-4 grid gap-2">
                      <p className="font-sans text-sm text-[#D5D5D5]">
                        {tAdmin("coupons_table_type")}:{" "}
                        {coupon.discountType === "percentage"
                          ? tAdmin("coupons_type_percentage")
                          : tAdmin("coupons_type_fixed")}
                      </p>
                      <p className="font-sans text-sm text-[#D5D5D5]">
                        {tAdmin("coupons_table_value")}:{" "}
                        {coupon.discountType === "percentage"
                          ? `${coupon.discountValue}%`
                          : formatCurrency(coupon.discountValue, locale)}
                      </p>
                      <p className="font-sans text-sm text-[#D5D5D5]">
                        {tAdmin("coupons_table_scope")}:{" "}
                        {coupon.appliesToAll
                          ? tAdmin("coupons_scope_all")
                          : tAdmin("coupons_scope_targeted_count", {
                              packages: coupon.eligiblePackageIds.length,
                              categories: coupon.eligibleCategoryIds.length,
                            })}
                      </p>
                      <p className="font-sans text-sm text-[#D5D5D5]">
                        {tAdmin("coupons_table_expiry")}:{" "}
                        {formatDateTime(coupon.expiresAt, locale, tAdmin("coupons_expiry_none"))}
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="font-sans mb-2 text-xs text-[#B4B4B4]">
                        {tAdmin("coupons_table_usage")}
                      </p>
                      <CouponUsage coupon={coupon} tAdmin={tAdmin} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEditCoupon(coupon)}
                        className="min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white hover:bg-[#151515] focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090909]"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        {tAdmin("coupons_action_edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onToggleActive(coupon)}
                        className="min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white hover:bg-[#151515] focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090909]"
                      >
                        <Power className="size-4" aria-hidden="true" />
                        {coupon.isActive
                          ? tAdmin("coupons_action_deactivate")
                          : tAdmin("coupons_action_activate")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDeleteTarget(coupon)}
                        className="min-h-11 rounded-full border-[#6A1B1B] bg-[#1A0D0D] px-4 font-sans text-sm text-[#FFD0D0] hover:bg-[#251111] focus-visible:ring-2 focus-visible:ring-[#FFD0D0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090909]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        {tAdmin("coupons_action_delete")}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 hidden overflow-x-auto rounded-[1.25rem] border border-[#1D1D1D] bg-[#090909] md:block">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow
                        key={headerGroup.id}
                        className="border-[#1D1D1D] hover:bg-transparent"
                      >
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            className="font-sans text-xs font-medium tracking-[0.08em] text-[#8F8F8F] uppercase"
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
                        className={cn(
                          "border-[#1D1D1D] hover:bg-[#111111]",
                          row.original.isExpired && "bg-[#140B0B] hover:bg-[#1B0E0E]"
                        )}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="font-sans text-sm text-[#D5D5D5]">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 rounded-[1.25rem] border border-[#1D1D1D] bg-[#090909] p-4 md:p-5">
          <h2 className="font-display text-2xl font-semibold text-white">
            {tAdmin("coupons_analytics_title")}
          </h2>
          <p className="font-sans mt-2 text-sm leading-6 text-[#B4B4B4]">
            {tAdmin("coupons_analytics_description")}
          </p>

          {couponAnalyticsQuery.isLoading ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Skeleton className="h-20 rounded-2xl bg-[#171717]" />
              <Skeleton className="h-20 rounded-2xl bg-[#171717]" />
              <Skeleton className="h-20 rounded-2xl bg-[#171717]" />
            </div>
          ) : couponAnalyticsQuery.isError ? (
            <p className="font-sans mt-4 rounded-xl border border-[#6A1B1B] bg-[#1F0D0D] px-3 py-2 text-sm text-[#FFD0D0]">
              {tAdmin("coupons_analytics_error")}
            </p>
          ) : analyticsRows.length === 0 ? (
            <p className="font-sans mt-4 text-sm text-[#B4B4B4]">
              {tAdmin("coupons_analytics_empty")}
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[#1D1D1D] bg-[#060606] p-4">
                  <p className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                    {tAdmin("coupons_analytics_summary_orders")}
                  </p>
                  <p className="font-display mt-2 text-2xl font-semibold text-white">
                    {analyticsSummary.orderCount.toLocaleString(resolveIntlLocale(locale))}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#1D1D1D] bg-[#060606] p-4">
                  <p className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                    {tAdmin("coupons_analytics_summary_discount")}
                  </p>
                  <p className="font-display mt-2 text-2xl font-semibold text-white">
                    {formatCurrency(analyticsSummary.totalDiscountAmount, locale)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#1D1D1D] bg-[#060606] p-4">
                  <p className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                    {tAdmin("coupons_analytics_summary_revenue")}
                  </p>
                  <p className="font-display mt-2 text-2xl font-semibold text-white">
                    {formatCurrency(analyticsSummary.totalRevenueAmount, locale)}
                  </p>
                </div>
              </div>

              {topPerformingCoupon ? (
                <div className="mt-4 rounded-2xl border border-[#1D1D1D] bg-[#060606] p-4">
                  <p className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                    {tAdmin("coupons_analytics_top_coupon")}
                  </p>
                  <p className="font-sans mt-2 text-base font-semibold tracking-[0.08em] text-white uppercase">
                    {topPerformingCoupon.couponCode}
                  </p>
                  <p className="font-sans mt-1 text-sm text-[#B4B4B4]">
                    {tAdmin("coupons_analytics_breakdown")}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {topPerformingCoupon.packageBreakdown.slice(0, 6).map((entry) => (
                      <div
                        key={`${topPerformingCoupon.couponId}:${entry.packageId}:${entry.categoryId}`}
                        className="rounded-xl border border-[#1D1D1D] bg-[#0A0A0A] px-3 py-2"
                      >
                        <p className="font-sans text-sm font-medium text-white">
                          {entry.packageName}
                        </p>
                        <p className="font-sans text-xs text-[#B4B4B4]">{entry.categoryName}</p>
                        <p className="font-sans mt-1 text-xs text-[#D5D5D5]">
                          {tAdmin("coupons_analytics_table_orders")}: {entry.orderCount}
                        </p>
                        <p className="font-sans text-xs text-[#D5D5D5]">
                          {tAdmin("coupons_analytics_table_discount")}:{" "}
                          {formatCurrency(entry.discountAmount, locale)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 overflow-x-auto rounded-[1.25rem] border border-[#1D1D1D] bg-[#060606]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1D1D1D] hover:bg-transparent">
                      <TableHead className="font-sans text-xs font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                        {tAdmin("coupons_analytics_table_coupon")}
                      </TableHead>
                      <TableHead className="font-sans text-xs font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                        {tAdmin("coupons_analytics_table_orders")}
                      </TableHead>
                      <TableHead className="font-sans text-xs font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                        {tAdmin("coupons_analytics_table_usage")}
                      </TableHead>
                      <TableHead className="font-sans text-xs font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                        {tAdmin("coupons_analytics_table_discount")}
                      </TableHead>
                      <TableHead className="font-sans text-xs font-medium tracking-[0.08em] text-[#8F8F8F] uppercase">
                        {tAdmin("coupons_analytics_table_revenue")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyticsRows.map((item) => (
                      <TableRow key={item.couponId} className="border-[#1D1D1D] hover:bg-[#111111]">
                        <TableCell className="font-sans text-sm font-semibold tracking-[0.08em] text-white uppercase">
                          {item.couponCode}
                        </TableCell>
                        <TableCell className="font-sans text-sm text-[#D5D5D5]">
                          {item.orderCount.toLocaleString(resolveIntlLocale(locale))}
                        </TableCell>
                        <TableCell className="font-sans text-sm text-[#D5D5D5]">
                          {item.usageCount.toLocaleString(resolveIntlLocale(locale))}
                        </TableCell>
                        <TableCell className="font-sans text-sm text-[#D5D5D5]">
                          {formatCurrency(item.totalDiscountAmount, locale)}
                        </TableCell>
                        <TableCell className="font-sans text-sm text-[#D5D5D5]">
                          {formatCurrency(item.totalRevenueAmount, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(editingCoupon)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCoupon(null);
            setEditErrors({});
            setEditSummaryError(undefined);
          }
        }}
      >
        <DialogContent className="max-h-[95vh] overflow-y-auto border-[#1D1D1D] bg-[#0B0B0B] text-white sm:max-w-[48rem]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-white">
              {tAdmin("coupons_edit_title")}
            </DialogTitle>
            <DialogDescription className="font-sans text-sm text-[#B4B4B4]">
              {tAdmin("coupons_edit_description")}
            </DialogDescription>
          </DialogHeader>

          <CouponForm
            state={editState}
            errors={editErrors}
            tAdmin={tAdmin}
            packageOptions={packageOptions}
            categoryOptions={categoryOptions}
            onChange={(nextState) => {
              setEditState((previous) =>
                typeof nextState === "function"
                  ? (nextState as (previous: CouponFormState) => CouponFormState)(previous)
                  : nextState
              );
            }}
          />

          {editSummaryError ? (
            <p
              role="alert"
              className="font-sans rounded-xl border border-[#6A1B1B] bg-[#1F0D0D] px-3 py-2 text-xs text-[#FFD0D0]"
            >
              {editSummaryError}
            </p>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingCoupon(null)}
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#090909] px-5 font-sans text-sm text-white hover:bg-[#111111]"
            >
              {tAdmin("coupons_action_cancel")}
            </Button>
            <Button
              type="button"
              onClick={onSaveEditCoupon}
              disabled={updateCouponMutation.isPending}
              className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white hover:bg-[#0f8aff]"
            >
              {updateCouponMutation.isPending
                ? tAdmin("coupons_action_saving")
                : tAdmin("coupons_action_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0B0B0B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-white">
              {tAdmin("coupons_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm text-[#B4B4B4]">
              {tAdmin("coupons_delete_description", {
                code: deleteTarget?.code ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full border-[#2A2A2A] bg-[#090909] px-5 font-sans text-sm text-white hover:bg-[#111111]">
              {tAdmin("coupons_action_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteCouponMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void onDeleteCoupon();
              }}
              className="min-h-11 rounded-full bg-[#7A1F1F] px-5 font-sans text-sm font-semibold text-white hover:bg-[#8A2A2A]"
            >
              {deleteCouponMutation.isPending
                ? tAdmin("coupons_action_deleting")
                : tAdmin("coupons_action_confirm_delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
