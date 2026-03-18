"use client";

import type {
  AdminAddon,
  AdminPackage,
  AdminPackageCategory,
  PackageFeatures,
} from "@bookprinta/shared";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertCircle, MoreHorizontal, Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeCatalogError,
  useAdminAddons,
  useAdminPackageCategories,
  useAdminPackages,
  useCreateAddonMutation,
  useCreatePackageCategoryMutation,
  useCreatePackageMutation,
  useDeleteAddonMutation,
  useDeleteAddonPermanentMutation,
  useDeletePackageCategoryMutation,
  useDeletePackageMutation,
  useUpdateAddonMutation,
  useUpdatePackageCategoryMutation,
  useUpdatePackageMutation,
} from "@/hooks/useAdminPackageCatalog";

type ValidationErrors = Record<string, string | undefined>;

function AdminFieldShell({
  id,
  label,
  description,
  error,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field className="min-w-0" data-invalid={Boolean(error)}>
      <FieldLabel
        htmlFor={id}
        className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
      >
        {label}
      </FieldLabel>
      <FieldContent>
        {children({
          id,
          describedBy,
          invalid: Boolean(error),
        })}
        {description ? (
          <FieldDescription id={descriptionId} className="font-sans text-xs text-[#8F8F8F]">
            {description}
          </FieldDescription>
        ) : null}
        {error ? (
          <FieldError id={errorId} className="font-sans text-xs" aria-live="polite">
            {error}
          </FieldError>
        ) : null}
      </FieldContent>
    </Field>
  );
}

function ValidationSummary({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-xl border border-[#6A1B1B] bg-[#1F0D0D] px-3 py-2 font-sans text-xs text-[#FFD0D0]"
    >
      {message}
    </div>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-11 rounded-full bg-[#171717]" />
      <Skeleton className="h-11 rounded-full bg-[#171717]" />
      <Skeleton className="h-20 rounded-2xl bg-[#171717]" />
      <p className="sr-only">{label}</p>
    </div>
  );
}

function SectionError({
  title,
  description,
  retryLabel,
  onRetry,
}: {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[#4A1616] bg-[linear-gradient(180deg,#160707_0%,#0C0A0A_100%)] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#6A1B1B] bg-[#1F0D0D] text-[#FF9A9A]">
          <AlertCircle className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold text-[#FFD0D0]">{title}</p>
          <p className="font-sans mt-1 text-sm leading-6 text-[#FFB8B8]">{description}</p>
        </div>
      </div>

      <Button
        type="button"
        onClick={onRetry}
        variant="outline"
        className="mt-4 min-h-11 rounded-full border-[#6A1B1B] bg-[#1A0D0D] px-4 font-sans text-sm font-medium text-[#FFD0D0] hover:bg-[#251111]"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {retryLabel}
      </Button>
    </div>
  );
}

function SectionReady({ label }: { label: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[#1F2F43] bg-[linear-gradient(180deg,#06111D_0%,#0A0A0A_100%)] p-4">
      <p className="font-sans text-sm leading-6 text-[#BFD8F7]">{label}</p>
    </div>
  );
}

function resolveSectionErrorDescription(fallbackDescription: string, error: unknown): string {
  if (!error) {
    return fallbackDescription;
  }

  const normalized = normalizeCatalogError(error);
  return normalized.description || fallbackDescription;
}

function getStatusPillClass(isActive: boolean): string {
  return isActive
    ? "rounded-full border border-[#1E5F31] bg-[#0A1B11] px-2.5 py-1 font-sans text-[11px] text-[#7DE29B]"
    : "rounded-full border border-[#5F5F5F] bg-[#1A1A1A] px-2.5 py-1 font-sans text-[11px] text-[#C8C8C8]";
}

type CategoryFormState = {
  name: string;
  description: string;
  copies: string;
  sortOrder: string;
  isActive: boolean;
};

function validateCategoryFormState(
  state: CategoryFormState,
  tAdmin: ReturnType<typeof useTranslations>
): {
  errors: ValidationErrors;
  payload?: {
    name: string;
    description: string | null;
    copies: number;
    sortOrder: number;
    isActive: boolean;
  };
} {
  const errors: ValidationErrors = {};
  const name = state.name.trim();
  const description = state.description.trim();
  const copies = Number.parseInt(state.copies, 10);
  const sortOrder = Number.parseInt(state.sortOrder, 10);

  if (!name) {
    errors.name = tAdmin("packages_category_validation_name_required");
  } else if (name.length > 120) {
    errors.name = tAdmin("packages_category_validation_name_too_long");
  }

  if (description.length > 1000) {
    errors.description = tAdmin("packages_category_validation_description_too_long");
  }

  if (!Number.isFinite(copies) || copies < 1) {
    errors.copies = tAdmin("packages_category_validation_copies_required");
  }

  if (!Number.isFinite(sortOrder) || sortOrder < 0) {
    errors.sortOrder = tAdmin("packages_category_validation_sort_order_required");
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors,
    payload: {
      name,
      description: description || null,
      copies,
      sortOrder,
      isActive: state.isActive,
    },
  };
}

function toCategoryFormState(category: AdminPackageCategory): CategoryFormState {
  return {
    name: category.name,
    description: category.description ?? "",
    copies: String(category.copies),
    sortOrder: String(category.sortOrder),
    isActive: category.isActive,
  };
}

function CategoryCreateForm() {
  const tAdmin = useTranslations("admin");
  const createMutation = useCreatePackageCategoryMutation();
  const [state, setState] = useState<CategoryFormState>({
    name: "",
    description: "",
    copies: "25",
    sortOrder: "0",
    isActive: true,
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [summaryError, setSummaryError] = useState<string>();

  async function onCreate() {
    const result = validateCategoryFormState(state, tAdmin);
    setErrors(result.errors);

    if (!result.payload) {
      setSummaryError(tAdmin("packages_form_validation_summary"));
      return;
    }

    setSummaryError(undefined);

    try {
      await createMutation.mutateAsync(result.payload);

      toast.success(tAdmin("packages_category_toast_created"));
      setState((previous) => ({
        ...previous,
        name: "",
        description: "",
      }));
      setErrors({});
      setSummaryError(undefined);
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      setSummaryError(normalized.description);
      toast.error(tAdmin("packages_category_toast_create_failed"), {
        description: normalized.description,
      });
    }
  }

  return (
    <div className="rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4">
      <h3 className="font-display text-xl font-semibold tracking-tight text-white">
        {tAdmin("packages_category_create_title")}
      </h3>
      <div className="mt-4">
        <ValidationSummary message={summaryError} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminFieldShell
          id="category-create-name"
          label={tAdmin("packages_category_field_name")}
          error={errors.name}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={state.name}
              onChange={(event) =>
                setState((previous) => ({ ...previous, name: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
        <AdminFieldShell
          id="category-create-copies"
          label={tAdmin("packages_category_field_copies")}
          error={errors.copies}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={state.copies}
              onChange={(event) =>
                setState((previous) => ({ ...previous, copies: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
        <AdminFieldShell
          id="category-create-sort"
          label={tAdmin("packages_category_field_sort_order")}
          error={errors.sortOrder}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              min={0}
              value={state.sortOrder}
              onChange={(event) =>
                setState((previous) => ({ ...previous, sortOrder: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
        <AdminFieldShell
          id="category-create-active"
          label={tAdmin("packages_category_field_active")}
        >
          {({ id, describedBy }) => (
            <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Switch
                id={id}
                checked={state.isActive}
                onCheckedChange={(value) =>
                  setState((previous) => ({ ...previous, isActive: value }))
                }
                aria-describedby={describedBy}
              />
            </div>
          )}
        </AdminFieldShell>
      </div>

      <div className="mt-3">
        <AdminFieldShell
          id="category-create-description"
          label={tAdmin("packages_category_field_description")}
          description={tAdmin("packages_category_field_description_help")}
          error={errors.description}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              value={state.description}
              onChange={(event) =>
                setState((previous) => ({ ...previous, description: event.target.value }))
              }
              className="min-h-20 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
      </div>

      <div className="mt-4">
        <Button
          type="button"
          onClick={() => {
            void onCreate();
          }}
          disabled={createMutation.isPending}
          className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
        >
          {createMutation.isPending
            ? tAdmin("packages_category_action_creating")
            : tAdmin("packages_category_action_create")}
        </Button>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  onRequestDelete,
}: {
  category: AdminPackageCategory;
  onRequestDelete?: (category: AdminPackageCategory) => void;
}) {
  const tAdmin = useTranslations("admin");
  const updateMutation = useUpdatePackageCategoryMutation();
  const deleteMutation = useDeletePackageCategoryMutation();
  const [state, setState] = useState<CategoryFormState>(() => toCategoryFormState(category));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [summaryError, setSummaryError] = useState<string>();

  async function onSave() {
    const result = validateCategoryFormState(state, tAdmin);
    setErrors(result.errors);

    if (!result.payload) {
      setSummaryError(tAdmin("packages_form_validation_summary"));
      return;
    }

    setSummaryError(undefined);

    try {
      await updateMutation.mutateAsync({
        categoryId: category.id,
        input: result.payload,
      });

      toast.success(tAdmin("packages_category_toast_updated"));
      setErrors({});
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      setSummaryError(normalized.description);
      toast.error(tAdmin("packages_category_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  async function onDelete() {
    if (category.packageCount > 0) {
      toast.error(tAdmin("packages_category_delete_blocked"), {
        description: tAdmin("packages_category_delete_blocked_description", {
          count: category.packageCount,
        }),
      });
      return;
    }

    try {
      await deleteMutation.mutateAsync(category.id);
      toast.success(tAdmin("packages_category_toast_deleted"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_category_toast_delete_failed"), {
        description: normalized.description,
      });
    }
  }

  async function onToggle() {
    try {
      await updateMutation.mutateAsync({
        categoryId: category.id,
        input: {
          isActive: !state.isActive,
        },
      });

      setState((previous) => ({ ...previous, isActive: !previous.isActive }));
      toast.success(tAdmin("packages_category_toast_updated"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_category_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  return (
    <article className="rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4">
      <ValidationSummary message={summaryError} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold text-white">{category.name}</p>
          <p className="font-sans mt-1 text-xs text-[#9A9A9A]">
            {tAdmin("packages_category_package_count", { count: category.packageCount })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              state.isActive
                ? "rounded-full border border-[#1E5F31] bg-[#0A1B11] px-3 py-1 font-sans text-xs text-[#7DE29B]"
                : "rounded-full border border-[#5F5F5F] bg-[#1A1A1A] px-3 py-1 font-sans text-xs text-[#C8C8C8]"
            }
          >
            {state.isActive
              ? tAdmin("packages_category_status_active")
              : tAdmin("packages_category_status_inactive")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="size-9 rounded-full border border-[#2A2A2A] bg-[#0C0C0C] p-0 text-[#D1D1D1] hover:bg-[#171717]"
                aria-label={tAdmin("users_table_actions")}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-[#2A2A2A] bg-[#101010] text-white">
              <DropdownMenuItem
                onSelect={() => {
                  void onToggle();
                }}
              >
                <Power className="size-4" aria-hidden="true" />
                {state.isActive
                  ? tAdmin("packages_table_action_deactivate")
                  : tAdmin("packages_table_action_activate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#2A2A2A]" />
              <DropdownMenuItem
                onSelect={() => {
                  if (onRequestDelete) {
                    onRequestDelete(category);
                    return;
                  }

                  void onDelete();
                }}
                className="text-[#FFB4B4] focus:bg-[#2A1010] focus:text-[#FFD0D0]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {tAdmin("packages_category_action_delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminFieldShell
          id={`category-${category.id}-name`}
          label={tAdmin("packages_category_field_name")}
          error={errors.name}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={state.name}
              onChange={(event) =>
                setState((previous) => ({ ...previous, name: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
        <AdminFieldShell
          id={`category-${category.id}-copies`}
          label={tAdmin("packages_category_field_copies")}
          error={errors.copies}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={state.copies}
              onChange={(event) =>
                setState((previous) => ({ ...previous, copies: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
        <AdminFieldShell
          id={`category-${category.id}-sort`}
          label={tAdmin("packages_category_field_sort_order")}
          error={errors.sortOrder}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              min={0}
              value={state.sortOrder}
              onChange={(event) =>
                setState((previous) => ({ ...previous, sortOrder: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
        <AdminFieldShell
          id={`category-${category.id}-active`}
          label={tAdmin("packages_category_field_active")}
        >
          {({ id, describedBy }) => (
            <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Switch
                id={id}
                checked={state.isActive}
                onCheckedChange={(value) =>
                  setState((previous) => ({ ...previous, isActive: value }))
                }
                aria-describedby={describedBy}
              />
            </div>
          )}
        </AdminFieldShell>
      </div>

      <div className="mt-3">
        <AdminFieldShell
          id={`category-${category.id}-description`}
          label={tAdmin("packages_category_field_description")}
          description={tAdmin("packages_category_field_description_help")}
          error={errors.description}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              value={state.description}
              onChange={(event) =>
                setState((previous) => ({ ...previous, description: event.target.value }))
              }
              className="min-h-20 border-[#2A2A2A] bg-[#080808] text-white"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </AdminFieldShell>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            void onSave();
          }}
          disabled={updateMutation.isPending}
          className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
        >
          {updateMutation.isPending
            ? tAdmin("packages_category_action_saving")
            : tAdmin("packages_category_action_save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (onRequestDelete) {
              onRequestDelete(category);
              return;
            }

            void onDelete();
          }}
          disabled={deleteMutation.isPending || category.packageCount > 0}
          className="min-h-11 rounded-full border-[#4A1616] bg-[#1A0D0D] px-5 font-sans text-sm font-medium text-[#FFD0D0] hover:bg-[#251111] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {deleteMutation.isPending
            ? tAdmin("packages_category_action_deleting")
            : tAdmin("packages_category_action_delete")}
        </Button>
      </div>
    </article>
  );
}

type PackageFormState = {
  categoryId: string;
  name: string;
  description: string;
  basePrice: string;
  pageLimit: string;
  includesISBN: boolean;
  isActive: boolean;
  sortOrder: string;
  featureItemsText: string;
  copiesA4: string;
  copiesA5: string;
  copiesA6: string;
};

function formatFeaturesAsText(features: PackageFeatures): string {
  return features.items.join("\n");
}

function toPackageFormState(pkg: AdminPackage): PackageFormState {
  return {
    categoryId: pkg.categoryId,
    name: pkg.name,
    description: pkg.description ?? "",
    basePrice: String(pkg.basePrice),
    pageLimit: String(pkg.pageLimit),
    includesISBN: pkg.includesISBN,
    isActive: pkg.isActive,
    sortOrder: String(pkg.sortOrder),
    featureItemsText: formatFeaturesAsText(pkg.features),
    copiesA4: String(pkg.features.copies.A4),
    copiesA5: String(pkg.features.copies.A5),
    copiesA6: String(pkg.features.copies.A6),
  };
}

function parsePackageFormToPayload(state: PackageFormState) {
  const basePrice = Number.parseFloat(state.basePrice);
  const pageLimit = Number.parseInt(state.pageLimit, 10);
  const sortOrder = Number.parseInt(state.sortOrder, 10);
  const copiesA4 = Number.parseInt(state.copiesA4, 10);
  const copiesA5 = Number.parseInt(state.copiesA5, 10);
  const copiesA6 = Number.parseInt(state.copiesA6, 10);
  const items = state.featureItemsText
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    categoryId: state.categoryId,
    name: state.name.trim(),
    description: state.description.trim() || null,
    basePrice,
    pageLimit,
    includesISBN: state.includesISBN,
    isActive: state.isActive,
    sortOrder,
    features: {
      items,
      copies: {
        A4: copiesA4,
        A5: copiesA5,
        A6: copiesA6,
      },
    },
  };
}

function validatePackagePayload(
  payload: ReturnType<typeof parsePackageFormToPayload>,
  tAdmin: ReturnType<typeof useTranslations>
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!payload.categoryId) {
    errors.categoryId = tAdmin("packages_package_validation_category_required");
  }

  if (!payload.name) {
    errors.name = tAdmin("packages_package_validation_name_required");
  } else if (payload.name.length > 120) {
    errors.name = tAdmin("packages_package_validation_name_too_long");
  }

  if (!Number.isFinite(payload.basePrice) || payload.basePrice < 0) {
    errors.basePrice = tAdmin("packages_package_validation_base_price_required");
  }

  if (!Number.isFinite(payload.pageLimit) || payload.pageLimit < 1) {
    errors.pageLimit = tAdmin("packages_package_validation_page_limit_required");
  }

  if (!Number.isFinite(payload.sortOrder) || payload.sortOrder < 0) {
    errors.sortOrder = tAdmin("packages_package_validation_sort_order_required");
  }

  if ((payload.description ?? "").length > 2000) {
    errors.description = tAdmin("packages_package_validation_description_too_long");
  }

  if (payload.features.items.length === 0) {
    errors.features = tAdmin("packages_package_validation_features_required");
  }

  if (
    !Number.isFinite(payload.features.copies.A4) ||
    payload.features.copies.A4 < 0 ||
    !Number.isFinite(payload.features.copies.A5) ||
    payload.features.copies.A5 < 0 ||
    !Number.isFinite(payload.features.copies.A6) ||
    payload.features.copies.A6 < 0
  ) {
    errors.copyCounts = tAdmin("packages_package_validation_copy_counts_required");
  }

  return errors;
}

function PackageCreateForm({ categories }: { categories: AdminPackageCategory[] }) {
  const tAdmin = useTranslations("admin");
  const createMutation = useCreatePackageMutation();
  const [state, setState] = useState<PackageFormState>({
    categoryId: categories[0]?.id ?? "",
    name: "",
    description: "",
    basePrice: "0",
    pageLimit: "100",
    includesISBN: false,
    isActive: true,
    sortOrder: "0",
    featureItemsText: "",
    copiesA4: "0",
    copiesA5: "0",
    copiesA6: "0",
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [summaryError, setSummaryError] = useState<string>();

  async function onCreate() {
    const payload = parsePackageFormToPayload(state);
    const nextErrors = validatePackagePayload(payload, tAdmin);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSummaryError(tAdmin("packages_form_validation_summary"));
      return;
    }

    setSummaryError(undefined);

    try {
      await createMutation.mutateAsync(payload);
      toast.success(tAdmin("packages_package_toast_created"));
      setState((previous) => ({
        ...previous,
        name: "",
        description: "",
        featureItemsText: "",
      }));
      setErrors({});
      setSummaryError(undefined);
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      setSummaryError(normalized.description);
      toast.error(tAdmin("packages_package_toast_create_failed"), {
        description: normalized.description,
      });
    }
  }

  return (
    <div className="rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4">
      <h3 className="font-display text-xl font-semibold tracking-tight text-white">
        {tAdmin("packages_package_create_title")}
      </h3>
      <div className="mt-4">
        <ValidationSummary message={summaryError} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="package-create-category"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_category")}
          </label>
          <Select
            value={state.categoryId}
            onValueChange={(value) => setState((previous) => ({ ...previous, categoryId: value }))}
            aria-label={tAdmin("packages_package_field_category")}
          >
            <SelectTrigger
              id="package-create-category"
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            >
              <SelectValue placeholder={tAdmin("packages_package_field_category_placeholder")} />
            </SelectTrigger>
            <SelectContent className="border-[#2A2A2A] bg-[#0A0A0A] text-white">
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors.categoryId ? [{ message: errors.categoryId }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="package-create-name"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_name")}
          </label>
          <Input
            id="package-create-name"
            value={state.name}
            onChange={(event) =>
              setState((previous) => ({ ...previous, name: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.name)}
            aria-label={tAdmin("packages_package_field_name")}
          />
          <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="package-create-base-price"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_base_price")}
          </label>
          <Input
            id="package-create-base-price"
            type="number"
            min={0}
            value={state.basePrice}
            onChange={(event) =>
              setState((previous) => ({ ...previous, basePrice: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.basePrice)}
            aria-label={tAdmin("packages_package_field_base_price")}
          />
          <FieldError errors={errors.basePrice ? [{ message: errors.basePrice }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="package-create-page-limit"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_page_limit")}
          </label>
          <Input
            id="package-create-page-limit"
            type="number"
            min={1}
            value={state.pageLimit}
            onChange={(event) =>
              setState((previous) => ({ ...previous, pageLimit: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.pageLimit)}
            aria-label={tAdmin("packages_package_field_page_limit")}
          />
          <FieldError errors={errors.pageLimit ? [{ message: errors.pageLimit }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="package-create-sort-order"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_sort_order")}
          </label>
          <Input
            id="package-create-sort-order"
            type="number"
            min={0}
            value={state.sortOrder}
            onChange={(event) =>
              setState((previous) => ({ ...previous, sortOrder: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.sortOrder)}
            aria-label={tAdmin("packages_package_field_sort_order")}
          />
          <FieldError errors={errors.sortOrder ? [{ message: errors.sortOrder }] : undefined} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="package-create-includes-isbn"
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_package_field_isbn")}
            </label>
            <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Switch
                id="package-create-includes-isbn"
                checked={state.includesISBN}
                onCheckedChange={(value) =>
                  setState((previous) => ({ ...previous, includesISBN: value }))
                }
                aria-label={tAdmin("packages_package_field_isbn")}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="package-create-active"
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_package_field_active")}
            </label>
            <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Switch
                id="package-create-active"
                checked={state.isActive}
                onCheckedChange={(value) =>
                  setState((previous) => ({ ...previous, isActive: value }))
                }
                aria-label={tAdmin("packages_package_field_active")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <label
          htmlFor="package-create-description"
          className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
        >
          {tAdmin("packages_package_field_description")}
        </label>
        <Textarea
          id="package-create-description"
          value={state.description}
          onChange={(event) =>
            setState((previous) => ({ ...previous, description: event.target.value }))
          }
          className="min-h-20 border-[#2A2A2A] bg-[#080808] text-white"
          aria-invalid={Boolean(errors.description)}
          aria-label={tAdmin("packages_package_field_description")}
        />
        <FieldError errors={errors.description ? [{ message: errors.description }] : undefined} />
      </div>

      <div className="mt-3 min-w-0">
        <label
          htmlFor="package-create-features"
          className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
        >
          {tAdmin("packages_package_field_features")}
        </label>
        <Textarea
          id="package-create-features"
          value={state.featureItemsText}
          onChange={(event) =>
            setState((previous) => ({ ...previous, featureItemsText: event.target.value }))
          }
          className="min-h-24 border-[#2A2A2A] bg-[#080808] text-white"
          aria-invalid={Boolean(errors.features)}
          aria-label={tAdmin("packages_package_field_features")}
        />
        <p className="mt-2 font-sans text-xs text-[#8F8F8F]">
          {tAdmin("packages_package_field_features_help")}
        </p>
        <FieldError errors={errors.features ? [{ message: errors.features }] : undefined} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="min-w-0">
          <label
            htmlFor="package-create-copies-a4"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            A4
          </label>
          <Input
            id="package-create-copies-a4"
            type="number"
            min={0}
            value={state.copiesA4}
            onChange={(event) =>
              setState((previous) => ({ ...previous, copiesA4: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-label="A4"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="package-create-copies-a5"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            A5
          </label>
          <Input
            id="package-create-copies-a5"
            type="number"
            min={0}
            value={state.copiesA5}
            onChange={(event) =>
              setState((previous) => ({ ...previous, copiesA5: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-label="A5"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="package-create-copies-a6"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            A6
          </label>
          <Input
            id="package-create-copies-a6"
            type="number"
            min={0}
            value={state.copiesA6}
            onChange={(event) =>
              setState((previous) => ({ ...previous, copiesA6: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-label="A6"
          />
        </div>
      </div>
      <FieldError errors={errors.copyCounts ? [{ message: errors.copyCounts }] : undefined} />

      <div className="mt-4">
        <Button
          type="button"
          onClick={() => {
            void onCreate();
          }}
          disabled={createMutation.isPending}
          className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
        >
          {createMutation.isPending
            ? tAdmin("packages_package_action_creating")
            : tAdmin("packages_package_action_create")}
        </Button>
      </div>
    </div>
  );
}

function PackageRow({
  pkg,
  categories,
  onRequestPermanentDelete,
}: {
  pkg: AdminPackage;
  categories: AdminPackageCategory[];
  onRequestPermanentDelete?: (pkg: AdminPackage) => void;
}) {
  const tAdmin = useTranslations("admin");
  const updateMutation = useUpdatePackageMutation();
  const [state, setState] = useState<PackageFormState>(() => toPackageFormState(pkg));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [summaryError, setSummaryError] = useState<string>();

  async function onToggle() {
    try {
      await updateMutation.mutateAsync({
        packageId: pkg.id,
        input: {
          isActive: !state.isActive,
        },
      });

      setState((previous) => ({ ...previous, isActive: !previous.isActive }));
      toast.success(tAdmin("packages_package_toast_updated"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_package_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  async function onSave() {
    const payload = parsePackageFormToPayload(state);
    const nextErrors = validatePackagePayload(payload, tAdmin);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSummaryError(tAdmin("packages_form_validation_summary"));
      return;
    }

    setSummaryError(undefined);

    try {
      await updateMutation.mutateAsync({
        packageId: pkg.id,
        input: payload,
      });
      toast.success(tAdmin("packages_package_toast_updated"));
      setErrors({});
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      setSummaryError(normalized.description);
      toast.error(tAdmin("packages_package_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  return (
    <article className="rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4">
      <ValidationSummary message={summaryError} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold text-white">{pkg.name}</p>
          <p className="font-sans mt-1 text-xs text-[#9A9A9A]">
            {pkg.category.name} ·{" "}
            {tAdmin("packages_package_page_limit_label", { count: pkg.pageLimit })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              state.isActive
                ? "rounded-full border border-[#1E5F31] bg-[#0A1B11] px-3 py-1 font-sans text-xs text-[#7DE29B]"
                : "rounded-full border border-[#5F5F5F] bg-[#1A1A1A] px-3 py-1 font-sans text-xs text-[#C8C8C8]"
            }
          >
            {state.isActive
              ? tAdmin("packages_package_status_active")
              : tAdmin("packages_package_status_inactive")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="size-9 rounded-full border border-[#2A2A2A] bg-[#0C0C0C] p-0 text-[#D1D1D1] hover:bg-[#171717]"
                aria-label={tAdmin("users_table_actions")}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-[#2A2A2A] bg-[#101010] text-white">
              <DropdownMenuItem
                onSelect={() => {
                  void onToggle();
                }}
              >
                <Power className="size-4" aria-hidden="true" />
                {state.isActive
                  ? tAdmin("packages_table_action_deactivate")
                  : tAdmin("packages_table_action_activate")}
              </DropdownMenuItem>
              {onRequestPermanentDelete ? (
                <>
                  <DropdownMenuSeparator className="bg-[#2A2A2A]" />
                  <DropdownMenuItem
                    onSelect={() => onRequestPermanentDelete(pkg)}
                    className="text-[#FFB4B4] focus:bg-[#2A1010] focus:text-[#FFD0D0]"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {tAdmin("packages_table_action_delete_permanently")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-category`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_category")}
          </label>
          <Select
            value={state.categoryId}
            onValueChange={(value) => setState((previous) => ({ ...previous, categoryId: value }))}
            aria-label={tAdmin("packages_package_field_category")}
          >
            <SelectTrigger
              id={`package-${pkg.id}-category`}
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            >
              <SelectValue placeholder={tAdmin("packages_package_field_category_placeholder")} />
            </SelectTrigger>
            <SelectContent className="border-[#2A2A2A] bg-[#0A0A0A] text-white">
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors.categoryId ? [{ message: errors.categoryId }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-name`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_name")}
          </label>
          <Input
            id={`package-${pkg.id}-name`}
            value={state.name}
            onChange={(event) =>
              setState((previous) => ({ ...previous, name: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.name)}
            aria-label={tAdmin("packages_package_field_name")}
          />
          <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-base-price`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_base_price")}
          </label>
          <Input
            id={`package-${pkg.id}-base-price`}
            type="number"
            min={0}
            value={state.basePrice}
            onChange={(event) =>
              setState((previous) => ({ ...previous, basePrice: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.basePrice)}
            aria-label={tAdmin("packages_package_field_base_price")}
          />
          <FieldError errors={errors.basePrice ? [{ message: errors.basePrice }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-page-limit`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_page_limit")}
          </label>
          <Input
            id={`package-${pkg.id}-page-limit`}
            type="number"
            min={1}
            value={state.pageLimit}
            onChange={(event) =>
              setState((previous) => ({ ...previous, pageLimit: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.pageLimit)}
            aria-label={tAdmin("packages_package_field_page_limit")}
          />
          <FieldError errors={errors.pageLimit ? [{ message: errors.pageLimit }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-sort-order`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_package_field_sort_order")}
          </label>
          <Input
            id={`package-${pkg.id}-sort-order`}
            type="number"
            min={0}
            value={state.sortOrder}
            onChange={(event) =>
              setState((previous) => ({ ...previous, sortOrder: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.sortOrder)}
            aria-label={tAdmin("packages_package_field_sort_order")}
          />
          <FieldError errors={errors.sortOrder ? [{ message: errors.sortOrder }] : undefined} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`package-${pkg.id}-includes-isbn`}
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_package_field_isbn")}
            </label>
            <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Switch
                id={`package-${pkg.id}-includes-isbn`}
                checked={state.includesISBN}
                onCheckedChange={(value) =>
                  setState((previous) => ({ ...previous, includesISBN: value }))
                }
                aria-label={tAdmin("packages_package_field_isbn")}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor={`package-${pkg.id}-active`}
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_package_field_active")}
            </label>
            <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
              <Switch
                id={`package-${pkg.id}-active`}
                checked={state.isActive}
                onCheckedChange={(value) =>
                  setState((previous) => ({ ...previous, isActive: value }))
                }
                aria-label={tAdmin("packages_package_field_active")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <label
          htmlFor={`package-${pkg.id}-description`}
          className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
        >
          {tAdmin("packages_package_field_description")}
        </label>
        <Textarea
          id={`package-${pkg.id}-description`}
          value={state.description}
          onChange={(event) =>
            setState((previous) => ({ ...previous, description: event.target.value }))
          }
          className="min-h-20 border-[#2A2A2A] bg-[#080808] text-white"
          aria-invalid={Boolean(errors.description)}
          aria-label={tAdmin("packages_package_field_description")}
        />
        <FieldError errors={errors.description ? [{ message: errors.description }] : undefined} />
      </div>

      <div className="mt-3 min-w-0">
        <label
          htmlFor={`package-${pkg.id}-features`}
          className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
        >
          {tAdmin("packages_package_field_features")}
        </label>
        <Textarea
          id={`package-${pkg.id}-features`}
          value={state.featureItemsText}
          onChange={(event) =>
            setState((previous) => ({ ...previous, featureItemsText: event.target.value }))
          }
          className="min-h-24 border-[#2A2A2A] bg-[#080808] text-white"
          aria-invalid={Boolean(errors.features)}
          aria-label={tAdmin("packages_package_field_features")}
        />
        <p className="mt-2 font-sans text-xs text-[#8F8F8F]">
          {tAdmin("packages_package_field_features_help")}
        </p>
        <FieldError errors={errors.features ? [{ message: errors.features }] : undefined} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-copies-a4`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            A4
          </label>
          <Input
            id={`package-${pkg.id}-copies-a4`}
            type="number"
            min={0}
            value={state.copiesA4}
            onChange={(event) =>
              setState((previous) => ({ ...previous, copiesA4: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-label="A4"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-copies-a5`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            A5
          </label>
          <Input
            id={`package-${pkg.id}-copies-a5`}
            type="number"
            min={0}
            value={state.copiesA5}
            onChange={(event) =>
              setState((previous) => ({ ...previous, copiesA5: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-label="A5"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor={`package-${pkg.id}-copies-a6`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            A6
          </label>
          <Input
            id={`package-${pkg.id}-copies-a6`}
            type="number"
            min={0}
            value={state.copiesA6}
            onChange={(event) =>
              setState((previous) => ({ ...previous, copiesA6: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-label="A6"
          />
        </div>
      </div>
      <FieldError errors={errors.copyCounts ? [{ message: errors.copyCounts }] : undefined} />

      <div className="mt-4">
        <Button
          type="button"
          onClick={() => {
            void onSave();
          }}
          disabled={updateMutation.isPending}
          className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
        >
          {updateMutation.isPending
            ? tAdmin("packages_package_action_saving")
            : tAdmin("packages_package_action_save")}
        </Button>
      </div>
    </article>
  );
}

type AddonFormState = {
  name: string;
  description: string;
  pricingType: "fixed" | "per_word";
  price: string;
  pricePerWord: string;
  sortOrder: string;
  isActive: boolean;
};

function toAddonFormState(addon: AdminAddon): AddonFormState {
  return {
    name: addon.name,
    description: addon.description ?? "",
    pricingType: addon.pricingType,
    price: addon.price != null ? String(addon.price) : "",
    pricePerWord: addon.pricePerWord != null ? String(addon.pricePerWord) : "",
    sortOrder: String(addon.sortOrder),
    isActive: addon.isActive,
  };
}

function parseAddonFormToPayload(state: AddonFormState) {
  const sortOrder = Number.parseInt(state.sortOrder, 10);
  const price = state.price.trim() === "" ? Number.NaN : Number.parseFloat(state.price);
  const pricePerWord =
    state.pricePerWord.trim() === "" ? Number.NaN : Number.parseFloat(state.pricePerWord);

  return {
    name: state.name.trim(),
    description: state.description.trim() || null,
    pricingType: state.pricingType,
    price,
    pricePerWord,
    sortOrder,
    isActive: state.isActive,
  };
}

function validateAddonPayload(
  payload: ReturnType<typeof parseAddonFormToPayload>,
  tAdmin: ReturnType<typeof useTranslations>
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!payload.name) {
    errors.name = tAdmin("packages_addon_validation_name_required");
  } else if (payload.name.length > 120) {
    errors.name = tAdmin("packages_addon_validation_name_too_long");
  }

  if (!Number.isFinite(payload.sortOrder) || payload.sortOrder < 0) {
    errors.sortOrder = tAdmin("packages_addon_validation_sort_order_required");
  }

  if ((payload.description ?? "").length > 500) {
    errors.description = tAdmin("packages_addon_validation_description_too_long");
  }

  if (payload.pricingType === "fixed") {
    if (!Number.isFinite(payload.price) || payload.price < 0) {
      errors.price = tAdmin("packages_addon_validation_price_required");
    }
  }

  if (payload.pricingType === "per_word") {
    if (!Number.isFinite(payload.pricePerWord) || payload.pricePerWord < 0) {
      errors.pricePerWord = tAdmin("packages_addon_validation_price_per_word_required");
    }
  }

  return errors;
}

function AddonCreateForm() {
  const tAdmin = useTranslations("admin");
  const createMutation = useCreateAddonMutation();
  const [state, setState] = useState<AddonFormState>({
    name: "",
    description: "",
    pricingType: "fixed",
    price: "0",
    pricePerWord: "",
    sortOrder: "0",
    isActive: true,
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [summaryError, setSummaryError] = useState<string>();

  async function onCreate() {
    const payload = parseAddonFormToPayload(state);
    const nextErrors = validateAddonPayload(payload, tAdmin);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSummaryError(tAdmin("packages_form_validation_summary"));
      return;
    }

    setSummaryError(undefined);

    try {
      await createMutation.mutateAsync({
        name: payload.name,
        description: payload.description,
        pricingType: payload.pricingType,
        price: payload.pricingType === "fixed" ? payload.price : null,
        pricePerWord: payload.pricingType === "per_word" ? payload.pricePerWord : null,
        sortOrder: payload.sortOrder,
        isActive: payload.isActive,
      });

      toast.success(tAdmin("packages_addon_toast_created"));
      setState((previous) => ({
        ...previous,
        name: "",
        description: "",
      }));
      setErrors({});
      setSummaryError(undefined);
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      setSummaryError(normalized.description);
      toast.error(tAdmin("packages_addon_toast_create_failed"), {
        description: normalized.description,
      });
    }
  }

  return (
    <div className="rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4">
      <h3 className="font-display text-xl font-semibold tracking-tight text-white">
        {tAdmin("packages_addon_create_title")}
      </h3>
      <div className="mt-4">
        <ValidationSummary message={summaryError} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="addon-create-name"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_name")}
          </label>
          <Input
            id="addon-create-name"
            value={state.name}
            onChange={(event) =>
              setState((previous) => ({ ...previous, name: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.name)}
            aria-label={tAdmin("packages_addon_field_name")}
          />
          <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="addon-create-pricing-type"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_pricing_type")}
          </label>
          <Select
            value={state.pricingType}
            onValueChange={(value: "fixed" | "per_word") =>
              setState((previous) => ({ ...previous, pricingType: value }))
            }
            aria-label={tAdmin("packages_addon_field_pricing_type")}
          >
            <SelectTrigger
              id="addon-create-pricing-type"
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#2A2A2A] bg-[#0A0A0A] text-white">
              <SelectItem value="fixed">{tAdmin("packages_addon_pricing_fixed")}</SelectItem>
              <SelectItem value="per_word">{tAdmin("packages_addon_pricing_per_word")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {state.pricingType === "fixed" ? (
          <div className="min-w-0">
            <label
              htmlFor="addon-create-price"
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_addon_field_price")}
            </label>
            <Input
              id="addon-create-price"
              type="number"
              min={0}
              step="0.01"
              value={state.price}
              onChange={(event) =>
                setState((previous) => ({ ...previous, price: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-invalid={Boolean(errors.price)}
              aria-label={tAdmin("packages_addon_field_price")}
            />
            <FieldError errors={errors.price ? [{ message: errors.price }] : undefined} />
          </div>
        ) : (
          <div className="min-w-0">
            <label
              htmlFor="addon-create-price-per-word"
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_addon_field_price_per_word")}
            </label>
            <Input
              id="addon-create-price-per-word"
              type="number"
              min={0}
              step="0.0001"
              value={state.pricePerWord}
              onChange={(event) =>
                setState((previous) => ({ ...previous, pricePerWord: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-invalid={Boolean(errors.pricePerWord)}
              aria-label={tAdmin("packages_addon_field_price_per_word")}
            />
            <FieldError
              errors={errors.pricePerWord ? [{ message: errors.pricePerWord }] : undefined}
            />
          </div>
        )}

        <div className="min-w-0">
          <label
            htmlFor="addon-create-sort-order"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_sort_order")}
          </label>
          <Input
            id="addon-create-sort-order"
            type="number"
            min={0}
            value={state.sortOrder}
            onChange={(event) =>
              setState((previous) => ({ ...previous, sortOrder: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.sortOrder)}
            aria-label={tAdmin("packages_addon_field_sort_order")}
          />
          <FieldError errors={errors.sortOrder ? [{ message: errors.sortOrder }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="addon-create-active"
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_active")}
          </label>
          <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
            <Switch
              id="addon-create-active"
              checked={state.isActive}
              onCheckedChange={(value) =>
                setState((previous) => ({ ...previous, isActive: value }))
              }
              aria-label={tAdmin("packages_addon_field_active")}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <label
          htmlFor="addon-create-description"
          className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
        >
          {tAdmin("packages_addon_field_description")}
        </label>
        <Textarea
          id="addon-create-description"
          value={state.description}
          onChange={(event) =>
            setState((previous) => ({ ...previous, description: event.target.value }))
          }
          className="min-h-20 border-[#2A2A2A] bg-[#080808] text-white"
          aria-invalid={Boolean(errors.description)}
          aria-label={tAdmin("packages_addon_field_description")}
        />
        <FieldError errors={errors.description ? [{ message: errors.description }] : undefined} />
      </div>

      <div className="mt-4">
        <Button
          type="button"
          onClick={() => {
            void onCreate();
          }}
          disabled={createMutation.isPending}
          className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
        >
          {createMutation.isPending
            ? tAdmin("packages_addon_action_creating")
            : tAdmin("packages_addon_action_create")}
        </Button>
      </div>
    </div>
  );
}

function AddonRow({
  addon,
  onRequestPermanentDelete,
}: {
  addon: AdminAddon;
  onRequestPermanentDelete?: (addon: AdminAddon) => void;
}) {
  const tAdmin = useTranslations("admin");
  const updateMutation = useUpdateAddonMutation();
  const deleteMutation = useDeleteAddonMutation();
  const [state, setState] = useState<AddonFormState>(() => toAddonFormState(addon));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [summaryError, setSummaryError] = useState<string>();

  async function onToggle() {
    try {
      await updateMutation.mutateAsync({
        addonId: addon.id,
        input: {
          isActive: !state.isActive,
        },
      });

      setState((previous) => ({ ...previous, isActive: !previous.isActive }));
      toast.success(tAdmin("packages_addon_toast_updated"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_addon_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  async function onSave() {
    const payload = parseAddonFormToPayload(state);
    const nextErrors = validateAddonPayload(payload, tAdmin);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSummaryError(tAdmin("packages_form_validation_summary"));
      return;
    }

    setSummaryError(undefined);

    try {
      await updateMutation.mutateAsync({
        addonId: addon.id,
        input: {
          name: payload.name,
          description: payload.description,
          pricingType: payload.pricingType,
          price: payload.pricingType === "fixed" ? payload.price : null,
          pricePerWord: payload.pricingType === "per_word" ? payload.pricePerWord : null,
          sortOrder: payload.sortOrder,
          isActive: payload.isActive,
        },
      });

      toast.success(tAdmin("packages_addon_toast_updated"));
      setErrors({});
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      setSummaryError(normalized.description);
      toast.error(tAdmin("packages_addon_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  async function onDelete() {
    try {
      await deleteMutation.mutateAsync(addon.id);
      setState((previous) => ({ ...previous, isActive: false }));
      toast.success(tAdmin("packages_addon_toast_deleted"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_addon_toast_delete_failed"), {
        description: normalized.description,
      });
    }
  }

  return (
    <article className="rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-4">
      <ValidationSummary message={summaryError} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold text-white">{addon.name}</p>
          <p className="font-sans mt-1 text-xs text-[#9A9A9A]">
            {state.pricingType === "fixed"
              ? tAdmin("packages_addon_price_fixed_label", { amount: state.price || "0" })
              : tAdmin("packages_addon_price_per_word_label", {
                  amount: state.pricePerWord || "0",
                })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              state.isActive
                ? "rounded-full border border-[#1E5F31] bg-[#0A1B11] px-3 py-1 font-sans text-xs text-[#7DE29B]"
                : "rounded-full border border-[#5F5F5F] bg-[#1A1A1A] px-3 py-1 font-sans text-xs text-[#C8C8C8]"
            }
          >
            {state.isActive
              ? tAdmin("packages_addon_status_active")
              : tAdmin("packages_addon_status_inactive")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="size-9 rounded-full border border-[#2A2A2A] bg-[#0C0C0C] p-0 text-[#D1D1D1] hover:bg-[#171717]"
                aria-label={tAdmin("users_table_actions")}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-[#2A2A2A] bg-[#101010] text-white">
              <DropdownMenuItem
                onSelect={() => {
                  void onToggle();
                }}
              >
                <Power className="size-4" aria-hidden="true" />
                {state.isActive
                  ? tAdmin("packages_table_action_deactivate")
                  : tAdmin("packages_table_action_activate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void onDelete();
                }}
                className="text-[#EAC6A5] focus:bg-[#2A1B10] focus:text-[#FFE7D0]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {tAdmin("packages_addon_action_delete")}
              </DropdownMenuItem>
              {onRequestPermanentDelete ? (
                <DropdownMenuItem
                  onSelect={() => onRequestPermanentDelete(addon)}
                  className="text-[#FFB4B4] focus:bg-[#2A1010] focus:text-[#FFD0D0]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {tAdmin("packages_table_action_delete_permanently")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor={`addon-${addon.id}-name`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_name")}
          </label>
          <Input
            id={`addon-${addon.id}-name`}
            value={state.name}
            onChange={(event) =>
              setState((previous) => ({ ...previous, name: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.name)}
            aria-label={tAdmin("packages_addon_field_name")}
          />
          <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor={`addon-${addon.id}-pricing-type`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_pricing_type")}
          </label>
          <Select
            value={state.pricingType}
            onValueChange={(value: "fixed" | "per_word") =>
              setState((previous) => ({ ...previous, pricingType: value }))
            }
            aria-label={tAdmin("packages_addon_field_pricing_type")}
          >
            <SelectTrigger
              id={`addon-${addon.id}-pricing-type`}
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#2A2A2A] bg-[#0A0A0A] text-white">
              <SelectItem value="fixed">{tAdmin("packages_addon_pricing_fixed")}</SelectItem>
              <SelectItem value="per_word">{tAdmin("packages_addon_pricing_per_word")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {state.pricingType === "fixed" ? (
          <div className="min-w-0">
            <label
              htmlFor={`addon-${addon.id}-price`}
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_addon_field_price")}
            </label>
            <Input
              id={`addon-${addon.id}-price`}
              type="number"
              min={0}
              step="0.01"
              value={state.price}
              onChange={(event) =>
                setState((previous) => ({ ...previous, price: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-invalid={Boolean(errors.price)}
              aria-label={tAdmin("packages_addon_field_price")}
            />
            <FieldError errors={errors.price ? [{ message: errors.price }] : undefined} />
          </div>
        ) : (
          <div className="min-w-0">
            <label
              htmlFor={`addon-${addon.id}-price-per-word`}
              className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
            >
              {tAdmin("packages_addon_field_price_per_word")}
            </label>
            <Input
              id={`addon-${addon.id}-price-per-word`}
              type="number"
              min={0}
              step="0.0001"
              value={state.pricePerWord}
              onChange={(event) =>
                setState((previous) => ({ ...previous, pricePerWord: event.target.value }))
              }
              className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
              aria-invalid={Boolean(errors.pricePerWord)}
              aria-label={tAdmin("packages_addon_field_price_per_word")}
            />
            <FieldError
              errors={errors.pricePerWord ? [{ message: errors.pricePerWord }] : undefined}
            />
          </div>
        )}

        <div className="min-w-0">
          <label
            htmlFor={`addon-${addon.id}-sort-order`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_sort_order")}
          </label>
          <Input
            id={`addon-${addon.id}-sort-order`}
            type="number"
            min={0}
            value={state.sortOrder}
            onChange={(event) =>
              setState((previous) => ({ ...previous, sortOrder: event.target.value }))
            }
            className="min-h-11 border-[#2A2A2A] bg-[#080808] text-white"
            aria-invalid={Boolean(errors.sortOrder)}
            aria-label={tAdmin("packages_addon_field_sort_order")}
          />
          <FieldError errors={errors.sortOrder ? [{ message: errors.sortOrder }] : undefined} />
        </div>

        <div className="min-w-0">
          <label
            htmlFor={`addon-${addon.id}-active`}
            className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
          >
            {tAdmin("packages_addon_field_active")}
          </label>
          <div className="flex min-h-11 items-center rounded-full border border-[#2A2A2A] bg-[#080808] px-4">
            <Switch
              id={`addon-${addon.id}-active`}
              checked={state.isActive}
              onCheckedChange={(value) =>
                setState((previous) => ({ ...previous, isActive: value }))
              }
              aria-label={tAdmin("packages_addon_field_active")}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <label
          htmlFor={`addon-${addon.id}-description`}
          className="mb-2 block font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
        >
          {tAdmin("packages_addon_field_description")}
        </label>
        <Textarea
          id={`addon-${addon.id}-description`}
          value={state.description}
          onChange={(event) =>
            setState((previous) => ({ ...previous, description: event.target.value }))
          }
          className="min-h-20 border-[#2A2A2A] bg-[#080808] text-white"
          aria-invalid={Boolean(errors.description)}
          aria-label={tAdmin("packages_addon_field_description")}
        />
        <FieldError errors={errors.description ? [{ message: errors.description }] : undefined} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            void onSave();
          }}
          disabled={updateMutation.isPending}
          className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
        >
          {updateMutation.isPending
            ? tAdmin("packages_addon_action_saving")
            : tAdmin("packages_addon_action_save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void onDelete();
          }}
          disabled={deleteMutation.isPending || !state.isActive}
          className="min-h-11 rounded-full border-[#4A1616] bg-[#1A0D0D] px-5 font-sans text-sm font-medium text-[#FFD0D0] hover:bg-[#251111] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {deleteMutation.isPending
            ? tAdmin("packages_addon_action_deleting")
            : tAdmin("packages_addon_action_delete")}
        </Button>
      </div>
    </article>
  );
}

function CategoriesDesktopTable({
  categories,
  tAdmin,
  onEdit,
  onToggle,
  onDelete,
}: {
  categories: AdminPackageCategory[];
  tAdmin: ReturnType<typeof useTranslations>;
  onEdit: (categoryId: string) => void;
  onToggle: (category: AdminPackageCategory) => void;
  onDelete: (category: AdminPackageCategory) => void;
}) {
  const columnHelper = createColumnHelper<AdminPackageCategory>();

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: tAdmin("packages_category_field_name"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-white">{row.original.name}</span>
        ),
      }),
      columnHelper.accessor("copies", {
        header: tAdmin("packages_category_field_copies"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">{row.original.copies}</span>
        ),
      }),
      columnHelper.accessor("sortOrder", {
        header: tAdmin("packages_category_field_sort_order"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">{row.original.sortOrder}</span>
        ),
      }),
      columnHelper.accessor("packageCount", {
        header: tAdmin("packages_category_package_count", { count: 0 }).replace("0 ", ""),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">{row.original.packageCount}</span>
        ),
      }),
      columnHelper.accessor("isActive", {
        header: tAdmin("packages_category_field_active"),
        cell: ({ row }) => (
          <span className={getStatusPillClass(row.original.isActive)}>
            {row.original.isActive
              ? tAdmin("packages_category_status_active")
              : tAdmin("packages_category_status_inactive")}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: tAdmin("users_table_actions"),
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-9 rounded-full border border-[#2A2A2A] bg-[#0C0C0C] p-0 text-[#D1D1D1] hover:bg-[#171717]"
                  aria-label={tAdmin("users_table_actions")}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-[#2A2A2A] bg-[#101010] text-white">
                <DropdownMenuItem onSelect={() => onEdit(row.original.id)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  {tAdmin("packages_table_action_edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggle(row.original)}>
                  <Power className="size-4" aria-hidden="true" />
                  {row.original.isActive
                    ? tAdmin("packages_table_action_deactivate")
                    : tAdmin("packages_table_action_activate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#2A2A2A]" />
                <DropdownMenuItem
                  onSelect={() => onDelete(row.original)}
                  className="text-[#FFB4B4] focus:bg-[#2A1010] focus:text-[#FFD0D0]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {tAdmin("packages_category_action_delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [columnHelper, onDelete, onEdit, onToggle, tAdmin]
  );

  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-[#1D1D1D] bg-[#080808]">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-[#1D1D1D] hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-11 border-b border-[#1D1D1D] px-3 font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
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
          {table.getRowModel().rows.length === 0 ? (
            <TableRow className="border-[#1D1D1D]">
              <TableCell colSpan={6} className="h-16 px-3 font-sans text-sm text-[#8F8F8F]">
                {tAdmin("packages_categories_empty")}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-[#1D1D1D] hover:bg-[#101010]">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-3 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PackagesDesktopTable({
  packages,
  tAdmin,
  onEdit,
  onToggle,
  onDeletePermanently,
}: {
  packages: AdminPackage[];
  tAdmin: ReturnType<typeof useTranslations>;
  onEdit: (packageId: string) => void;
  onToggle: (pkg: AdminPackage) => void;
  onDeletePermanently: (pkg: AdminPackage) => void;
}) {
  const columnHelper = createColumnHelper<AdminPackage>();

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: tAdmin("packages_package_field_name"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-white">{row.original.name}</span>
        ),
      }),
      columnHelper.accessor((row) => row.category.name, {
        id: "category",
        header: tAdmin("packages_package_field_category"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">{row.original.category.name}</span>
        ),
      }),
      columnHelper.accessor("basePrice", {
        header: tAdmin("packages_package_field_base_price"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">NGN {row.original.basePrice}</span>
        ),
      }),
      columnHelper.accessor("pageLimit", {
        header: tAdmin("packages_package_field_page_limit"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">{row.original.pageLimit}</span>
        ),
      }),
      columnHelper.accessor("isActive", {
        header: tAdmin("packages_package_field_active"),
        cell: ({ row }) => (
          <span className={getStatusPillClass(row.original.isActive)}>
            {row.original.isActive
              ? tAdmin("packages_package_status_active")
              : tAdmin("packages_package_status_inactive")}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: tAdmin("users_table_actions"),
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-9 rounded-full border border-[#2A2A2A] bg-[#0C0C0C] p-0 text-[#D1D1D1] hover:bg-[#171717]"
                  aria-label={tAdmin("users_table_actions")}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-[#2A2A2A] bg-[#101010] text-white">
                <DropdownMenuItem onSelect={() => onEdit(row.original.id)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  {tAdmin("packages_table_action_edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggle(row.original)}>
                  <Power className="size-4" aria-hidden="true" />
                  {row.original.isActive
                    ? tAdmin("packages_table_action_deactivate")
                    : tAdmin("packages_table_action_activate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#2A2A2A]" />
                <DropdownMenuItem
                  onSelect={() => onDeletePermanently(row.original)}
                  className="text-[#FFB4B4] focus:bg-[#2A1010] focus:text-[#FFD0D0]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {tAdmin("packages_table_action_delete_permanently")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [columnHelper, onDeletePermanently, onEdit, onToggle, tAdmin]
  );

  const table = useReactTable({
    data: packages,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-[#1D1D1D] bg-[#080808]">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-[#1D1D1D] hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-11 border-b border-[#1D1D1D] px-3 font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
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
          {table.getRowModel().rows.length === 0 ? (
            <TableRow className="border-[#1D1D1D]">
              <TableCell colSpan={6} className="h-16 px-3 font-sans text-sm text-[#8F8F8F]">
                {tAdmin("packages_packages_empty")}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-[#1D1D1D] hover:bg-[#101010]">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-3 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AddonsDesktopTable({
  addons,
  tAdmin,
  onEdit,
  onToggle,
  onDelete,
  onDeletePermanently,
}: {
  addons: AdminAddon[];
  tAdmin: ReturnType<typeof useTranslations>;
  onEdit: (addonId: string) => void;
  onToggle: (addon: AdminAddon) => void;
  onDelete: (addon: AdminAddon) => void;
  onDeletePermanently: (addon: AdminAddon) => void;
}) {
  const columnHelper = createColumnHelper<AdminAddon>();

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: tAdmin("packages_addon_field_name"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-white">{row.original.name}</span>
        ),
      }),
      columnHelper.accessor("pricingType", {
        header: tAdmin("packages_addon_field_pricing_type"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">
            {row.original.pricingType === "fixed"
              ? tAdmin("packages_addon_pricing_fixed")
              : tAdmin("packages_addon_pricing_per_word")}
          </span>
        ),
      }),
      columnHelper.display({
        id: "price",
        header: tAdmin("packages_addon_field_price"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">
            {row.original.pricingType === "fixed"
              ? `NGN ${row.original.price ?? 0}`
              : `NGN ${row.original.pricePerWord ?? 0}`}
          </span>
        ),
      }),
      columnHelper.accessor("sortOrder", {
        header: tAdmin("packages_addon_field_sort_order"),
        cell: ({ row }) => (
          <span className="font-sans text-sm text-[#CFCFCF]">{row.original.sortOrder}</span>
        ),
      }),
      columnHelper.accessor("isActive", {
        header: tAdmin("packages_addon_field_active"),
        cell: ({ row }) => (
          <span className={getStatusPillClass(row.original.isActive)}>
            {row.original.isActive
              ? tAdmin("packages_addon_status_active")
              : tAdmin("packages_addon_status_inactive")}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: tAdmin("users_table_actions"),
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-9 rounded-full border border-[#2A2A2A] bg-[#0C0C0C] p-0 text-[#D1D1D1] hover:bg-[#171717]"
                  aria-label={tAdmin("users_table_actions")}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-[#2A2A2A] bg-[#101010] text-white">
                <DropdownMenuItem onSelect={() => onEdit(row.original.id)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  {tAdmin("packages_table_action_edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggle(row.original)}>
                  <Power className="size-4" aria-hidden="true" />
                  {row.original.isActive
                    ? tAdmin("packages_table_action_deactivate")
                    : tAdmin("packages_table_action_activate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#2A2A2A]" />
                <DropdownMenuItem
                  onSelect={() => onDelete(row.original)}
                  className="text-[#EAC6A5] focus:bg-[#2A1B10] focus:text-[#FFE7D0]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {tAdmin("packages_addon_action_delete")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onDeletePermanently(row.original)}
                  className="text-[#FFB4B4] focus:bg-[#2A1010] focus:text-[#FFD0D0]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {tAdmin("packages_table_action_delete_permanently")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [columnHelper, onDelete, onDeletePermanently, onEdit, onToggle, tAdmin]
  );

  const table = useReactTable({
    data: addons,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-[#1D1D1D] bg-[#080808]">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-[#1D1D1D] hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-11 border-b border-[#1D1D1D] px-3 font-sans text-[11px] font-medium tracking-[0.08em] text-[#8f8f8f] uppercase"
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
          {table.getRowModel().rows.length === 0 ? (
            <TableRow className="border-[#1D1D1D]">
              <TableCell colSpan={6} className="h-16 px-3 font-sans text-sm text-[#8F8F8F]">
                {tAdmin("packages_addons_empty")}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-[#1D1D1D] hover:bg-[#101010]">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-3 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function AdminPackagesWorkspaceView() {
  const tAdmin = useTranslations("admin");

  type PermanentDeleteTarget = {
    type: "category" | "package" | "addon";
    id: string;
    name: string;
  };

  type MobileStatusFilter = "all" | "active" | "inactive";

  const categoriesQuery = useAdminPackageCategories();
  const packagesQuery = useAdminPackages();
  const addonsQuery = useAdminAddons();

  const updateCategoryMutation = useUpdatePackageCategoryMutation();
  const deleteCategoryMutation = useDeletePackageCategoryMutation();
  const deletePackageMutation = useDeletePackageMutation();
  const updatePackageMutation = useUpdatePackageMutation();
  const updateAddonMutation = useUpdateAddonMutation();
  const deleteAddonMutation = useDeleteAddonMutation();
  const deleteAddonPermanentMutation = useDeleteAddonPermanentMutation();

  const [showDesktopCategoryCreate, setShowDesktopCategoryCreate] = useState(false);
  const [showDesktopPackageCreate, setShowDesktopPackageCreate] = useState(false);
  const [showDesktopAddonCreate, setShowDesktopAddonCreate] = useState(false);
  const [showMobileCategoryCreate, setShowMobileCategoryCreate] = useState(false);
  const [showMobilePackageCreate, setShowMobilePackageCreate] = useState(false);
  const [showMobileAddonCreate, setShowMobileAddonCreate] = useState(false);
  const [mobileSection, setMobileSection] = useState<"categories" | "packages" | "addons">(
    "categories"
  );
  const [mobileCategorySearch, setMobileCategorySearch] = useState("");
  const [mobileCategoryStatus, setMobileCategoryStatus] = useState<MobileStatusFilter>("all");
  const [mobileCategoryVisibleCount, setMobileCategoryVisibleCount] = useState(6);
  const [mobilePackageSearch, setMobilePackageSearch] = useState("");
  const [mobilePackageStatus, setMobilePackageStatus] = useState<MobileStatusFilter>("all");
  const [mobilePackageVisibleCount, setMobilePackageVisibleCount] = useState(6);
  const [mobileAddonSearch, setMobileAddonSearch] = useState("");
  const [mobileAddonStatus, setMobileAddonStatus] = useState<MobileStatusFilter>("all");
  const [mobileAddonVisibleCount, setMobileAddonVisibleCount] = useState(6);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<PermanentDeleteTarget | null>(
    null
  );
  const [permanentDeleteConfirmText, setPermanentDeleteConfirmText] = useState("");

  const sortedCategories = (categoriesQuery.data ?? []).slice().sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.name.localeCompare(right.name);
  });

  const uncategorizedPackages = (packagesQuery.data ?? [])
    .filter((pkg) => !sortedCategories.some((category) => category.id === pkg.categoryId))
    .slice()
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.name.localeCompare(right.name);
    });

  const sortedAddons = (addonsQuery.data ?? []).slice().sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.name.localeCompare(right.name);
  });

  const sortedPackages = (packagesQuery.data ?? []).slice().sort((left, right) => {
    const leftCategory = sortedCategories.find((category) => category.id === left.categoryId);
    const rightCategory = sortedCategories.find((category) => category.id === right.categoryId);

    if (leftCategory && rightCategory && leftCategory.sortOrder !== rightCategory.sortOrder) {
      return leftCategory.sortOrder - rightCategory.sortOrder;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });

  const mobileFilteredCategories = sortedCategories.filter((category) => {
    const query = mobileCategorySearch.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      category.name.toLowerCase().includes(query) ||
      (category.description ?? "").toLowerCase().includes(query);
    const matchesStatus =
      mobileCategoryStatus === "all" ||
      (mobileCategoryStatus === "active" ? category.isActive : !category.isActive);

    return matchesQuery && matchesStatus;
  });

  const mobileFilteredPackages = sortedPackages.filter((pkg) => {
    const query = mobilePackageSearch.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      pkg.name.toLowerCase().includes(query) ||
      pkg.category.name.toLowerCase().includes(query) ||
      (pkg.description ?? "").toLowerCase().includes(query);
    const matchesStatus =
      mobilePackageStatus === "all" ||
      (mobilePackageStatus === "active" ? pkg.isActive : !pkg.isActive);

    return matchesQuery && matchesStatus;
  });

  const mobileFilteredAddons = sortedAddons.filter((addon) => {
    const query = mobileAddonSearch.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      addon.name.toLowerCase().includes(query) ||
      (addon.description ?? "").toLowerCase().includes(query);
    const matchesStatus =
      mobileAddonStatus === "all" ||
      (mobileAddonStatus === "active" ? addon.isActive : !addon.isActive);

    return matchesQuery && matchesStatus;
  });

  const mobileVisibleCategories = mobileFilteredCategories.slice(0, mobileCategoryVisibleCount);
  const mobileVisiblePackages = mobileFilteredPackages.slice(0, mobilePackageVisibleCount);
  const mobileVisibleAddons = mobileFilteredAddons.slice(0, mobileAddonVisibleCount);

  const hasMoreMobileCategories = mobileVisibleCategories.length < mobileFilteredCategories.length;
  const hasMoreMobilePackages = mobileVisiblePackages.length < mobileFilteredPackages.length;
  const hasMoreMobileAddons = mobileVisibleAddons.length < mobileFilteredAddons.length;

  const isPageError = categoriesQuery.isError && packagesQuery.isError && addonsQuery.isError;

  const editingCategory = sortedCategories.find((category) => category.id === editingCategoryId);
  const editingPackage = (packagesQuery.data ?? []).find((pkg) => pkg.id === editingPackageId);
  const editingAddon = sortedAddons.find((addon) => addon.id === editingAddonId);
  const isPermanentDeletePending =
    deletePackageMutation.isPending || deleteAddonPermanentMutation.isPending;

  function openPermanentDeleteDialog(target: PermanentDeleteTarget) {
    setPermanentDeleteTarget(target);
    setPermanentDeleteConfirmText("");
  }

  function closePermanentDeleteDialog() {
    if (isPermanentDeletePending) {
      return;
    }

    setPermanentDeleteTarget(null);
    setPermanentDeleteConfirmText("");
  }

  async function handleCategoryToggle(category: AdminPackageCategory) {
    try {
      await updateCategoryMutation.mutateAsync({
        categoryId: category.id,
        input: {
          isActive: !category.isActive,
        },
      });
      toast.success(tAdmin("packages_category_toast_updated"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_category_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  async function handleCategoryDelete(category: AdminPackageCategory): Promise<boolean> {
    if (category.packageCount > 0) {
      toast.error(tAdmin("packages_category_delete_blocked"), {
        description: tAdmin("packages_category_delete_blocked_description", {
          count: category.packageCount,
        }),
      });
      return false;
    }

    try {
      await deleteCategoryMutation.mutateAsync(category.id);
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
      }
      toast.success(tAdmin("packages_category_toast_deleted"));
      return true;
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_category_toast_delete_failed"), {
        description: normalized.description,
      });
      return false;
    }
  }

  async function handlePackageToggle(pkg: AdminPackage) {
    try {
      await updatePackageMutation.mutateAsync({
        packageId: pkg.id,
        input: {
          isActive: !pkg.isActive,
        },
      });
      toast.success(tAdmin("packages_package_toast_updated"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_package_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  async function handleAddonToggle(addon: AdminAddon) {
    try {
      await updateAddonMutation.mutateAsync({
        addonId: addon.id,
        input: {
          isActive: !addon.isActive,
        },
      });
      toast.success(tAdmin("packages_addon_toast_updated"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_addon_toast_update_failed"), {
        description: normalized.description,
      });
    }
  }

  async function handleAddonDelete(addon: AdminAddon) {
    try {
      await deleteAddonMutation.mutateAsync(addon.id);
      if (editingAddonId === addon.id) {
        setEditingAddonId(null);
      }
      toast.success(tAdmin("packages_addon_toast_deleted"));
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_addon_toast_delete_failed"), {
        description: normalized.description,
      });
    }
  }

  async function handlePackageDeletePermanently(packageId: string): Promise<boolean> {
    try {
      await deletePackageMutation.mutateAsync(packageId);
      if (editingPackageId === packageId) {
        setEditingPackageId(null);
      }
      toast.success(tAdmin("packages_package_toast_deleted_permanently"));
      return true;
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_package_toast_delete_failed"), {
        description: normalized.description,
      });
      return false;
    }
  }

  async function handleAddonDeletePermanently(addonId: string): Promise<boolean> {
    try {
      await deleteAddonPermanentMutation.mutateAsync(addonId);
      if (editingAddonId === addonId) {
        setEditingAddonId(null);
      }
      toast.success(tAdmin("packages_addon_toast_deleted_permanently"));
      return true;
    } catch (error) {
      const normalized = normalizeCatalogError(error);
      toast.error(tAdmin("packages_addon_toast_delete_failed"), {
        description: normalized.description,
      });
      return false;
    }
  }

  async function submitPermanentDelete() {
    if (!permanentDeleteTarget || permanentDeleteConfirmText.trim() !== "DELETE") {
      return;
    }

    const didDelete =
      permanentDeleteTarget.type === "category"
        ? (() => {
            const category = sortedCategories.find((item) => item.id === permanentDeleteTarget.id);

            if (!category) {
              toast.error(tAdmin("packages_category_toast_delete_failed"));
              return Promise.resolve(false);
            }

            return handleCategoryDelete(category);
          })()
        : permanentDeleteTarget.type === "package"
          ? await handlePackageDeletePermanently(permanentDeleteTarget.id)
          : await handleAddonDeletePermanently(permanentDeleteTarget.id);

    if (didDelete) {
      closePermanentDeleteDialog();
    }
  }

  return (
    <section className="grid min-w-0 gap-4">
      <header className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {tAdmin("packages")}
        </h1>
        <p className="font-sans mt-3 max-w-3xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("packages_workspace_description")}
        </p>
      </header>

      {isPageError ? (
        <section className="rounded-[1.5rem] border border-[#4A1616] bg-[linear-gradient(180deg,#160707_0%,#0C0A0A_100%)] p-5">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
            {tAdmin("packages_page_error_title")}
          </h2>
          <p className="font-sans mt-2 max-w-2xl text-sm leading-6 text-[#FFC5C5]">
            {tAdmin("packages_page_error_description")}
          </p>
          <Button
            type="button"
            onClick={() => {
              void categoriesQuery.refetch();
              void packagesQuery.refetch();
              void addonsQuery.refetch();
            }}
            className="mt-4 min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {tAdmin("packages_page_retry_all")}
          </Button>
        </section>
      ) : null}

      <section className="md:hidden">
        <div className="grid grid-cols-3 gap-2 rounded-[1.25rem] border border-[#1D1D1D] bg-[#0A0A0A] p-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMobileSection("categories")}
            className={`min-h-10 rounded-full px-3 font-sans text-xs font-medium ${
              mobileSection === "categories"
                ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                : "bg-[#121212] text-[#D0D0D0] hover:bg-[#1A1A1A]"
            }`}
          >
            {tAdmin("packages_categories_title")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMobileSection("packages")}
            className={`min-h-10 rounded-full px-3 font-sans text-xs font-medium ${
              mobileSection === "packages"
                ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                : "bg-[#121212] text-[#D0D0D0] hover:bg-[#1A1A1A]"
            }`}
          >
            {tAdmin("packages_packages_title")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMobileSection("addons")}
            className={`min-h-10 rounded-full px-3 font-sans text-xs font-medium ${
              mobileSection === "addons"
                ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                : "bg-[#121212] text-[#D0D0D0] hover:bg-[#1A1A1A]"
            }`}
          >
            {tAdmin("packages_addons_title")}
          </Button>
        </div>
      </section>

      <section
        className={`rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5 ${
          mobileSection !== "categories" ? "hidden md:block" : "block"
        }`}
      >
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
            {tAdmin("packages_categories_title")}
          </h2>
          <p className="font-sans mt-2 text-sm leading-6 text-[#B4B4B4]">
            {tAdmin("packages_categories_description")}
          </p>
        </div>

        {categoriesQuery.isLoading ? (
          <SectionSkeleton label={tAdmin("packages_categories_loading")} />
        ) : null}

        {!categoriesQuery.isLoading && categoriesQuery.isError ? (
          <SectionError
            title={tAdmin("packages_section_error_title")}
            description={resolveSectionErrorDescription(
              tAdmin("packages_section_error_description"),
              categoriesQuery.error
            )}
            retryLabel={tAdmin("packages_section_retry")}
            onRetry={() => {
              void categoriesQuery.refetch();
            }}
          />
        ) : null}

        {!categoriesQuery.isLoading ? (
          <div className="grid gap-3">
            <div className="hidden items-center justify-between md:flex">
              <p className="font-sans text-xs text-[#8F8F8F]">
                {tAdmin("packages_categories_description")}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDesktopCategoryCreate((previous) => !previous)}
                className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
              >
                <Plus className="size-4" aria-hidden="true" />
                {showDesktopCategoryCreate
                  ? tAdmin("packages_table_action_close_create")
                  : tAdmin("packages_category_action_create")}
              </Button>
            </div>

            {showDesktopCategoryCreate ? (
              <div className="hidden md:block">
                <CategoryCreateForm />
              </div>
            ) : null}

            {!categoriesQuery.isError ? (
              <div className="hidden md:block">
                <CategoriesDesktopTable
                  categories={sortedCategories}
                  tAdmin={tAdmin}
                  onEdit={(categoryId) => setEditingCategoryId(categoryId)}
                  onToggle={(category) => {
                    void handleCategoryToggle(category);
                  }}
                  onDelete={(category) => {
                    openPermanentDeleteDialog({
                      type: "category",
                      id: category.id,
                      name: category.name,
                    });
                  }}
                />
              </div>
            ) : null}

            {editingCategory ? (
              <div className="hidden md:block">
                <CategoryRow
                  key={editingCategory.id}
                  category={editingCategory}
                  onRequestDelete={(category) =>
                    openPermanentDeleteDialog({
                      type: "category",
                      id: category.id,
                      name: category.name,
                    })
                  }
                />
              </div>
            ) : null}

            <div className="grid gap-3 md:hidden">
              <div className="grid gap-2 rounded-[1rem] border border-[#1D1D1D] bg-[#080808] p-3">
                <Input
                  value={mobileCategorySearch}
                  onChange={(event) => {
                    setMobileCategorySearch(event.target.value);
                    setMobileCategoryVisibleCount(6);
                  }}
                  placeholder={tAdmin("packages_mobile_search_categories_placeholder")}
                  className="min-h-10 border-[#2A2A2A] bg-[#0E0E0E] text-white"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobileCategoryStatus("all");
                      setMobileCategoryVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobileCategoryStatus === "all"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_all")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobileCategoryStatus("active");
                      setMobileCategoryVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobileCategoryStatus === "active"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_active")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobileCategoryStatus("inactive");
                      setMobileCategoryVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobileCategoryStatus === "inactive"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_inactive")}
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowMobileCategoryCreate((previous) => !previous)}
                className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
              >
                <Plus className="size-4" aria-hidden="true" />
                {showMobileCategoryCreate
                  ? tAdmin("packages_table_action_close_create")
                  : tAdmin("packages_category_action_create")}
              </Button>
              {showMobileCategoryCreate ? <CategoryCreateForm /> : null}
              {categoriesQuery.isError ? null : mobileFilteredCategories.length === 0 ? (
                <SectionReady label={tAdmin("packages_categories_empty")} />
              ) : (
                mobileVisibleCategories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    onRequestDelete={(item) =>
                      openPermanentDeleteDialog({
                        type: "category",
                        id: item.id,
                        name: item.name,
                      })
                    }
                  />
                ))
              )}
              {hasMoreMobileCategories ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMobileCategoryVisibleCount((previous) => previous + 6)}
                  className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
                >
                  {tAdmin("packages_mobile_load_more")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section
        className={`rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5 ${
          mobileSection !== "packages" ? "hidden md:block" : "block"
        }`}
      >
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
            {tAdmin("packages_packages_title")}
          </h2>
          <p className="font-sans mt-2 text-sm leading-6 text-[#B4B4B4]">
            {tAdmin("packages_packages_description")}
          </p>
        </div>

        {packagesQuery.isLoading ? (
          <SectionSkeleton label={tAdmin("packages_packages_loading")} />
        ) : null}

        {!packagesQuery.isLoading && packagesQuery.isError ? (
          <SectionError
            title={tAdmin("packages_section_error_title")}
            description={resolveSectionErrorDescription(
              tAdmin("packages_section_error_description"),
              packagesQuery.error
            )}
            retryLabel={tAdmin("packages_section_retry")}
            onRetry={() => {
              void packagesQuery.refetch();
            }}
          />
        ) : null}

        {!packagesQuery.isLoading ? (
          <div className="grid gap-3">
            <div className="hidden items-center justify-between md:flex">
              <p className="font-sans text-xs text-[#8F8F8F]">
                {tAdmin("packages_packages_description")}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDesktopPackageCreate((previous) => !previous)}
                className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
              >
                <Plus className="size-4" aria-hidden="true" />
                {showDesktopPackageCreate
                  ? tAdmin("packages_table_action_close_create")
                  : tAdmin("packages_package_action_create")}
              </Button>
            </div>

            {showDesktopPackageCreate ? (
              <div className="hidden md:block">
                <PackageCreateForm categories={sortedCategories} />
              </div>
            ) : null}

            {!packagesQuery.isError ? (
              <div className="hidden md:block">
                <PackagesDesktopTable
                  packages={[
                    ...(packagesQuery.data ?? []).filter((pkg) =>
                      sortedCategories.some((category) => category.id === pkg.categoryId)
                    ),
                    ...uncategorizedPackages,
                  ]}
                  tAdmin={tAdmin}
                  onEdit={(packageId) => setEditingPackageId(packageId)}
                  onToggle={(pkg) => {
                    void handlePackageToggle(pkg);
                  }}
                  onDeletePermanently={(pkg) => {
                    openPermanentDeleteDialog({
                      type: "package",
                      id: pkg.id,
                      name: pkg.name,
                    });
                  }}
                />
              </div>
            ) : null}

            {editingPackage ? (
              <div className="hidden md:block">
                <PackageRow
                  key={editingPackage.id}
                  pkg={editingPackage}
                  categories={sortedCategories}
                  onRequestPermanentDelete={(pkg) =>
                    openPermanentDeleteDialog({
                      type: "package",
                      id: pkg.id,
                      name: pkg.name,
                    })
                  }
                />
              </div>
            ) : null}

            <div className="grid gap-3 md:hidden">
              <div className="grid gap-2 rounded-[1rem] border border-[#1D1D1D] bg-[#080808] p-3">
                <Input
                  value={mobilePackageSearch}
                  onChange={(event) => {
                    setMobilePackageSearch(event.target.value);
                    setMobilePackageVisibleCount(6);
                  }}
                  placeholder={tAdmin("packages_mobile_search_packages_placeholder")}
                  className="min-h-10 border-[#2A2A2A] bg-[#0E0E0E] text-white"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobilePackageStatus("all");
                      setMobilePackageVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobilePackageStatus === "all"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_all")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobilePackageStatus("active");
                      setMobilePackageVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobilePackageStatus === "active"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_active")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobilePackageStatus("inactive");
                      setMobilePackageVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobilePackageStatus === "inactive"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_inactive")}
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowMobilePackageCreate((previous) => !previous)}
                className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
              >
                <Plus className="size-4" aria-hidden="true" />
                {showMobilePackageCreate
                  ? tAdmin("packages_table_action_close_create")
                  : tAdmin("packages_package_action_create")}
              </Button>
              {showMobilePackageCreate ? <PackageCreateForm categories={sortedCategories} /> : null}

              {packagesQuery.isError ? null : mobileFilteredPackages.length === 0 ? (
                <SectionReady label={tAdmin("packages_packages_empty")} />
              ) : (
                mobileVisiblePackages.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    pkg={pkg}
                    categories={sortedCategories}
                    onRequestPermanentDelete={(item) =>
                      openPermanentDeleteDialog({
                        type: "package",
                        id: item.id,
                        name: item.name,
                      })
                    }
                  />
                ))
              )}

              {hasMoreMobilePackages ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMobilePackageVisibleCount((previous) => previous + 6)}
                  className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
                >
                  {tAdmin("packages_mobile_load_more")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section
        className={`rounded-[1.5rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0A0A0A_100%)] p-4 md:p-5 ${
          mobileSection !== "addons" ? "hidden md:block" : "block"
        }`}
      >
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
            {tAdmin("packages_addons_title")}
          </h2>
          <p className="font-sans mt-2 text-sm leading-6 text-[#B4B4B4]">
            {tAdmin("packages_addons_description")}
          </p>
        </div>

        {addonsQuery.isLoading ? (
          <SectionSkeleton label={tAdmin("packages_addons_loading")} />
        ) : null}

        {!addonsQuery.isLoading && addonsQuery.isError ? (
          <SectionError
            title={tAdmin("packages_section_error_title")}
            description={resolveSectionErrorDescription(
              tAdmin("packages_section_error_description"),
              addonsQuery.error
            )}
            retryLabel={tAdmin("packages_section_retry")}
            onRetry={() => {
              void addonsQuery.refetch();
            }}
          />
        ) : null}

        {!addonsQuery.isLoading ? (
          <div className="grid gap-3">
            <div className="hidden items-center justify-between md:flex">
              <p className="font-sans text-xs text-[#8F8F8F]">
                {tAdmin("packages_addons_description")}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDesktopAddonCreate((previous) => !previous)}
                className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
              >
                <Plus className="size-4" aria-hidden="true" />
                {showDesktopAddonCreate
                  ? tAdmin("packages_table_action_close_create")
                  : tAdmin("packages_addon_action_create")}
              </Button>
            </div>

            {showDesktopAddonCreate ? (
              <div className="hidden md:block">
                <AddonCreateForm />
              </div>
            ) : null}

            {!addonsQuery.isError ? (
              <div className="hidden md:block">
                <AddonsDesktopTable
                  addons={sortedAddons}
                  tAdmin={tAdmin}
                  onEdit={(addonId) => setEditingAddonId(addonId)}
                  onToggle={(addon) => {
                    void handleAddonToggle(addon);
                  }}
                  onDelete={(addon) => {
                    void handleAddonDelete(addon);
                  }}
                  onDeletePermanently={(addon) => {
                    openPermanentDeleteDialog({
                      type: "addon",
                      id: addon.id,
                      name: addon.name,
                    });
                  }}
                />
              </div>
            ) : null}

            {editingAddon ? (
              <div className="hidden md:block">
                <AddonRow
                  key={editingAddon.id}
                  addon={editingAddon}
                  onRequestPermanentDelete={(addon) =>
                    openPermanentDeleteDialog({
                      type: "addon",
                      id: addon.id,
                      name: addon.name,
                    })
                  }
                />
              </div>
            ) : null}

            <div className="grid gap-3 md:hidden">
              <div className="grid gap-2 rounded-[1rem] border border-[#1D1D1D] bg-[#080808] p-3">
                <Input
                  value={mobileAddonSearch}
                  onChange={(event) => {
                    setMobileAddonSearch(event.target.value);
                    setMobileAddonVisibleCount(6);
                  }}
                  placeholder={tAdmin("packages_mobile_search_addons_placeholder")}
                  className="min-h-10 border-[#2A2A2A] bg-[#0E0E0E] text-white"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobileAddonStatus("all");
                      setMobileAddonVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobileAddonStatus === "all"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_all")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobileAddonStatus("active");
                      setMobileAddonVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobileAddonStatus === "active"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_active")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMobileAddonStatus("inactive");
                      setMobileAddonVisibleCount(6);
                    }}
                    className={`min-h-9 rounded-full text-xs ${
                      mobileAddonStatus === "inactive"
                        ? "bg-[#007eff] text-white hover:bg-[#0068d8]"
                        : "bg-[#131313] text-[#D0D0D0] hover:bg-[#1A1A1A]"
                    }`}
                  >
                    {tAdmin("packages_mobile_filter_inactive")}
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowMobileAddonCreate((previous) => !previous)}
                className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
              >
                <Plus className="size-4" aria-hidden="true" />
                {showMobileAddonCreate
                  ? tAdmin("packages_table_action_close_create")
                  : tAdmin("packages_addon_action_create")}
              </Button>
              {showMobileAddonCreate ? <AddonCreateForm /> : null}
              {addonsQuery.isError ? null : mobileFilteredAddons.length === 0 ? (
                <SectionReady label={tAdmin("packages_addons_empty")} />
              ) : (
                mobileVisibleAddons.map((addon) => (
                  <AddonRow
                    key={addon.id}
                    addon={addon}
                    onRequestPermanentDelete={(item) =>
                      openPermanentDeleteDialog({
                        type: "addon",
                        id: item.id,
                        name: item.name,
                      })
                    }
                  />
                ))
              )}
              {hasMoreMobileAddons ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMobileAddonVisibleCount((previous) => previous + 6)}
                  className="min-h-10 rounded-full border-[#2A2A2A] bg-[#101010] px-4 font-sans text-sm text-white hover:bg-[#171717]"
                >
                  {tAdmin("packages_mobile_load_more")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={Boolean(permanentDeleteTarget)}
        onOpenChange={(open) => (!open ? closePermanentDeleteDialog() : null)}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0B0B0B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{tAdmin("packages_delete_permanent_dialog_title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#B8B8B8]">
              {permanentDeleteTarget?.type === "category"
                ? tAdmin("packages_delete_permanent_category_description")
                : permanentDeleteTarget?.type === "package"
                  ? tAdmin("packages_delete_permanent_package_description")
                  : tAdmin("packages_delete_permanent_addon_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {permanentDeleteTarget ? (
            <p className="font-sans text-xs text-[#9A9A9A]">
              {tAdmin("packages_delete_permanent_dialog_target", {
                name: permanentDeleteTarget.name,
              })}
            </p>
          ) : null}

          <div className="grid gap-2">
            <label
              htmlFor="packages-permanent-delete-confirm"
              className="font-sans text-xs text-[#CFCFCF]"
            >
              {tAdmin("packages_delete_permanent_dialog_confirm_label")}
            </label>
            <Input
              id="packages-permanent-delete-confirm"
              value={permanentDeleteConfirmText}
              onChange={(event) => setPermanentDeleteConfirmText(event.target.value)}
              placeholder={tAdmin("packages_delete_permanent_dialog_confirm_placeholder")}
              className="border-[#2A2A2A] bg-[#111111] text-white"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPermanentDeletePending}>
              {tAdmin("packages_delete_permanent_dialog_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPermanentDeletePending || permanentDeleteConfirmText.trim() !== "DELETE"}
              onClick={(event) => {
                event.preventDefault();
                void submitPermanentDelete();
              }}
            >
              {isPermanentDeletePending
                ? tAdmin("packages_delete_permanent_dialog_pending")
                : tAdmin("packages_delete_permanent_dialog_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
