"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertCircle,
  ArrowUpDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminResourceCategories,
  useAdminResourceCoverUploadMutation,
  useAdminResourceDetail,
  useAdminResourceSlugAvailability,
  useAdminResources,
  useCreateAdminResourceCategoryMutation,
  useCreateAdminResourceMutation,
  useDeleteAdminResourceCategoryMutation,
  useDeleteAdminResourceMutation,
  useReorderAdminResourceCategoryMutation,
  useToggleAdminResourceCategoryActiveMutation,
  useToggleAdminResourcePublishedMutation,
  useUpdateAdminResourceCategoryMutation,
  useUpdateAdminResourceMutation,
} from "@/hooks/useAdminResources";
import {
  ADMIN_RESOURCE_COVER_MAX_BYTES,
  validateAdminResourceCoverFile,
} from "@/lib/api/admin-resources";

type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type ArticleFormState = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  categoryId: string;
  isPublished: boolean;
  coverImageUrl: string;
};

type CategoryEditState = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type ArticleEditState = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  categoryId: string;
  isPublished: boolean;
};

const INITIAL_CATEGORY_FORM: CategoryFormState = {
  name: "",
  slug: "",
  description: "",
  sortOrder: "0",
  isActive: true,
};

const INITIAL_ARTICLE_FORM: ArticleFormState = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  categoryId: "",
  isPublished: false,
  coverImageUrl: "",
};

const RESOURCE_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_RESOURCE_PAGE_SIZE = 20;
const RESOURCE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ResourceRichTextEditor = dynamic(
  () =>
    import("@/components/admin/resources/resource-rich-text-editor").then(
      (mod) => mod.ResourceRichTextEditor
    ),
  {
    ssr: false,
    loading: () => <div className="h-56 w-full animate-pulse rounded-md bg-white/10" />,
  }
);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function isValidResourceSlug(slug: string): boolean {
  return RESOURCE_SLUG_PATTERN.test(slug.trim());
}

function getCategoryStatusPillClass(isActive: boolean): string {
  return isActive
    ? "rounded-full border border-[#1E5F31] bg-[#0A1B11] px-2.5 py-1 font-sans text-[11px] text-[#7DE29B]"
    : "rounded-full border border-[#5F5F5F] bg-[#1A1A1A] px-2.5 py-1 font-sans text-[11px] text-[#C8C8C8]";
}

function toCategoryEditState(params: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}): CategoryEditState {
  return {
    id: params.id,
    name: params.name,
    slug: params.slug,
    description: params.description ?? "",
    sortOrder: String(params.sortOrder),
    isActive: params.isActive,
  };
}

function renderResourcesSortableHeader(label: string) {
  return (
    <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium tracking-[0.08em] text-[#BDBDBD] uppercase">
      {label}
      <ArrowUpDown className="size-3 text-[#8F8F8F]" aria-hidden="true" />
    </span>
  );
}

export function AdminResourcesWorkspaceView() {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [resourceSearch, setResourceSearch] = useState(() => searchParams.get("q") ?? "");
  const [resourceCategoryFilter, setResourceCategoryFilter] = useState(
    () => searchParams.get("category") ?? ""
  );
  const [resourcePublishedFilter, setResourcePublishedFilter] = useState<"all" | "true" | "false">(
    () => {
      const published = searchParams.get("published");
      return published === "true" || published === "false" ? published : "all";
    }
  );
  const [resourcesPageSize, setResourcesPageSize] = useState<number>(() => {
    const parsed = Number.parseInt(searchParams.get("limit") ?? "", 10);
    return RESOURCE_PAGE_SIZE_OPTIONS.includes(
      parsed as (typeof RESOURCE_PAGE_SIZE_OPTIONS)[number]
    )
      ? parsed
      : DEFAULT_RESOURCE_PAGE_SIZE;
  });
  const [resourcesCursor, setResourcesCursor] = useState<string | undefined>(undefined);
  const [resourcesPageCursors, setResourcesPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [resourcesPageIndex, setResourcesPageIndex] = useState(0);
  const [articleEditResourceId, setArticleEditResourceId] = useState<string | null>(null);
  const [articleEditState, setArticleEditState] = useState<ArticleEditState | null>(null);
  const [articleEditError, setArticleEditError] = useState<string | null>(null);
  const [articleEditSlugManuallyEdited, setArticleEditSlugManuallyEdited] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [articleDeleteError, setArticleDeleteError] = useState<string | null>(null);

  const deferredResourceSearch = useDeferredValue(resourceSearch);
  const resourceFilterSignature = `${deferredResourceSearch}::${resourceCategoryFilter}::${resourcePublishedFilter}::${resourcesPageSize}`;
  const previousResourceFilterSignatureRef = useRef(resourceFilterSignature);

  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(INITIAL_CATEGORY_FORM);
  const [articleForm, setArticleForm] = useState<ArticleFormState>(INITIAL_ARTICLE_FORM);
  const [articleSlugManuallyEdited, setArticleSlugManuallyEdited] = useState(false);
  const [categoryEditState, setCategoryEditState] = useState<CategoryEditState | null>(null);
  const [categoryEditError, setCategoryEditError] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string;
    name: string;
    articleCount: number;
  } | null>(null);
  const [categoryDeleteError, setCategoryDeleteError] = useState<string | null>(null);
  const [categorySortDrafts, setCategorySortDrafts] = useState<Record<string, string>>({});
  const [categorySortSavingById, setCategorySortSavingById] = useState<Record<string, boolean>>({});
  const [categoryStatusSavingById, setCategoryStatusSavingById] = useState<Record<string, boolean>>(
    {}
  );

  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [articleFormError, setArticleFormError] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastCreateCoverFile, setLastCreateCoverFile] = useState<File | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [editUploadProgress, setEditUploadProgress] = useState(0);
  const [editUploadError, setEditUploadError] = useState<string | null>(null);
  const [lastEditCoverFile, setLastEditCoverFile] = useState<File | null>(null);
  const editUploadAbortRef = useRef<AbortController | null>(null);
  const categoryEditNameRef = useRef<HTMLInputElement | null>(null);
  const articleEditTitleRef = useRef<HTMLInputElement | null>(null);
  const deferredCreateSlug = useDeferredValue(articleForm.slug);
  const deferredEditSlug = useDeferredValue(articleEditState?.slug ?? "");

  const categoriesQuery = useAdminResourceCategories();
  const resourcesQuery = useAdminResources({
    cursor: resourcesCursor,
    limit: resourcesPageSize,
    q: deferredResourceSearch || undefined,
    categoryId: resourceCategoryFilter || undefined,
    isPublished: resourcePublishedFilter === "all" ? undefined : resourcePublishedFilter === "true",
  });
  const articleDetailQuery = useAdminResourceDetail(
    articleEditResourceId ?? "",
    articleEditResourceId !== null
  );
  const createSlugAvailabilityQuery = useAdminResourceSlugAvailability(
    {
      slug: deferredCreateSlug,
    },
    deferredCreateSlug.trim().length > 0 && isValidResourceSlug(deferredCreateSlug)
  );
  const editSlugAvailabilityQuery = useAdminResourceSlugAvailability(
    {
      slug: deferredEditSlug,
      excludeId: articleEditState?.id,
    },
    articleEditState !== null &&
      deferredEditSlug.trim().length > 0 &&
      isValidResourceSlug(deferredEditSlug)
  );

  useEffect(() => {
    const detail = articleDetailQuery.data;
    if (!detail || articleEditResourceId === null || detail.id !== articleEditResourceId) {
      return;
    }

    setArticleEditState({
      id: detail.id,
      title: detail.title,
      slug: detail.slug,
      excerpt: detail.excerpt ?? "",
      content: detail.content,
      coverImageUrl: detail.coverImageUrl ?? "",
      categoryId: detail.categoryId ?? "",
      isPublished: detail.isPublished,
    });
    setArticleEditSlugManuallyEdited(false);
  }, [articleDetailQuery.data, articleEditResourceId]);

  const createCategoryMutation = useCreateAdminResourceCategoryMutation();
  const updateCategoryMutation = useUpdateAdminResourceCategoryMutation();
  const deleteCategoryMutation = useDeleteAdminResourceCategoryMutation();
  const reorderCategoryMutation = useReorderAdminResourceCategoryMutation();
  const toggleCategoryActiveMutation = useToggleAdminResourceCategoryActiveMutation();

  const createResourceMutation = useCreateAdminResourceMutation();
  const updateResourceMutation = useUpdateAdminResourceMutation();
  const deleteResourceMutation = useDeleteAdminResourceMutation();
  const togglePublishedMutation = useToggleAdminResourcePublishedMutation();

  const coverUploadMutation = useAdminResourceCoverUploadMutation();

  const categories = categoriesQuery.categories;
  const resources = resourcesQuery.items;
  const currentResourcesPage = resourcesPageIndex + 1;
  const hasPreviousResourcesPage = resourcesPageIndex > 0;
  const hasNextResourcesPage = resourcesQuery.hasMore && Boolean(resourcesQuery.nextCursor);

  const articleColumnHelper = createColumnHelper<(typeof resources)[number]>();

  const allFailed = categoriesQuery.isError && resourcesQuery.isError;

  const categoryOptions = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories]
  );
  const isCreateCoverUploading = coverUploadMutation.isPending && uploadAbortRef.current !== null;
  const isEditCoverUploading = coverUploadMutation.isPending && editUploadAbortRef.current !== null;

  const openArticleEdit = useCallback((resourceId: string) => {
    setArticleEditError(null);
    setArticleEditState(null);
    setArticleEditResourceId(resourceId);
  }, []);

  const openDeleteArticleDialog = useCallback((resource: { id: string; title: string }) => {
    setArticleDeleteError(null);
    setArticleToDelete({ id: resource.id, title: resource.title });
  }, []);

  const openPublicPreview = useCallback(
    (slug: string) => {
      const publicPath = locale === "en" ? `/resources/${slug}` : `/${locale}/resources/${slug}`;
      window.open(publicPath, "_blank", "noopener,noreferrer");
    },
    [locale]
  );

  const onCreateContentChange = useCallback((nextValue: string) => {
    setArticleForm((previous) => ({ ...previous, content: nextValue }));
  }, []);

  const onEditContentChange = useCallback((nextValue: string) => {
    setArticleEditState((previous) =>
      previous
        ? {
            ...previous,
            content: nextValue,
          }
        : previous
    );
  }, []);

  const richTextLabels = useMemo(
    () => ({
      paragraph: tAdmin("resources_article_toolbar_paragraph"),
      heading2: tAdmin("resources_article_toolbar_h2"),
      heading3: tAdmin("resources_article_toolbar_h3"),
      bold: tAdmin("resources_article_toolbar_bold"),
      italic: tAdmin("resources_article_toolbar_italic"),
      underline: tAdmin("resources_article_toolbar_underline"),
      bulletList: tAdmin("resources_article_toolbar_bullet_list"),
      orderedList: tAdmin("resources_article_toolbar_ordered_list"),
      blockquote: tAdmin("resources_article_toolbar_quote"),
      code: tAdmin("resources_article_toolbar_code"),
      link: tAdmin("resources_article_toolbar_link"),
      clear: tAdmin("resources_article_toolbar_clear"),
      alignLeft: tAdmin("resources_article_toolbar_align_left"),
      alignCenter: tAdmin("resources_article_toolbar_align_center"),
      alignRight: tAdmin("resources_article_toolbar_align_right"),
      image: tAdmin("resources_article_toolbar_image"),
      undo: tAdmin("resources_article_toolbar_undo"),
      redo: tAdmin("resources_article_toolbar_redo"),
      linkPrompt: tAdmin("resources_article_toolbar_link_prompt"),
      imagePrompt: tAdmin("resources_article_toolbar_image_prompt"),
      imageAltPrompt: tAdmin("resources_article_toolbar_image_alt_prompt"),
      shortcutHint: tAdmin("resources_article_toolbar_shortcut_hint"),
      slashEmpty: tAdmin("resources_article_slash_empty"),
      slashParagraphDescription: tAdmin("resources_article_slash_paragraph_description"),
      slashHeading2Description: tAdmin("resources_article_slash_h2_description"),
      slashHeading3Description: tAdmin("resources_article_slash_h3_description"),
      slashBulletListDescription: tAdmin("resources_article_slash_bullet_list_description"),
      slashOrderedListDescription: tAdmin("resources_article_slash_ordered_list_description"),
      slashBlockquoteDescription: tAdmin("resources_article_slash_quote_description"),
      slashCodeDescription: tAdmin("resources_article_slash_code_description"),
      slashImageDescription: tAdmin("resources_article_slash_image_description"),
      imageControls: tAdmin("resources_article_image_controls"),
      imageWidth: tAdmin("resources_article_image_width"),
    }),
    [tAdmin]
  );

  const handleTogglePublished = useCallback(
    async (resourceId: string, isPublished: boolean) => {
      try {
        await togglePublishedMutation.mutateAsync({
          resourceId,
          isPublished,
        });
        toast.success(
          isPublished
            ? tAdmin("resources_article_toast_published")
            : tAdmin("resources_article_toast_unpublished")
        );
      } catch (error) {
        toast.error(getErrorMessage(error, tAdmin("resources_article_toast_update_failed")));
      }
    },
    [togglePublishedMutation, tAdmin]
  );

  const articleColumns = useMemo(
    () => [
      articleColumnHelper.accessor("title", {
        header: () => renderResourcesSortableHeader(tAdmin("resources_articles_table_title")),
        cell: (info) => (
          <p className="max-w-[22rem] truncate font-sans text-sm font-semibold text-white">
            {info.getValue()}
          </p>
        ),
      }),
      articleColumnHelper.accessor("slug", {
        header: () => renderResourcesSortableHeader(tAdmin("resources_articles_table_slug")),
        cell: (info) => (
          <span className="font-sans text-xs text-[#A1A1AA]">/{info.getValue()}</span>
        ),
      }),
      articleColumnHelper.display({
        id: "category",
        header: () => renderResourcesSortableHeader(tAdmin("resources_articles_table_category")),
        cell: (info) => (
          <span className="font-sans text-xs text-[#A1A1AA]">
            {info.row.original.category?.name || tAdmin("resources_article_uncategorized")}
          </span>
        ),
      }),
      articleColumnHelper.accessor("isPublished", {
        header: () =>
          renderResourcesSortableHeader(tAdmin("resources_articles_table_publication_state")),
        cell: (info) => (
          <span
            className={
              info.getValue()
                ? "rounded-full border border-[#1E5F31] bg-[#0A1B11] px-2.5 py-1 font-sans text-[11px] text-[#7DE29B]"
                : "rounded-full border border-[#5F5F5F] bg-[#1A1A1A] px-2.5 py-1 font-sans text-[11px] text-[#C8C8C8]"
            }
          >
            {info.getValue()
              ? tAdmin("resources_filter_published")
              : tAdmin("resources_filter_draft")}
          </span>
        ),
      }),
      articleColumnHelper.accessor("updatedAt", {
        header: () =>
          renderResourcesSortableHeader(tAdmin("resources_articles_table_updated_date")),
        cell: (info) => {
          const updated = new Date(info.getValue());
          return (
            <span className="font-sans text-xs text-[#A1A1AA]">
              {Number.isNaN(updated.getTime())
                ? info.getValue()
                : updated.toLocaleDateString(locale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
            </span>
          );
        },
      }),
      articleColumnHelper.display({
        id: "actions",
        header: () => (
          <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[#BDBDBD] uppercase">
            {tAdmin("resources_articles_table_actions")}
          </span>
        ),
        cell: (info) => {
          const resource = info.row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="size-11 rounded-full border-[#2A2A2A] bg-[#000000] p-0 text-white hover:border-[#007eff] hover:bg-[#101010] md:size-9"
                  aria-label={tAdmin("resources_articles_actions_open_menu")}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 rounded-2xl border-[#2A2A2A] bg-[#111111] p-1.5 text-white"
              >
                <DropdownMenuItem
                  className="min-h-11 rounded-xl font-sans text-sm"
                  onClick={() => openArticleEdit(resource.id)}
                >
                  {tAdmin("resources_article_action_edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 rounded-xl font-sans text-sm"
                  onClick={() => {
                    void handleTogglePublished(resource.id, !resource.isPublished);
                  }}
                >
                  {resource.isPublished
                    ? tAdmin("resources_article_action_unpublish")
                    : tAdmin("resources_article_action_publish")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 rounded-xl font-sans text-sm"
                  onClick={() => openPublicPreview(resource.slug)}
                >
                  {tAdmin("resources_article_action_preview")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 rounded-xl font-sans text-sm text-[#FFB3B3] focus:text-[#FFB3B3]"
                  onClick={() => openDeleteArticleDialog(resource)}
                >
                  {tAdmin("resources_article_action_delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [
      articleColumnHelper,
      locale,
      openArticleEdit,
      openDeleteArticleDialog,
      openPublicPreview,
      handleTogglePublished,
      tAdmin,
    ]
  );

  const articleTable = useReactTable({
    data: resources,
    columns: articleColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    setCategorySortDrafts((previous) => {
      const next: Record<string, string> = {};

      for (const category of categories) {
        next[category.id] = previous[category.id] ?? String(category.sortOrder);
      }

      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (previousKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (previous[key] !== next[key]) {
          return next;
        }
      }

      return previous;
    });
  }, [categories]);

  useEffect(() => {
    const currentQueryString = searchParams.toString();
    const params = new URLSearchParams(currentQueryString);

    if (resourceSearch.trim().length > 0) {
      params.set("q", resourceSearch.trim());
    } else {
      params.delete("q");
    }

    if (resourceCategoryFilter.trim().length > 0) {
      params.set("category", resourceCategoryFilter.trim());
    } else {
      params.delete("category");
    }

    if (resourcePublishedFilter !== "all") {
      params.set("published", resourcePublishedFilter);
    } else {
      params.delete("published");
    }

    if (resourcesPageSize !== DEFAULT_RESOURCE_PAGE_SIZE) {
      params.set("limit", String(resourcesPageSize));
    } else {
      params.delete("limit");
    }

    const nextQueryString = params.toString();
    if (nextQueryString === currentQueryString) {
      return;
    }

    router.replace(nextQueryString.length > 0 ? `${pathname}?${nextQueryString}` : pathname, {
      scroll: false,
    });
  }, [
    pathname,
    resourceCategoryFilter,
    resourcePublishedFilter,
    resourceSearch,
    resourcesPageSize,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (previousResourceFilterSignatureRef.current === resourceFilterSignature) {
      return;
    }

    previousResourceFilterSignatureRef.current = resourceFilterSignature;
    setResourcesCursor(undefined);
    setResourcesPageCursors([undefined]);
    setResourcesPageIndex(0);
  }, [resourceFilterSignature]);

  function handleCreateTitleChange(value: string) {
    setArticleForm((previous) => ({
      ...previous,
      title: value,
      slug: articleSlugManuallyEdited ? previous.slug : normalizeSlug(value),
    }));
  }

  function handleCreateSlugChange(value: string) {
    setArticleSlugManuallyEdited(true);
    setArticleForm((previous) => ({
      ...previous,
      slug: normalizeSlug(value),
    }));
  }

  function handleEditTitleChange(value: string) {
    setArticleEditState((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        title: value,
        slug: articleEditSlugManuallyEdited ? previous.slug : normalizeSlug(value),
      };
    });
  }

  function handleEditSlugChange(value: string) {
    setArticleEditSlugManuallyEdited(true);
    setArticleEditState((previous) =>
      previous
        ? {
            ...previous,
            slug: normalizeSlug(value),
          }
        : previous
    );
  }

  async function handleCreateCategory() {
    setCategoryFormError(null);

    const name = categoryForm.name.trim();
    const slug = normalizeSlug(categoryForm.slug || categoryForm.name);
    const sortOrder = Number.parseInt(categoryForm.sortOrder, 10);

    if (!name) {
      setCategoryFormError(tAdmin("resources_category_validation_name_required"));
      return;
    }

    if (!slug) {
      setCategoryFormError(tAdmin("resources_category_validation_slug_required"));
      return;
    }

    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      setCategoryFormError(tAdmin("resources_category_validation_sort_order_required"));
      return;
    }

    try {
      await createCategoryMutation.mutateAsync({
        name,
        slug,
        description: categoryForm.description.trim() || null,
        sortOrder,
        isActive: categoryForm.isActive,
      });

      setCategoryForm(INITIAL_CATEGORY_FORM);
      toast.success(tAdmin("resources_category_toast_created"));
    } catch (error) {
      setCategoryFormError(
        getErrorMessage(error, tAdmin("resources_category_toast_create_failed"))
      );
    }
  }

  function openCategoryEditDialog(category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
  }) {
    setCategoryEditState(toCategoryEditState(category));
    setCategoryEditError(null);
  }

  async function handleSaveCategoryEdit() {
    if (!categoryEditState) {
      return;
    }

    setCategoryEditError(null);

    const name = categoryEditState.name.trim();
    const slug = normalizeSlug(categoryEditState.slug || categoryEditState.name);
    const sortOrder = Number.parseInt(categoryEditState.sortOrder, 10);

    if (!name) {
      setCategoryEditError(tAdmin("resources_category_validation_name_required"));
      return;
    }

    if (!slug) {
      setCategoryEditError(tAdmin("resources_category_validation_slug_required"));
      return;
    }

    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      setCategoryEditError(tAdmin("resources_category_validation_sort_order_required"));
      return;
    }

    try {
      await updateCategoryMutation.mutateAsync({
        categoryId: categoryEditState.id,
        input: {
          name,
          slug,
          description: categoryEditState.description.trim() || null,
          sortOrder,
          isActive: categoryEditState.isActive,
        },
      });

      setCategoryEditState(null);
      toast.success(tAdmin("resources_category_toast_updated"));
    } catch (error) {
      setCategoryEditError(
        getErrorMessage(error, tAdmin("resources_category_toast_update_failed"))
      );
    }
  }

  async function handleDeleteCategoryWithDialog(categoryId: string) {
    try {
      await deleteCategoryMutation.mutateAsync(categoryId);
      toast.success(tAdmin("resources_category_toast_deleted"));
      setCategoryToDelete(null);
      setCategoryDeleteError(null);
    } catch (error) {
      setCategoryDeleteError(
        getErrorMessage(error, tAdmin("resources_category_toast_delete_failed"))
      );
    }
  }

  async function commitCategorySortOrder(category: { id: string; sortOrder: number }) {
    const rawDraft = categorySortDrafts[category.id] ?? String(category.sortOrder);
    const parsedSortOrder = Number.parseInt(rawDraft, 10);

    if (!Number.isFinite(parsedSortOrder) || parsedSortOrder < 0) {
      toast.error(tAdmin("resources_category_validation_sort_order_required"));
      setCategorySortDrafts((previous) => ({
        ...previous,
        [category.id]: String(category.sortOrder),
      }));
      return;
    }

    if (parsedSortOrder === category.sortOrder) {
      setCategorySortDrafts((previous) => ({
        ...previous,
        [category.id]: String(parsedSortOrder),
      }));
      return;
    }

    setCategorySortSavingById((previous) => ({ ...previous, [category.id]: true }));

    try {
      await reorderCategoryMutation.mutateAsync({
        categoryId: category.id,
        sortOrder: parsedSortOrder,
      });

      toast.success(tAdmin("resources_category_toast_sort_updated"));
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("resources_category_toast_update_failed")));
      setCategorySortDrafts((previous) => ({
        ...previous,
        [category.id]: String(category.sortOrder),
      }));
    } finally {
      setCategorySortSavingById((previous) => ({
        ...previous,
        [category.id]: false,
      }));
    }
  }

  async function handleToggleCategoryActive(category: { id: string; isActive: boolean }) {
    const nextIsActive = !category.isActive;

    setCategoryStatusSavingById((previous) => ({ ...previous, [category.id]: true }));

    try {
      await toggleCategoryActiveMutation.mutateAsync({
        categoryId: category.id,
        isActive: nextIsActive,
      });

      toast.success(
        nextIsActive
          ? tAdmin("resources_category_toast_activated")
          : tAdmin("resources_category_toast_deactivated")
      );
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("resources_category_toast_update_failed")));
    } finally {
      setCategoryStatusSavingById((previous) => ({
        ...previous,
        [category.id]: false,
      }));
    }
  }

  async function handleUploadCover(file: File | null) {
    setUploadError(null);

    if (!file) {
      return;
    }

    setLastCreateCoverFile(file);

    const validation = validateAdminResourceCoverFile(file);
    if (validation === "unsupported") {
      setUploadError(tAdmin("resources_cover_validation_unsupported"));
      return;
    }

    if (validation === "empty") {
      setUploadError(tAdmin("resources_cover_validation_empty"));
      return;
    }

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadProgress(0);

    try {
      const result = await coverUploadMutation.mutateAsync({
        file,
        signal: controller.signal,
        onProgress: (percentage) => setUploadProgress(percentage),
      });

      setArticleForm((previous) => ({
        ...previous,
        coverImageUrl: result.coverImageUrl,
      }));
      setUploadProgress(100);
      toast.success(tAdmin("resources_cover_toast_uploaded"));
    } catch (error) {
      setUploadError(getErrorMessage(error, tAdmin("resources_cover_toast_upload_failed")));
    } finally {
      uploadAbortRef.current = null;
    }
  }

  async function handleUploadCoverForEdit(file: File | null) {
    setEditUploadError(null);

    if (!file) {
      return;
    }

    setLastEditCoverFile(file);

    const validation = validateAdminResourceCoverFile(file);
    if (validation === "unsupported") {
      setEditUploadError(tAdmin("resources_cover_validation_unsupported"));
      return;
    }

    if (validation === "empty") {
      setEditUploadError(tAdmin("resources_cover_validation_empty"));
      return;
    }

    editUploadAbortRef.current?.abort();
    const controller = new AbortController();
    editUploadAbortRef.current = controller;
    setEditUploadProgress(0);

    try {
      const result = await coverUploadMutation.mutateAsync({
        file,
        signal: controller.signal,
        onProgress: (percentage) => setEditUploadProgress(percentage),
      });

      setArticleEditState((previous) =>
        previous
          ? {
              ...previous,
              coverImageUrl: result.coverImageUrl,
            }
          : previous
      );
      setEditUploadProgress(100);
      toast.success(tAdmin("resources_cover_toast_uploaded"));
    } catch (error) {
      setEditUploadError(getErrorMessage(error, tAdmin("resources_cover_toast_upload_failed")));
    } finally {
      editUploadAbortRef.current = null;
    }
  }

  function cancelUpload() {
    uploadAbortRef.current?.abort();
  }

  function cancelEditUpload() {
    editUploadAbortRef.current?.abort();
  }

  function retryCreateCoverUpload() {
    if (!lastCreateCoverFile || isCreateCoverUploading) {
      return;
    }

    void handleUploadCover(lastCreateCoverFile);
  }

  function retryEditCoverUpload() {
    if (!lastEditCoverFile || isEditCoverUploading) {
      return;
    }

    void handleUploadCoverForEdit(lastEditCoverFile);
  }

  async function handleCreateResource() {
    setArticleFormError(null);

    const title = articleForm.title.trim();
    const slug = normalizeSlug(articleForm.slug || articleForm.title);
    const content = articleForm.content.trim();

    if (!title) {
      setArticleFormError(tAdmin("resources_article_validation_title_required"));
      return;
    }

    if (!slug) {
      setArticleFormError(tAdmin("resources_article_validation_slug_required"));
      return;
    }

    if (!isValidResourceSlug(slug)) {
      setArticleFormError(tAdmin("resources_article_validation_slug_invalid"));
      return;
    }

    if (
      createSlugAvailabilityQuery.isAvailable === false &&
      createSlugAvailabilityQuery.data?.slug === slug
    ) {
      setArticleFormError(tAdmin("resources_article_validation_slug_unavailable"));
      return;
    }

    if (!content) {
      setArticleFormError(tAdmin("resources_article_validation_content_required"));
      return;
    }

    try {
      await createResourceMutation.mutateAsync({
        title,
        slug,
        excerpt: articleForm.excerpt.trim() || null,
        content,
        coverImageUrl: articleForm.coverImageUrl.trim() || null,
        categoryId: articleForm.categoryId || null,
        isPublished: articleForm.isPublished,
      });

      setArticleForm(INITIAL_ARTICLE_FORM);
      setArticleSlugManuallyEdited(false);
      setUploadProgress(0);
      setUploadError(null);
      setLastCreateCoverFile(null);
      toast.success(tAdmin("resources_article_toast_created"));
    } catch (error) {
      setArticleFormError(getErrorMessage(error, tAdmin("resources_article_toast_create_failed")));
    }
  }

  function goToFirstResourcesPage() {
    setResourcesCursor(undefined);
    setResourcesPageCursors([undefined]);
    setResourcesPageIndex(0);
  }

  function goToPreviousResourcesPage() {
    if (!hasPreviousResourcesPage) {
      return;
    }

    const previousIndex = resourcesPageIndex - 1;
    const previousCursor = resourcesPageCursors[previousIndex];

    setResourcesPageIndex(previousIndex);
    setResourcesCursor(previousCursor);
  }

  function goToNextResourcesPage() {
    if (!resourcesQuery.nextCursor || !resourcesQuery.hasMore) {
      return;
    }

    const nextCursor = resourcesQuery.nextCursor ?? undefined;
    const nextIndex = resourcesPageIndex + 1;
    setResourcesPageCursors((previous) => {
      if (previous[nextIndex] === nextCursor) {
        return previous;
      }

      const next = previous.slice(0, nextIndex);
      next[nextIndex] = nextCursor;
      return next;
    });
    setResourcesPageIndex(nextIndex);
    setResourcesCursor(nextCursor);
  }

  async function handleSaveArticleEdit() {
    if (!articleEditState) {
      return;
    }

    setArticleEditError(null);

    const title = articleEditState.title.trim();
    const slug = normalizeSlug(articleEditState.slug || articleEditState.title);
    const content = articleEditState.content.trim();

    if (!title) {
      setArticleEditError(tAdmin("resources_article_validation_title_required"));
      return;
    }

    if (!slug) {
      setArticleEditError(tAdmin("resources_article_validation_slug_required"));
      return;
    }

    if (!isValidResourceSlug(slug)) {
      setArticleEditError(tAdmin("resources_article_validation_slug_invalid"));
      return;
    }

    if (
      editSlugAvailabilityQuery.isAvailable === false &&
      editSlugAvailabilityQuery.data?.slug === slug
    ) {
      setArticleEditError(tAdmin("resources_article_validation_slug_unavailable"));
      return;
    }

    if (!content) {
      setArticleEditError(tAdmin("resources_article_validation_content_required"));
      return;
    }

    try {
      await updateResourceMutation.mutateAsync({
        resourceId: articleEditState.id,
        input: {
          title,
          slug,
          excerpt: articleEditState.excerpt.trim() || null,
          content,
          coverImageUrl: articleEditState.coverImageUrl.trim() || null,
          categoryId: articleEditState.categoryId || null,
          isPublished: articleEditState.isPublished,
        },
      });

      setArticleEditResourceId(null);
      setArticleEditState(null);
      setArticleEditSlugManuallyEdited(false);
      setEditUploadError(null);
      setEditUploadProgress(0);
      setLastEditCoverFile(null);
      editUploadAbortRef.current?.abort();
      toast.success(tAdmin("resources_article_toast_updated"));
    } catch (error) {
      setArticleEditError(getErrorMessage(error, tAdmin("resources_article_toast_update_failed")));
    }
  }

  async function handleDeleteArticleWithDialog() {
    if (!articleToDelete) {
      return;
    }

    setArticleDeleteError(null);

    try {
      await deleteResourceMutation.mutateAsync(articleToDelete.id);
      toast.success(tAdmin("resources_article_toast_deleted"));
      setArticleToDelete(null);
    } catch (error) {
      setArticleDeleteError(
        getErrorMessage(error, tAdmin("resources_article_toast_delete_failed"))
      );
    }
  }

  if (allFailed) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-[#EF4444]/40 bg-[#1C0D0D] p-5 text-[#FCA5A5]">
          <p className="font-sans text-sm font-semibold">{tAdmin("resources_page_error_title")}</p>
          <p className="mt-2 font-sans text-sm text-[#FECACA]">
            {tAdmin("resources_page_error_description")}
          </p>
          <Button
            type="button"
            onClick={() => {
              void categoriesQuery.refetch();
              void resourcesQuery.refetch();
            }}
            className="mt-4"
          >
            {tAdmin("resources_retry")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold text-white">{tAdmin("resources")}</h1>
        <p className="max-w-3xl font-sans text-sm text-[#A1A1AA]">
          {tAdmin("resources_workspace_description")}
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-[#111111] p-5 md:p-6">
        <div className="mb-5 space-y-1">
          <h2 className="font-display text-xl font-semibold text-white">
            {tAdmin("resources_categories_title")}
          </h2>
          <p className="font-sans text-sm text-[#A1A1AA]">
            {tAdmin("resources_categories_description")}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="resource-category-create-name">
              {tAdmin("resources_category_field_name")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="resource-category-create-name"
                aria-label={tAdmin("resources_category_field_name")}
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((previous) => ({ ...previous, name: event.target.value }))
                }
                placeholder={tAdmin("resources_category_field_name_placeholder")}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="resource-category-create-slug">
              {tAdmin("resources_category_field_slug")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="resource-category-create-slug"
                aria-label={tAdmin("resources_category_field_slug")}
                value={categoryForm.slug}
                onChange={(event) =>
                  setCategoryForm((previous) => ({ ...previous, slug: event.target.value }))
                }
                placeholder={tAdmin("resources_category_field_slug_placeholder")}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="resource-category-create-sort-order">
              {tAdmin("resources_category_field_sort_order")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="resource-category-create-sort-order"
                aria-label={tAdmin("resources_category_field_sort_order")}
                type="number"
                min={0}
                value={categoryForm.sortOrder}
                onChange={(event) =>
                  setCategoryForm((previous) => ({ ...previous, sortOrder: event.target.value }))
                }
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>{tAdmin("resources_category_field_active")}</FieldLabel>
            <FieldContent>
              <div className="flex h-10 items-center rounded-lg border border-white/10 px-3">
                <Switch
                  aria-label={tAdmin("resources_category_field_active")}
                  checked={categoryForm.isActive}
                  onCheckedChange={(checked) =>
                    setCategoryForm((previous) => ({ ...previous, isActive: checked }))
                  }
                />
              </div>
            </FieldContent>
          </Field>

          <Field className="md:col-span-2">
            <FieldLabel htmlFor="resource-category-create-description">
              {tAdmin("resources_category_field_description")}
            </FieldLabel>
            <FieldContent>
              <Textarea
                id="resource-category-create-description"
                aria-label={tAdmin("resources_category_field_description")}
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm((previous) => ({ ...previous, description: event.target.value }))
                }
                rows={3}
                placeholder={tAdmin("resources_category_field_description_placeholder")}
              />
            </FieldContent>
          </Field>
        </div>

        {categoryFormError ? <FieldError className="mt-3">{categoryFormError}</FieldError> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              void handleCreateCategory();
            }}
            disabled={createCategoryMutation.isPending}
          >
            {createCategoryMutation.isPending
              ? tAdmin("resources_category_action_creating")
              : tAdmin("resources_category_action_create")}
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          {categoriesQuery.isInitialLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : null}

          {categoriesQuery.isError ? (
            <div className="rounded-lg border border-[#EF4444]/40 bg-[#1C0D0D] p-4 text-[#FECACA]">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-sans text-sm font-semibold">
                    {tAdmin("resources_categories_error_title")}
                  </p>
                  <p className="mt-1 font-sans text-sm">
                    {tAdmin("resources_categories_error_description")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {!categoriesQuery.isInitialLoading &&
          !categoriesQuery.isError &&
          categories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/20 p-4 font-sans text-sm text-[#A1A1AA]">
              {tAdmin("resources_categories_empty")}
            </div>
          ) : null}

          {!categoriesQuery.isInitialLoading &&
          !categoriesQuery.isError &&
          categories.length > 0 ? (
            <div className="space-y-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="rounded-lg border border-white/10 bg-black/30 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-sans text-sm font-semibold text-white">
                          {category.name}
                        </p>
                        <span className={getCategoryStatusPillClass(category.isActive)}>
                          {category.isActive
                            ? tAdmin("resources_category_status_active")
                            : tAdmin("resources_category_status_inactive")}
                        </span>
                      </div>
                      <p className="font-sans text-xs text-[#A1A1AA]">
                        /{category.slug} • {category.articleCount}{" "}
                        {tAdmin("resources_category_article_count")}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-sm text-white hover:border-[#007eff] hover:bg-[#101010]"
                        onClick={() => openCategoryEditDialog(category)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {tAdmin("resources_category_action_edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setCategoryDeleteError(null);
                          setCategoryToDelete({
                            id: category.id,
                            name: category.name,
                            articleCount: category.articleCount,
                          });
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {tAdmin("resources_category_action_delete")}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Field>
                      <FieldLabel>{tAdmin("resources_category_field_sort_order")}</FieldLabel>
                      <FieldContent>
                        <Input
                          type="number"
                          min={0}
                          value={categorySortDrafts[category.id] ?? String(category.sortOrder)}
                          onChange={(event) =>
                            setCategorySortDrafts((previous) => ({
                              ...previous,
                              [category.id]: event.target.value,
                            }))
                          }
                          onBlur={() => {
                            void commitCategorySortOrder(category);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") {
                              return;
                            }

                            event.preventDefault();
                            void commitCategorySortOrder(category);
                          }}
                          disabled={categorySortSavingById[category.id] === true}
                        />
                        {categorySortSavingById[category.id] ? (
                          <p className="font-sans text-xs text-[#A1A1AA]">
                            {tAdmin("resources_category_sort_updating")}
                          </p>
                        ) : null}
                      </FieldContent>
                    </Field>

                    <Field>
                      <FieldLabel>{tAdmin("resources_category_field_active")}</FieldLabel>
                      <FieldContent>
                        <div className="flex h-10 items-center justify-between rounded-lg border border-white/10 px-3">
                          <span className="font-sans text-xs text-[#A1A1AA]">
                            {category.isActive
                              ? tAdmin("resources_category_status_active")
                              : tAdmin("resources_category_status_inactive")}
                          </span>
                          <Switch
                            checked={category.isActive}
                            onCheckedChange={() => {
                              void handleToggleCategoryActive(category);
                            }}
                            disabled={categoryStatusSavingById[category.id] === true}
                          />
                        </div>
                      </FieldContent>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <Dialog
        open={categoryEditState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryEditState(null);
            setCategoryEditError(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[95vh] overflow-y-auto rounded-[1.5rem] border border-[#1D1D1D] bg-[#0B0B0B] p-6 text-white sm:max-w-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            categoryEditNameRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white">
              {tAdmin("resources_category_edit_title")}
            </DialogTitle>
            <DialogDescription className="text-[#B4B4B4]">
              {tAdmin("resources_category_edit_description")}
            </DialogDescription>
          </DialogHeader>

          {categoryEditState ? (
            <div className="grid gap-3">
              <Field>
                <FieldLabel htmlFor="resource-category-edit-name">
                  {tAdmin("resources_category_field_name")}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="resource-category-edit-name"
                    ref={categoryEditNameRef}
                    aria-label={tAdmin("resources_category_field_name")}
                    value={categoryEditState.name}
                    onChange={(event) =>
                      setCategoryEditState((previous) =>
                        previous ? { ...previous, name: event.target.value } : previous
                      )
                    }
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="resource-category-edit-slug">
                  {tAdmin("resources_category_field_slug")}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="resource-category-edit-slug"
                    aria-label={tAdmin("resources_category_field_slug")}
                    value={categoryEditState.slug}
                    onChange={(event) =>
                      setCategoryEditState((previous) =>
                        previous ? { ...previous, slug: event.target.value } : previous
                      )
                    }
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="resource-category-edit-sort-order">
                  {tAdmin("resources_category_field_sort_order")}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="resource-category-edit-sort-order"
                    aria-label={tAdmin("resources_category_field_sort_order")}
                    type="number"
                    min={0}
                    value={categoryEditState.sortOrder}
                    onChange={(event) =>
                      setCategoryEditState((previous) =>
                        previous ? { ...previous, sortOrder: event.target.value } : previous
                      )
                    }
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("resources_category_field_active")}</FieldLabel>
                <FieldContent>
                  <div className="flex h-10 items-center rounded-lg border border-white/10 px-3">
                    <Switch
                      aria-label={tAdmin("resources_category_field_active")}
                      checked={categoryEditState.isActive}
                      onCheckedChange={(checked) =>
                        setCategoryEditState((previous) =>
                          previous ? { ...previous, isActive: checked } : previous
                        )
                      }
                    />
                  </div>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="resource-category-edit-description">
                  {tAdmin("resources_category_field_description")}
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    id="resource-category-edit-description"
                    aria-label={tAdmin("resources_category_field_description")}
                    rows={3}
                    value={categoryEditState.description}
                    onChange={(event) =>
                      setCategoryEditState((previous) =>
                        previous ? { ...previous, description: event.target.value } : previous
                      )
                    }
                  />
                </FieldContent>
              </Field>

              {categoryEditError ? <FieldError>{categoryEditError}</FieldError> : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#090909] px-5 font-sans text-sm text-white hover:bg-[#111111]"
              onClick={() => {
                setCategoryEditState(null);
                setCategoryEditError(null);
              }}
            >
              {tAdmin("resources_category_edit_cancel")}
            </Button>
            <Button
              type="button"
              className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white hover:bg-[#0f8aff]"
              onClick={() => {
                void handleSaveCategoryEdit();
              }}
              disabled={updateCategoryMutation.isPending}
            >
              {updateCategoryMutation.isPending
                ? tAdmin("resources_category_action_saving")
                : tAdmin("resources_category_action_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={categoryToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryToDelete(null);
            setCategoryDeleteError(null);
          }
        }}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0B0B0B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-white">
              {tAdmin("resources_category_delete_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm text-[#B4B4B4]">
              {categoryToDelete
                ? tAdmin("resources_category_delete_confirm_description", {
                    name: categoryToDelete.name,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {categoryDeleteError ? (
            <FieldError className="mt-1">{categoryDeleteError}</FieldError>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full border-[#2A2A2A] bg-[#090909] px-5 font-sans text-sm text-white hover:bg-[#111111]">
              {tAdmin("resources_category_delete_confirm_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11 rounded-full bg-[#7A1F1F] px-5 font-sans text-sm font-semibold text-white hover:bg-[#8A2A2A]"
              onClick={(event) => {
                event.preventDefault();

                if (!categoryToDelete || deleteCategoryMutation.isPending) {
                  return;
                }

                void handleDeleteCategoryWithDialog(categoryToDelete.id);
              }}
            >
              {deleteCategoryMutation.isPending
                ? tAdmin("resources_category_action_deleting")
                : tAdmin("resources_category_delete_confirm_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={articleEditResourceId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArticleEditResourceId(null);
            setArticleEditState(null);
            setArticleEditError(null);
            setArticleEditSlugManuallyEdited(false);
            setEditUploadError(null);
            setEditUploadProgress(0);
            setLastEditCoverFile(null);
            editUploadAbortRef.current?.abort();
          }
        }}
      >
        <DialogContent
          className="max-h-[95vh] overflow-y-auto rounded-[1.5rem] border border-[#1D1D1D] bg-[#0B0B0B] p-6 text-white sm:max-w-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            articleEditTitleRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white">
              {tAdmin("resources_article_edit_title")}
            </DialogTitle>
            <DialogDescription className="text-[#B4B4B4]">
              {tAdmin("resources_article_edit_description")}
            </DialogDescription>
          </DialogHeader>

          {articleDetailQuery.isInitialLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {articleDetailQuery.isError ? (
            <div className="rounded-lg border border-[#EF4444]/40 bg-[#1C0D0D] p-4 text-[#FECACA]">
              <p className="font-sans text-sm">{tAdmin("resources_article_detail_load_failed")}</p>
            </div>
          ) : null}

          {articleEditState ? (
            <div className="grid gap-3">
              <Field>
                <FieldLabel htmlFor="resource-article-edit-title">
                  {tAdmin("resources_article_field_title")}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="resource-article-edit-title"
                    ref={articleEditTitleRef}
                    aria-label={tAdmin("resources_article_field_title")}
                    value={articleEditState.title}
                    onChange={(event) => handleEditTitleChange(event.target.value)}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="resource-article-edit-slug">
                  {tAdmin("resources_article_field_slug")}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="resource-article-edit-slug"
                    aria-label={tAdmin("resources_article_field_slug")}
                    value={articleEditState.slug}
                    onChange={(event) => handleEditSlugChange(event.target.value)}
                  />
                </FieldContent>
                {articleEditState.slug.trim().length > 0 &&
                !isValidResourceSlug(articleEditState.slug) ? (
                  <FieldError>{tAdmin("resources_article_validation_slug_invalid")}</FieldError>
                ) : null}
                {articleEditState.slug.trim().length > 0 &&
                isValidResourceSlug(articleEditState.slug) ? (
                  <p className="font-sans text-xs text-[#A1A1AA]">
                    {editSlugAvailabilityQuery.isChecking
                      ? tAdmin("resources_article_slug_checking")
                      : editSlugAvailabilityQuery.isAvailable === true
                        ? tAdmin("resources_article_slug_available")
                        : editSlugAvailabilityQuery.isAvailable === false
                          ? tAdmin("resources_article_slug_unavailable")
                          : ""}
                  </p>
                ) : null}
              </Field>

              <Field>
                <FieldLabel>{tAdmin("resources_article_field_category")}</FieldLabel>
                <FieldContent>
                  <Select
                    value={articleEditState.categoryId || "none"}
                    onValueChange={(value) =>
                      setArticleEditState((previous) =>
                        previous
                          ? { ...previous, categoryId: value === "none" ? "" : value }
                          : previous
                      )
                    }
                  >
                    <SelectTrigger aria-label={tAdmin("resources_article_field_category")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {tAdmin("resources_article_field_category_none")}
                      </SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("resources_article_field_publish_now")}</FieldLabel>
                <FieldContent>
                  <div className="flex h-10 items-center rounded-lg border border-white/10 px-3">
                    <Switch
                      aria-label={tAdmin("resources_article_field_publish_now")}
                      checked={articleEditState.isPublished}
                      onCheckedChange={(checked) =>
                        setArticleEditState((previous) =>
                          previous ? { ...previous, isPublished: checked } : previous
                        )
                      }
                    />
                  </div>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="resource-article-edit-excerpt">
                  {tAdmin("resources_article_field_excerpt")}
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    id="resource-article-edit-excerpt"
                    aria-label={tAdmin("resources_article_field_excerpt")}
                    rows={3}
                    value={articleEditState.excerpt}
                    onChange={(event) =>
                      setArticleEditState((previous) =>
                        previous ? { ...previous, excerpt: event.target.value } : previous
                      )
                    }
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("resources_cover_field")}</FieldLabel>
                <FieldContent>
                  <div className="space-y-3 rounded-lg border border-white/10 p-3">
                    <Input
                      aria-label={tAdmin("resources_cover_field")}
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        void handleUploadCoverForEdit(file);
                      }}
                    />
                    <p className="font-sans text-xs text-[#A1A1AA]">
                      {tAdmin("resources_cover_size_hint", {
                        size: formatFileSize(ADMIN_RESOURCE_COVER_MAX_BYTES),
                      })}
                    </p>
                    {isEditCoverUploading ? (
                      <div className="space-y-2">
                        <Progress value={editUploadProgress} className="h-2" />
                        <div className="flex items-center justify-between">
                          <p className="font-sans text-xs text-[#A1A1AA]">
                            {tAdmin("resources_cover_uploading", { progress: editUploadProgress })}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-11 md:min-h-9"
                            onClick={cancelEditUpload}
                          >
                            <X className="mr-2 h-4 w-4" />
                            {tAdmin("resources_cover_cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {!isEditCoverUploading && articleEditState.coverImageUrl ? (
                      <div className="flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
                        <Upload className="h-3.5 w-3.5" />
                        {tAdmin("resources_cover_uploaded")}
                      </div>
                    ) : null}
                    {editUploadError ? <FieldError>{editUploadError}</FieldError> : null}
                    {editUploadError && lastEditCoverFile && !isEditCoverUploading ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11 md:min-h-9"
                          onClick={retryEditCoverUpload}
                        >
                          {tAdmin("resources_cover_retry")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("resources_article_field_content")}</FieldLabel>
                <FieldContent>
                  <ResourceRichTextEditor
                    value={articleEditState.content}
                    onChange={onEditContentChange}
                    ariaLabel={tAdmin("resources_article_field_content")}
                    placeholder={tAdmin("resources_article_field_content_placeholder")}
                    labels={richTextLabels}
                  />
                </FieldContent>
              </Field>

              {articleEditError ? <FieldError>{articleEditError}</FieldError> : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-full border-[#2A2A2A] bg-[#090909] px-5 font-sans text-sm text-white hover:bg-[#111111]"
              onClick={() => {
                setArticleEditResourceId(null);
                setArticleEditState(null);
                setArticleEditError(null);
                setArticleEditSlugManuallyEdited(false);
                setEditUploadError(null);
                setEditUploadProgress(0);
                setLastEditCoverFile(null);
                editUploadAbortRef.current?.abort();
              }}
            >
              {tAdmin("resources_article_edit_cancel")}
            </Button>
            <Button
              type="button"
              className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white hover:bg-[#0f8aff]"
              onClick={() => {
                void handleSaveArticleEdit();
              }}
              disabled={updateResourceMutation.isPending || articleDetailQuery.isInitialLoading}
            >
              {updateResourceMutation.isPending
                ? tAdmin("resources_article_action_saving")
                : tAdmin("resources_article_action_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={articleToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArticleToDelete(null);
            setArticleDeleteError(null);
          }
        }}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0B0B0B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-white">
              {tAdmin("resources_article_delete_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm text-[#B4B4B4]">
              {articleToDelete
                ? tAdmin("resources_article_delete_confirm_description", {
                    title: articleToDelete.title,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {articleDeleteError ? (
            <FieldError className="mt-1">{articleDeleteError}</FieldError>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full border-[#2A2A2A] bg-[#090909] px-5 font-sans text-sm text-white hover:bg-[#111111]">
              {tAdmin("resources_article_delete_confirm_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11 rounded-full bg-[#7A1F1F] px-5 font-sans text-sm font-semibold text-white hover:bg-[#8A2A2A]"
              onClick={(event) => {
                event.preventDefault();

                if (deleteResourceMutation.isPending || !articleToDelete) {
                  return;
                }

                void handleDeleteArticleWithDialog();
              }}
            >
              {deleteResourceMutation.isPending
                ? tAdmin("resources_article_action_deleting")
                : tAdmin("resources_article_delete_confirm_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="rounded-2xl border border-white/10 bg-[#111111] p-5 md:p-6">
        <div className="mb-5 space-y-1">
          <h2 className="font-display text-xl font-semibold text-white">
            {tAdmin("resources_articles_title")}
          </h2>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="resource-article-create-title">
              {tAdmin("resources_article_field_title")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="resource-article-create-title"
                aria-label={tAdmin("resources_article_field_title")}
                value={articleForm.title}
                onChange={(event) => handleCreateTitleChange(event.target.value)}
                placeholder={tAdmin("resources_article_field_title_placeholder")}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="resource-article-create-slug">
              {tAdmin("resources_article_field_slug")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="resource-article-create-slug"
                aria-label={tAdmin("resources_article_field_slug")}
                value={articleForm.slug}
                onChange={(event) => handleCreateSlugChange(event.target.value)}
                placeholder={tAdmin("resources_article_field_slug_placeholder")}
              />
            </FieldContent>
            {articleForm.slug.trim().length > 0 && !isValidResourceSlug(articleForm.slug) ? (
              <FieldError>{tAdmin("resources_article_validation_slug_invalid")}</FieldError>
            ) : null}
            {articleForm.slug.trim().length > 0 && isValidResourceSlug(articleForm.slug) ? (
              <p className="font-sans text-xs text-[#A1A1AA]">
                {createSlugAvailabilityQuery.isChecking
                  ? tAdmin("resources_article_slug_checking")
                  : createSlugAvailabilityQuery.isAvailable === true
                    ? tAdmin("resources_article_slug_available")
                    : createSlugAvailabilityQuery.isAvailable === false
                      ? tAdmin("resources_article_slug_unavailable")
                      : ""}
              </p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel>{tAdmin("resources_article_field_category")}</FieldLabel>
            <FieldContent>
              <Select
                value={articleForm.categoryId || "none"}
                onValueChange={(value) =>
                  setArticleForm((previous) => ({
                    ...previous,
                    categoryId: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger aria-label={tAdmin("resources_article_field_category")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {tAdmin("resources_article_field_category_none")}
                  </SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>{tAdmin("resources_article_field_publish_now")}</FieldLabel>
            <FieldContent>
              <div className="flex h-10 items-center rounded-lg border border-white/10 px-3">
                <Switch
                  aria-label={tAdmin("resources_article_field_publish_now")}
                  checked={articleForm.isPublished}
                  onCheckedChange={(checked) =>
                    setArticleForm((previous) => ({ ...previous, isPublished: checked }))
                  }
                />
              </div>
            </FieldContent>
          </Field>

          <Field className="md:col-span-2">
            <FieldLabel htmlFor="resource-article-create-excerpt">
              {tAdmin("resources_article_field_excerpt")}
            </FieldLabel>
            <FieldContent>
              <Textarea
                id="resource-article-create-excerpt"
                aria-label={tAdmin("resources_article_field_excerpt")}
                value={articleForm.excerpt}
                onChange={(event) =>
                  setArticleForm((previous) => ({ ...previous, excerpt: event.target.value }))
                }
                rows={2}
                placeholder={tAdmin("resources_article_field_excerpt_placeholder")}
              />
            </FieldContent>
          </Field>

          <Field className="md:col-span-2">
            <FieldLabel>{tAdmin("resources_article_field_content")}</FieldLabel>
            <FieldContent>
              <ResourceRichTextEditor
                value={articleForm.content}
                onChange={onCreateContentChange}
                ariaLabel={tAdmin("resources_article_field_content")}
                placeholder={tAdmin("resources_article_field_content_placeholder")}
                labels={richTextLabels}
              />
            </FieldContent>
          </Field>

          <Field className="md:col-span-2">
            <FieldLabel>{tAdmin("resources_cover_field")}</FieldLabel>
            <FieldContent>
              <div className="space-y-3 rounded-lg border border-white/10 p-3">
                <Input
                  aria-label={tAdmin("resources_cover_field")}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    void handleUploadCover(file);
                  }}
                />
                <p className="font-sans text-xs text-[#A1A1AA]">
                  {tAdmin("resources_cover_size_hint", {
                    size: formatFileSize(ADMIN_RESOURCE_COVER_MAX_BYTES),
                  })}
                </p>
                {isCreateCoverUploading ? (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="h-2" />
                    <div className="flex items-center justify-between">
                      <p className="font-sans text-xs text-[#A1A1AA]">
                        {tAdmin("resources_cover_uploading", { progress: uploadProgress })}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 md:min-h-9"
                        onClick={cancelUpload}
                      >
                        <X className="mr-2 h-4 w-4" />
                        {tAdmin("resources_cover_cancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {!isCreateCoverUploading && articleForm.coverImageUrl ? (
                  <div className="flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
                    <Upload className="h-3.5 w-3.5" />
                    {tAdmin("resources_cover_uploaded")}
                  </div>
                ) : null}
                {uploadError ? <FieldError>{uploadError}</FieldError> : null}
                {uploadError && lastCreateCoverFile && !isCreateCoverUploading ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11 md:min-h-9"
                      onClick={retryCreateCoverUpload}
                    >
                      {tAdmin("resources_cover_retry")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </FieldContent>
          </Field>
        </div>

        {articleFormError ? <FieldError className="mt-3">{articleFormError}</FieldError> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              void handleCreateResource();
            }}
            disabled={createResourceMutation.isPending || createSlugAvailabilityQuery.isChecking}
          >
            {createResourceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tAdmin("resources_article_action_creating")}
              </>
            ) : (
              tAdmin("resources_article_action_create")
            )}
          </Button>
        </div>

        <p className="mt-6 font-sans text-sm text-[#A1A1AA]">
          {tAdmin("resources_articles_description")}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="resource-article-filter-search">
              {tAdmin("resources_article_field_search")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="resource-article-filter-search"
                aria-label={tAdmin("resources_article_field_search")}
                value={resourceSearch}
                onChange={(event) => setResourceSearch(event.target.value)}
                placeholder={tAdmin("resources_article_field_search_placeholder")}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>{tAdmin("resources_article_field_category")}</FieldLabel>
            <FieldContent>
              <Select
                value={resourceCategoryFilter || "all"}
                onValueChange={(value) => setResourceCategoryFilter(value === "all" ? "" : value)}
              >
                <SelectTrigger aria-label={tAdmin("resources_article_field_category")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tAdmin("resources_filter_all")}</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>{tAdmin("resources_article_field_published")}</FieldLabel>
            <FieldContent>
              <Select
                value={resourcePublishedFilter}
                onValueChange={(value: "all" | "true" | "false") =>
                  setResourcePublishedFilter(value)
                }
              >
                <SelectTrigger aria-label={tAdmin("resources_article_field_published")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tAdmin("resources_filter_all")}</SelectItem>
                  <SelectItem value="true">{tAdmin("resources_filter_published")}</SelectItem>
                  <SelectItem value="false">{tAdmin("resources_filter_draft")}</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </div>

        <div className="mt-6 space-y-3">
          {resourcesQuery.isInitialLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : null}

          {resourcesQuery.isError ? (
            <div className="rounded-lg border border-[#EF4444]/40 bg-[#1C0D0D] p-4 text-[#FECACA]">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-sans text-sm font-semibold">
                    {tAdmin("resources_articles_error_title")}
                  </p>
                  <p className="mt-1 font-sans text-sm">
                    {tAdmin("resources_articles_error_description")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {!resourcesQuery.isInitialLoading && !resourcesQuery.isError && resources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/20 p-4 font-sans text-sm text-[#A1A1AA]">
              {tAdmin("resources_articles_empty")}
            </div>
          ) : null}

          {!resourcesQuery.isInitialLoading && !resourcesQuery.isError && resources.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-2 md:hidden">
                {resources.map((resource) => {
                  const updated = new Date(resource.updatedAt);

                  return (
                    <article
                      key={resource.id}
                      className="rounded-lg border border-white/10 bg-black/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-sans text-sm font-semibold text-white">
                            {resource.title}
                          </p>
                          <p className="truncate font-sans text-xs text-[#A1A1AA]">
                            /{resource.slug}
                          </p>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="size-11 rounded-full border-[#2A2A2A] bg-[#000000] p-0 text-white hover:border-[#007eff] hover:bg-[#101010] md:size-9"
                              aria-label={tAdmin("resources_articles_actions_open_menu")}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 rounded-2xl border-[#2A2A2A] bg-[#111111] p-1.5 text-white"
                          >
                            <DropdownMenuItem
                              className="min-h-11 rounded-xl font-sans text-sm"
                              onClick={() => openArticleEdit(resource.id)}
                            >
                              {tAdmin("resources_article_action_edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="min-h-11 rounded-xl font-sans text-sm"
                              onClick={() => {
                                void handleTogglePublished(resource.id, !resource.isPublished);
                              }}
                            >
                              {resource.isPublished
                                ? tAdmin("resources_article_action_unpublish")
                                : tAdmin("resources_article_action_publish")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="min-h-11 rounded-xl font-sans text-sm"
                              onClick={() => openPublicPreview(resource.slug)}
                            >
                              {tAdmin("resources_article_action_preview")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="min-h-11 rounded-xl font-sans text-sm text-[#FFB3B3] focus:text-[#FFB3B3]"
                              onClick={() => openDeleteArticleDialog(resource)}
                            >
                              {tAdmin("resources_article_action_delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/15 px-2.5 py-1 font-sans text-[11px] text-[#D4D4D8]">
                          {resource.category?.name || tAdmin("resources_article_uncategorized")}
                        </span>
                        <span
                          className={
                            resource.isPublished
                              ? "rounded-full border border-[#1E5F31] bg-[#0A1B11] px-2.5 py-1 font-sans text-[11px] text-[#7DE29B]"
                              : "rounded-full border border-[#5F5F5F] bg-[#1A1A1A] px-2.5 py-1 font-sans text-[11px] text-[#C8C8C8]"
                          }
                        >
                          {resource.isPublished
                            ? tAdmin("resources_filter_published")
                            : tAdmin("resources_filter_draft")}
                        </span>
                      </div>

                      <p className="mt-2 font-sans text-xs text-[#A1A1AA]">
                        {tAdmin("resources_articles_updated_label")}:{" "}
                        {Number.isNaN(updated.getTime())
                          ? resource.updatedAt
                          : updated.toLocaleDateString(locale, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                      </p>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-lg border border-[#2A2A2A] md:block">
                <Table className="border-collapse">
                  <TableHeader className="border-b border-[#2A2A2A] bg-[#0A0A0A]">
                    {articleTable.getHeaderGroups().map((headerGroup) => (
                      <TableRow
                        key={headerGroup.id}
                        className="border-b border-[#2A2A2A] hover:bg-transparent"
                      >
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            className="h-12 px-4 align-middle text-[#D5D5D5]"
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
                    {articleTable.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="border-b border-[#2A2A2A] bg-[#111111] transition-colors duration-150 hover:bg-[#1A1A1A] last:border-b-0"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="px-4 py-4 align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 rounded-[1.35rem] border border-[#2A2A2A] bg-[#111111] p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Field className="min-w-[9rem]">
                    <FieldLabel>{tAdmin("resources_articles_page_size_label")}</FieldLabel>
                    <FieldContent>
                      <Select
                        value={String(resourcesPageSize)}
                        onValueChange={(value) => {
                          const parsed = Number.parseInt(value, 10);
                          if (!Number.isFinite(parsed)) {
                            return;
                          }

                          setResourcesPageSize(parsed);
                        }}
                      >
                        <SelectTrigger aria-label={tAdmin("resources_articles_page_size_label")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RESOURCE_PAGE_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={String(option)}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldContent>
                  </Field>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-sans text-xs text-[#A1A1AA]">
                    {tAdmin("resources_articles_page_label", { page: currentResourcesPage })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
                    onClick={goToFirstResourcesPage}
                    disabled={!hasPreviousResourcesPage}
                  >
                    {tAdmin("resources_articles_action_first_page")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
                    onClick={goToPreviousResourcesPage}
                    disabled={!hasPreviousResourcesPage}
                  >
                    {tAdmin("resources_articles_action_prev_page")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-4 font-sans text-xs font-medium text-white hover:bg-[#101010] disabled:opacity-45"
                    onClick={goToNextResourcesPage}
                    disabled={!hasNextResourcesPage || resourcesQuery.isPageTransitioning}
                  >
                    {tAdmin("resources_articles_action_next_page")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}
