"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminShowcaseCategories,
  useAdminShowcaseCoverUploadMutation,
  useAdminShowcaseEntries,
  useAdminShowcaseUserSearch,
  useCreateAdminShowcaseCategoryMutation,
  useCreateAdminShowcaseEntryMutation,
  useDeleteAdminShowcaseEntryMutation,
  useToggleAdminShowcaseEntryFeaturedMutation,
  useUpdateAdminShowcaseEntryMutation,
} from "@/hooks/useAdminShowcase";
import {
  ADMIN_SHOWCASE_COVER_MAX_BYTES,
  validateAdminShowcaseCoverFile,
} from "@/lib/api/admin-showcase";

type CoverUploadStatus = "idle" | "uploading" | "completed" | "cancelled";

type EntryFormState = {
  authorName: string;
  bookTitle: string;
  aboutBook: string;
  categoryId: string;
  linkedUserId: string;
  linkedUserSearch: string;
  publishedYear: string;
  isFeatured: boolean;
  sortOrder: string;
  coverImageUrl: string;
};

const INITIAL_ENTRY_FORM: EntryFormState = {
  authorName: "",
  bookTitle: "",
  aboutBook: "",
  categoryId: "",
  linkedUserId: "",
  linkedUserSearch: "",
  publishedYear: "",
  isFeatured: true,
  sortOrder: "0",
  coverImageUrl: "",
};

type EditEntryFormState = {
  entryId: string;
  authorName: string;
  bookTitle: string;
  aboutBook: string;
  categoryId: string;
  publishedYear: string;
  isFeatured: boolean;
  sortOrder: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToImage(file: File): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image file"));
    };
    image.src = objectUrl;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/png",
  quality?: number
): Promise<Blob | null> {
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function compressCoverIfNeeded(file: File): Promise<File | null> {
  if (file.size <= ADMIN_SHOWCASE_COVER_MAX_BYTES) {
    return file;
  }

  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    return null;
  }

  const image = await fileToImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const mimeType = file.type as "image/jpeg" | "image/png";
  const qualitySteps = mimeType === "image/jpeg" ? [0.95, 0.92, 0.88, 0.84, 0.8] : [undefined];

  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!blob) {
      continue;
    }

    if (blob.size <= ADMIN_SHOWCASE_COVER_MAX_BYTES) {
      return new File([blob], file.name, {
        type: mimeType,
        lastModified: Date.now(),
      });
    }
  }

  return null;
}

export function AdminShowcaseWorkspaceView() {
  const tAdmin = useTranslations("admin");

  const categoriesQuery = useAdminShowcaseCategories();
  const [entriesSearch, setEntriesSearch] = useState("");
  const [entriesCategoryFilter, setEntriesCategoryFilter] = useState("");
  const [entriesFeaturedFilter, setEntriesFeaturedFilter] = useState<
    "all" | "featured" | "regular"
  >("all");
  const [entriesPageSize, setEntriesPageSize] = useState(20);
  const [entriesCursor, setEntriesCursor] = useState<string | undefined>(undefined);
  const [entriesPageCursors, setEntriesPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [entriesPageIndex, setEntriesPageIndex] = useState(0);

  const deferredEntriesSearch = useDeferredValue(entriesSearch);
  const entriesFilterSignature = `${deferredEntriesSearch}::${entriesCategoryFilter}::${entriesFeaturedFilter}::${entriesPageSize}`;

  const entriesQuery = useAdminShowcaseEntries({
    cursor: entriesCursor,
    limit: entriesPageSize,
    q: deferredEntriesSearch,
    categoryId: entriesCategoryFilter || undefined,
    isFeatured: entriesFeaturedFilter === "all" ? undefined : entriesFeaturedFilter === "featured",
    sort: "sort_order_asc",
  });

  const createCategoryMutation = useCreateAdminShowcaseCategoryMutation();
  const createEntryMutation = useCreateAdminShowcaseEntryMutation();
  const updateEntryMutation = useUpdateAdminShowcaseEntryMutation();
  const deleteEntryMutation = useDeleteAdminShowcaseEntryMutation();
  const toggleFeaturedMutation = useToggleAdminShowcaseEntryFeaturedMutation();
  const coverUploadMutation = useAdminShowcaseCoverUploadMutation();

  const [form, setForm] = useState<EntryFormState>(INITIAL_ENTRY_FORM);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [coverUploadProgress, setCoverUploadProgress] = useState<number>(0);
  const [coverUploadStatus, setCoverUploadStatus] = useState<CoverUploadStatus>("idle");
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);

  const [replacingEntryId, setReplacingEntryId] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<number>(0);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditEntryFormState | null>(null);
  const [deleteConfirmationEntry, setDeleteConfirmationEntry] = useState<{
    id: string;
    bookTitle: string;
  } | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("0");
  const [categoryIsActive, setCategoryIsActive] = useState(true);

  const deferredLinkedUserSearch = useDeferredValue(form.linkedUserSearch);
  const userSearchEnabled = deferredLinkedUserSearch.trim().length >= 2;
  const userSearchQuery = useAdminShowcaseUserSearch(
    {
      q: deferredLinkedUserSearch,
      limit: 8,
      cursor: undefined,
    },
    userSearchEnabled
  );

  const coverUploadAbortControllerRef = useRef<AbortController | null>(null);
  const replaceUploadAbortControllerRef = useRef<AbortController | null>(null);
  const previousEntriesFilterSignatureRef = useRef(entriesFilterSignature);

  const canSubmit = useMemo(() => {
    return (
      form.authorName.trim().length > 0 &&
      form.bookTitle.trim().length > 0 &&
      form.coverImageUrl.trim().length > 0 &&
      !createEntryMutation.isPending &&
      !updateEntryMutation.isPending
    );
  }, [
    form.authorName,
    form.bookTitle,
    form.coverImageUrl,
    createEntryMutation.isPending,
    updateEntryMutation.isPending,
  ]);

  const currentEntriesPage = entriesPageIndex + 1;
  const hasPreviousEntriesPage = entriesPageIndex > 0;
  const hasLastKnownEntriesPage = entriesPageCursors.length > 1;
  const isOnLastKnownEntriesPage = entriesPageIndex === entriesPageCursors.length - 1;

  useEffect(() => {
    if (previousEntriesFilterSignatureRef.current === entriesFilterSignature) {
      return;
    }

    previousEntriesFilterSignatureRef.current = entriesFilterSignature;

    // Reset to first page whenever any filter or search input changes.
    setEntriesCursor(undefined);
    setEntriesPageCursors([undefined]);
    setEntriesPageIndex(0);
  }, [entriesFilterSignature]);

  function updateForm<K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function resetCoverUploadState() {
    setCoverUploadStatus("idle");
    setCoverUploadProgress(0);
    setCoverUploadError(null);
  }

  async function handleCreateCoverSelection(file: File | null) {
    setSelectedCoverFile(file);
    setCoverUploadError(null);

    if (!file) {
      return;
    }

    let candidate = file;
    if (file.size > ADMIN_SHOWCASE_COVER_MAX_BYTES) {
      const compressed = await compressCoverIfNeeded(file);
      if (!compressed) {
        setCoverUploadError(
          tAdmin("showcase_cover_validation_cannot_compress", {
            size: formatFileSize(ADMIN_SHOWCASE_COVER_MAX_BYTES),
          })
        );
        return;
      }

      candidate = compressed;
      if (candidate.size < file.size) {
        toast.success(
          tAdmin("showcase_cover_toast_auto_compressed", {
            original: formatFileSize(file.size),
            compressed: formatFileSize(candidate.size),
          })
        );
      }
    }

    setSelectedCoverFile(candidate);

    const validation = validateAdminShowcaseCoverFile(candidate);
    if (!validation) {
      return;
    }

    if (validation === "unsupported") {
      setCoverUploadError(tAdmin("showcase_cover_validation_unsupported"));
    } else if (validation === "empty") {
      setCoverUploadError(tAdmin("showcase_cover_validation_empty"));
    } else {
      setCoverUploadError(
        tAdmin("showcase_cover_validation_size", {
          size: formatFileSize(ADMIN_SHOWCASE_COVER_MAX_BYTES),
        })
      );
    }
  }

  async function uploadCreateCover() {
    if (!selectedCoverFile) {
      setCoverUploadError(tAdmin("showcase_cover_validation_required"));
      return;
    }

    const validation = validateAdminShowcaseCoverFile(selectedCoverFile);
    if (validation) {
      handleCreateCoverSelection(selectedCoverFile);
      return;
    }

    coverUploadAbortControllerRef.current?.abort();
    const controller = new AbortController();
    coverUploadAbortControllerRef.current = controller;

    setCoverUploadStatus("uploading");
    setCoverUploadProgress(0);
    setCoverUploadError(null);

    try {
      const result = await coverUploadMutation.mutateAsync({
        file: selectedCoverFile,
        signal: controller.signal,
        onProgress: (percentage) => {
          setCoverUploadProgress(percentage);
        },
      });

      setCoverUploadStatus("completed");
      setCoverUploadProgress(100);
      updateForm("coverImageUrl", result.secureUrl);
      toast.success(tAdmin("showcase_cover_toast_uploaded"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : tAdmin("showcase_cover_toast_upload_failed");
      if (message.toLowerCase().includes("cancel")) {
        setCoverUploadStatus("cancelled");
        setCoverUploadError(tAdmin("showcase_cover_status_cancelled"));
      } else {
        setCoverUploadStatus("idle");
        setCoverUploadError(message);
        toast.error(tAdmin("showcase_cover_toast_upload_failed"));
      }
    } finally {
      coverUploadAbortControllerRef.current = null;
    }
  }

  function abortCreateCoverUpload() {
    coverUploadAbortControllerRef.current?.abort();
  }

  async function replaceEntryCover(entryId: string, file: File | null) {
    setReplaceError(null);

    if (!file) {
      return;
    }

    let candidate = file;

    const initialValidation = validateAdminShowcaseCoverFile(file);
    if (initialValidation && initialValidation !== "size") {
      if (initialValidation === "unsupported") {
        setReplaceError(tAdmin("showcase_cover_validation_unsupported"));
      } else {
        setReplaceError(tAdmin("showcase_cover_validation_empty"));
      }
      return;
    }

    if (file.size > ADMIN_SHOWCASE_COVER_MAX_BYTES) {
      const compressed = await compressCoverIfNeeded(file);
      if (!compressed) {
        setReplaceError(
          tAdmin("showcase_cover_validation_cannot_compress", {
            size: formatFileSize(ADMIN_SHOWCASE_COVER_MAX_BYTES),
          })
        );
        return;
      }

      candidate = compressed;
      if (candidate.size < file.size) {
        toast.success(
          tAdmin("showcase_cover_toast_auto_compressed", {
            original: formatFileSize(file.size),
            compressed: formatFileSize(candidate.size),
          })
        );
      }
    }

    const validation = validateAdminShowcaseCoverFile(candidate);
    if (validation) {
      if (validation === "unsupported") {
        setReplaceError(tAdmin("showcase_cover_validation_unsupported"));
      } else if (validation === "empty") {
        setReplaceError(tAdmin("showcase_cover_validation_empty"));
      } else {
        setReplaceError(
          tAdmin("showcase_cover_validation_size", {
            size: formatFileSize(ADMIN_SHOWCASE_COVER_MAX_BYTES),
          })
        );
      }
      return;
    }

    replaceUploadAbortControllerRef.current?.abort();
    const controller = new AbortController();
    replaceUploadAbortControllerRef.current = controller;

    setReplacingEntryId(entryId);
    setReplaceProgress(0);

    try {
      await coverUploadMutation.mutateAsync({
        file: candidate,
        entryId,
        signal: controller.signal,
        onProgress: (percentage) => {
          setReplaceProgress(percentage);
        },
      });

      toast.success(tAdmin("showcase_cover_toast_replace_uploaded"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : tAdmin("showcase_cover_toast_replace_failed");
      setReplaceError(message);
      toast.error(tAdmin("showcase_cover_toast_replace_failed"));
    } finally {
      replaceUploadAbortControllerRef.current = null;
      setReplacingEntryId(null);
      setReplaceProgress(0);
    }
  }

  async function onSubmitEntry() {
    if (!form.coverImageUrl.trim()) {
      setCoverUploadError(tAdmin("showcase_entry_create_requires_cover"));
      return;
    }

    if (!form.authorName.trim()) {
      return;
    }

    if (!form.bookTitle.trim()) {
      return;
    }

    const parsedYear =
      form.publishedYear.trim().length > 0 ? Number.parseInt(form.publishedYear, 10) : null;
    const parsedSortOrder = Number.parseInt(form.sortOrder, 10);
    const payload = {
      authorName: form.authorName.trim(),
      bookTitle: form.bookTitle.trim(),
      coverImageUrl: form.coverImageUrl.trim(),
      aboutBook: form.aboutBook.trim() || null,
      categoryId: form.categoryId || null,
      userId: form.linkedUserId || null,
      publishedYear: Number.isFinite(parsedYear ?? Number.NaN) ? parsedYear : null,
      isFeatured: form.isFeatured,
      sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0,
    };

    try {
      await createEntryMutation.mutateAsync(payload);
      toast.success(tAdmin("showcase_entry_toast_created"));

      setForm(INITIAL_ENTRY_FORM);
      setSelectedCoverFile(null);
      resetCoverUploadState();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : tAdmin("showcase_entry_toast_create_failed");
      toast.error(message);
    }
  }

  async function onDeleteEntry(entryId: string) {
    try {
      await deleteEntryMutation.mutateAsync(entryId);
      toast.success(tAdmin("showcase_entry_toast_deleted"));
      setDeleteConfirmationEntry(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : tAdmin("showcase_entry_toast_delete_failed");
      toast.error(message);
    }
  }

  async function onToggleFeatured(entryId: string, isFeatured: boolean) {
    try {
      await toggleFeaturedMutation.mutateAsync({
        entryId,
        isFeatured,
      });
      toast.success(tAdmin("showcase_entry_toast_updated"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : tAdmin("showcase_entry_toast_update_failed");
      toast.error(message);
    }
  }

  function onNextEntriesPage() {
    if (!entriesQuery.nextCursor) {
      return;
    }

    const nextCursor = entriesQuery.nextCursor;

    setEntriesPageCursors((previous) => {
      const next = previous.slice(0, entriesPageIndex + 1);
      next.push(nextCursor);
      return next;
    });
    setEntriesPageIndex((previous) => previous + 1);
    setEntriesCursor(nextCursor);
  }

  function onPreviousEntriesPage() {
    if (!hasPreviousEntriesPage) {
      return;
    }

    setEntriesPageIndex((previous) => {
      const nextIndex = previous - 1;
      setEntriesCursor(entriesPageCursors[nextIndex]);
      return nextIndex;
    });
  }

  function onFirstEntriesPage() {
    setEntriesPageIndex(0);
    setEntriesCursor(undefined);
  }

  function onLastKnownEntriesPage() {
    const lastIndex = entriesPageCursors.length - 1;
    if (lastIndex <= 0) {
      return;
    }

    setEntriesPageIndex(lastIndex);
    setEntriesCursor(entriesPageCursors[lastIndex]);
  }

  async function onCreateCategory() {
    const trimmedName = categoryName.trim();
    if (trimmedName.length === 0) {
      toast.error(tAdmin("showcase_category_validation_name_required"));
      return;
    }

    const parsedSortOrder = Number.parseInt(categorySortOrder, 10);
    if (!Number.isFinite(parsedSortOrder) || parsedSortOrder < 0) {
      toast.error(tAdmin("showcase_category_validation_sort_order_required"));
      return;
    }

    try {
      await createCategoryMutation.mutateAsync({
        name: trimmedName,
        description: null,
        sortOrder: parsedSortOrder,
        isActive: categoryIsActive,
      });

      setCategoryName("");
      setCategorySortOrder("0");
      setCategoryIsActive(true);
      toast.success(tAdmin("showcase_category_toast_created"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : tAdmin("showcase_category_toast_create_failed");
      toast.error(message);
    }
  }

  function onEditEntry(entry: (typeof entries)[number]) {
    setEditForm({
      entryId: entry.id,
      authorName: entry.authorName,
      bookTitle: entry.bookTitle,
      aboutBook: entry.aboutBook ?? "",
      categoryId: entry.categoryId ?? "",
      publishedYear: entry.publishedYear ? String(entry.publishedYear) : "",
      isFeatured: entry.isFeatured,
      sortOrder: String(entry.sortOrder),
    });
    setEditDialogOpen(true);
  }

  async function onSubmitEditEntry() {
    if (!editForm) {
      return;
    }

    const parsedYear =
      editForm.publishedYear.trim().length > 0 ? Number.parseInt(editForm.publishedYear, 10) : null;
    const parsedSortOrder = Number.parseInt(editForm.sortOrder, 10);

    try {
      await updateEntryMutation.mutateAsync({
        entryId: editForm.entryId,
        input: {
          authorName: editForm.authorName.trim(),
          bookTitle: editForm.bookTitle.trim(),
          aboutBook: editForm.aboutBook.trim() || null,
          categoryId: editForm.categoryId || null,
          publishedYear: Number.isFinite(parsedYear ?? Number.NaN) ? parsedYear : null,
          isFeatured: editForm.isFeatured,
          sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0,
        },
      });

      toast.success(tAdmin("showcase_entry_toast_updated"));
      setEditDialogOpen(false);
      setEditForm(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : tAdmin("showcase_entry_toast_update_failed");
      toast.error(message);
    }
  }

  const categories = categoriesQuery.categories;
  const entries = entriesQuery.items;

  return (
    <section className="grid min-w-0 gap-6">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {tAdmin("showcase")}
        </h1>
        <p className="font-sans mt-3 max-w-3xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("showcase_workspace_description")}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[1.5rem] border border-[#1B1B1B] bg-[#0A0A0A] p-5">
          <h2 className="font-display text-xl font-semibold text-white">
            {tAdmin("showcase_entries_title")}
          </h2>
          <p className="font-sans mt-2 text-sm text-[#B4B4B4]">
            {tAdmin("showcase_entries_description")}
          </p>

          {replaceError ? (
            <p className="font-sans mt-4 text-sm text-[#FFB0B0]" role="alert" aria-live="polite">
              {replaceError}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 rounded-xl border border-[#1E1E1E] bg-[#0E0E0E] p-3">
            <Field>
              <FieldLabel>{tAdmin("showcase_entry_filters_search_label")}</FieldLabel>
              <FieldContent>
                <Input
                  value={entriesSearch}
                  onChange={(event) => setEntriesSearch(event.target.value)}
                  placeholder={tAdmin("showcase_entry_filters_search_placeholder")}
                  aria-label={tAdmin("showcase_entry_filters_search_label")}
                />
              </FieldContent>
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_category")}</FieldLabel>
                <FieldContent>
                  <Select
                    value={entriesCategoryFilter || "all"}
                    onValueChange={(value) =>
                      setEntriesCategoryFilter(value === "all" ? "" : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={tAdmin("showcase_entry_field_category_placeholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tAdmin("packages_mobile_filter_all")}</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{tAdmin("showcase_entry_filters_featured_label")}</FieldLabel>
                <FieldContent>
                  <Select
                    value={entriesFeaturedFilter}
                    onValueChange={(value) =>
                      setEntriesFeaturedFilter(value as "all" | "featured" | "regular")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {tAdmin("showcase_entry_filters_featured_all")}
                      </SelectItem>
                      <SelectItem value="featured">
                        {tAdmin("showcase_entry_filters_featured_only")}
                      </SelectItem>
                      <SelectItem value="regular">
                        {tAdmin("showcase_entry_filters_regular_only")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>
          </div>

          <div className="mt-4 grid gap-4" aria-busy={entriesQuery.isFetching}>
            {entriesQuery.isInitialLoading ? (
              <p className="font-sans text-sm text-[#8E8E8E]">
                {tAdmin("showcase_entries_loading")}
              </p>
            ) : entries.length === 0 ? (
              <p className="font-sans text-sm text-[#8E8E8E]">{tAdmin("showcase_entries_empty")}</p>
            ) : (
              entries.map((entry) => {
                const isReplacing = replacingEntryId === entry.id;

                return (
                  <article
                    key={entry.id}
                    className="grid gap-3 rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4 md:grid-cols-[112px_1fr]"
                  >
                    <Image
                      src={entry.bookCoverUrl}
                      alt={entry.bookTitle}
                      width={112}
                      height={144}
                      className="h-36 w-28 rounded-xl border border-[#252525] object-cover"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display truncate text-lg text-white">
                        {entry.bookTitle}
                      </h3>
                      <p className="font-sans truncate text-sm text-[#B4B4B4]">
                        {entry.authorName}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="rounded-full"
                          onClick={() => onEditEntry(entry)}
                        >
                          {tAdmin("showcase_entry_edit_title")}
                        </Button>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#2C2C2C] bg-[#161616] px-3 py-2 font-sans text-xs text-[#E3E3E3]">
                          {tAdmin("showcase_entries_replace_cover")}
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="sr-only"
                            disabled={isReplacing}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0] ?? null;
                              void replaceEntryCover(entry.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <a
                          href={entry.previewPath}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-[#2C2C2C] px-3 py-2 font-sans text-xs text-[#D6D6D6] hover:bg-[#1A1A1A]"
                        >
                          {tAdmin("showcase_entry_field_preview_path")}
                        </a>
                        <Button
                          type="button"
                          variant="destructive"
                          className="rounded-full"
                          onClick={() =>
                            setDeleteConfirmationEntry({ id: entry.id, bookTitle: entry.bookTitle })
                          }
                          disabled={deleteEntryMutation.isPending}
                        >
                          {tAdmin("showcase_entry_action_delete")}
                        </Button>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <Switch
                          checked={entry.isFeatured}
                          disabled={toggleFeaturedMutation.isPending}
                          onCheckedChange={(checked) => {
                            void onToggleFeatured(entry.id, checked);
                          }}
                          aria-label={tAdmin("showcase_entry_field_featured")}
                        />
                        <p className="font-sans text-xs text-[#B4B4B4]">
                          {tAdmin("showcase_entry_field_featured")}
                        </p>
                      </div>

                      {isReplacing ? (
                        <div className="mt-3 grid gap-2">
                          <Progress
                            value={replaceProgress}
                            max={100}
                            role="progressbar"
                            aria-label={tAdmin("showcase_cover_progress_label")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={replaceProgress}
                            className="h-2 bg-[#1F1F1F]"
                          />
                          <p className="font-sans text-xs text-[#9A9A9A]" aria-live="polite">
                            {tAdmin("showcase_cover_status_uploading", {
                              progress: replaceProgress,
                            })}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#1F1F1F] pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-sans text-xs text-[#8E8E8E]">
                  {tAdmin("showcase_entries_page_label", {
                    page: currentEntriesPage,
                  })}
                </p>
                <Select
                  value={String(entriesPageSize)}
                  onValueChange={(value) => {
                    const parsed = Number.parseInt(value, 10);
                    if (Number.isFinite(parsed)) {
                      setEntriesPageSize(parsed);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 min-w-[8.5rem] rounded-full border-[#2C2C2C] bg-[#111111] text-xs text-[#D8D8D8]">
                    <SelectValue placeholder={tAdmin("showcase_entries_page_size_label")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full"
                  onClick={onFirstEntriesPage}
                  disabled={!hasPreviousEntriesPage || entriesQuery.isFetching}
                >
                  {tAdmin("showcase_entries_action_first_page")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full"
                  onClick={onPreviousEntriesPage}
                  disabled={!hasPreviousEntriesPage || entriesQuery.isFetching}
                >
                  {tAdmin("showcase_entries_action_prev_page")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full"
                  onClick={onNextEntriesPage}
                  disabled={
                    !entriesQuery.hasMore || !entriesQuery.nextCursor || entriesQuery.isFetching
                  }
                >
                  {tAdmin("showcase_entries_action_next_page")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full"
                  onClick={onLastKnownEntriesPage}
                  disabled={
                    !hasLastKnownEntriesPage || isOnLastKnownEntriesPage || entriesQuery.isFetching
                  }
                >
                  {tAdmin("showcase_entries_action_last_known_page")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[#1B1B1B] bg-[#0A0A0A] p-5">
          <div className="mb-6 rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4">
            <h2 className="font-display text-xl font-semibold text-white">
              {tAdmin("showcase_categories_title")}
            </h2>
            <p className="font-sans mt-2 text-sm text-[#B4B4B4]">
              {tAdmin("showcase_categories_description")}
            </p>

            <div className="mt-4 grid gap-4">
              <Field>
                <FieldLabel>{tAdmin("showcase_category_field_name")}</FieldLabel>
                <FieldContent>
                  <Input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    aria-label={tAdmin("showcase_category_field_name")}
                  />
                </FieldContent>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>{tAdmin("showcase_category_field_sort_order")}</FieldLabel>
                  <FieldContent>
                    <Input
                      inputMode="numeric"
                      value={categorySortOrder}
                      onChange={(event) => setCategorySortOrder(event.target.value)}
                      aria-label={tAdmin("showcase_category_field_sort_order")}
                    />
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>{tAdmin("showcase_category_field_active")}</FieldLabel>
                  <FieldContent>
                    <div className="flex min-h-11 items-center justify-start">
                      <Switch checked={categoryIsActive} onCheckedChange={setCategoryIsActive} />
                    </div>
                  </FieldContent>
                </Field>
              </div>

              <Button
                type="button"
                className="w-fit rounded-full"
                onClick={onCreateCategory}
                disabled={createCategoryMutation.isPending}
              >
                {createCategoryMutation.isPending
                  ? tAdmin("showcase_category_action_creating")
                  : tAdmin("showcase_category_action_create")}
              </Button>

              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <span
                      key={category.id}
                      className="rounded-full border border-[#2D2D2D] bg-[#151515] px-3 py-1 font-sans text-xs text-[#D0D0D0]"
                    >
                      {category.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="font-sans text-xs text-[#8E8E8E]">
                  {tAdmin("showcase_categories_empty")}
                </p>
              )}
            </div>
          </div>

          <h2 className="font-display text-xl font-semibold text-white">
            {tAdmin("showcase_entry_create_title")}
          </h2>

          <div className="mt-4 grid gap-4">
            <Field>
              <FieldLabel>{tAdmin("showcase_entry_field_author_name")}</FieldLabel>
              <FieldContent>
                <Input
                  value={form.authorName}
                  onChange={(event) => updateForm("authorName", event.target.value)}
                  placeholder={tAdmin("showcase_entry_field_author_name")}
                  aria-label={tAdmin("showcase_entry_field_author_name")}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>{tAdmin("showcase_entry_field_title")}</FieldLabel>
              <FieldContent>
                <Input
                  value={form.bookTitle}
                  onChange={(event) => updateForm("bookTitle", event.target.value)}
                  placeholder={tAdmin("showcase_entry_field_title")}
                  aria-label={tAdmin("showcase_entry_field_title")}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>{tAdmin("showcase_entry_field_about_book")}</FieldLabel>
              <FieldContent>
                <Textarea
                  value={form.aboutBook}
                  onChange={(event) => updateForm("aboutBook", event.target.value)}
                  rows={4}
                  aria-label={tAdmin("showcase_entry_field_about_book")}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>{tAdmin("showcase_entry_field_user")}</FieldLabel>
              <FieldContent>
                <Input
                  value={form.linkedUserSearch}
                  onChange={(event) => {
                    updateForm("linkedUserSearch", event.target.value);
                    if (event.target.value.trim().length === 0) {
                      updateForm("linkedUserId", "");
                    }
                  }}
                  placeholder={tAdmin("showcase_user_search_placeholder")}
                  aria-label={tAdmin("showcase_entry_field_user")}
                  aria-autocomplete="list"
                  aria-expanded={userSearchEnabled && userSearchQuery.items.length > 0}
                />
              </FieldContent>
              {form.linkedUserId ? (
                <p className="font-sans text-xs text-[#9A9A9A]" aria-live="polite">
                  {tAdmin("showcase_user_search_selected")}
                </p>
              ) : null}
              {form.linkedUserSearch.trim().length > 0 && !userSearchEnabled ? (
                <p className="font-sans text-xs text-[#9A9A9A]">
                  {tAdmin("showcase_user_search_min_chars")}
                </p>
              ) : null}
            </Field>

            {userSearchEnabled ? (
              <div
                className="max-h-44 overflow-auto rounded-xl border border-[#1F1F1F] bg-[#101010] p-2"
                role="listbox"
              >
                {userSearchQuery.isFetching ? (
                  <p className="font-sans px-2 py-1 text-xs text-[#8E8E8E]">
                    {tAdmin("showcase_user_search_searching")}
                  </p>
                ) : userSearchQuery.items.length === 0 ? (
                  <p className="font-sans px-2 py-1 text-xs text-[#8E8E8E]">
                    {tAdmin("showcase_user_search_empty")}
                  </p>
                ) : (
                  userSearchQuery.items.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8AB4FF]"
                      onClick={() => {
                        updateForm("linkedUserId", user.id);
                        updateForm("linkedUserSearch", `${user.displayName} (${user.email})`);
                      }}
                    >
                      <span className="font-sans text-xs text-[#E0E0E0]">{user.displayName}</span>
                      <span className="font-sans text-[11px] text-[#A6A6A6]">{user.email}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_category")}</FieldLabel>
                <FieldContent>
                  <Select
                    value={form.categoryId || "none"}
                    onValueChange={(value) =>
                      updateForm("categoryId", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={tAdmin("showcase_entry_field_category_placeholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tAdmin("packages_mobile_filter_all")}</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_published_year")}</FieldLabel>
                <FieldContent>
                  <Input
                    inputMode="numeric"
                    value={form.publishedYear}
                    onChange={(event) => updateForm("publishedYear", event.target.value)}
                    placeholder="2026"
                    aria-label={tAdmin("showcase_entry_field_published_year")}
                  />
                </FieldContent>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_sort_order")}</FieldLabel>
                <FieldContent>
                  <Input
                    inputMode="numeric"
                    value={form.sortOrder}
                    onChange={(event) => updateForm("sortOrder", event.target.value)}
                    aria-label={tAdmin("showcase_entry_field_sort_order")}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_featured")}</FieldLabel>
                <FieldContent>
                  <div className="flex min-h-11 items-center justify-start">
                    <Switch
                      checked={form.isFeatured}
                      onCheckedChange={(checked) => updateForm("isFeatured", checked)}
                    />
                  </div>
                </FieldContent>
              </Field>
            </div>

            <Field>
              <FieldLabel>{tAdmin("showcase_entry_field_cover_image")}</FieldLabel>
              <FieldContent>
                <div className="grid gap-3 rounded-2xl border border-[#1F1F1F] bg-[#111111] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-full border border-[#2D2D2D] px-3 py-2 font-sans text-xs text-[#E3E3E3] hover:bg-[#1A1A1A]">
                      {tAdmin("showcase_cover_action_choose")}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="sr-only"
                        onChange={(event) => {
                          void handleCreateCoverSelection(event.currentTarget.files?.[0] ?? null);
                        }}
                        disabled={coverUploadStatus === "uploading"}
                      />
                    </label>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={uploadCreateCover}
                      disabled={!selectedCoverFile || coverUploadStatus === "uploading"}
                      className="rounded-full text-black"
                    >
                      {coverUploadStatus === "uploading"
                        ? tAdmin("showcase_cover_action_uploading")
                        : tAdmin("showcase_cover_action_upload")}
                    </Button>

                    {coverUploadStatus === "uploading" ? (
                      <Button type="button" variant="ghost" onClick={abortCreateCoverUpload}>
                        {tAdmin("showcase_cover_action_abort")}
                      </Button>
                    ) : null}
                  </div>

                  {selectedCoverFile ? (
                    <p className="font-sans text-xs text-[#9A9A9A]">
                      {selectedCoverFile.name} ({formatFileSize(selectedCoverFile.size)})
                    </p>
                  ) : null}

                  {coverUploadStatus === "uploading" || coverUploadStatus === "completed" ? (
                    <div className="grid gap-2">
                      <Progress
                        value={coverUploadProgress}
                        max={100}
                        role="progressbar"
                        aria-label={tAdmin("showcase_cover_progress_label")}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={coverUploadProgress}
                        className="h-2 bg-[#1F1F1F]"
                      />
                      <p className="font-sans text-xs text-[#9A9A9A]" aria-live="polite">
                        {tAdmin("showcase_cover_status_uploading", {
                          progress: coverUploadProgress,
                        })}
                      </p>
                    </div>
                  ) : null}

                  {form.coverImageUrl ? (
                    <div className="grid gap-2">
                      <Image
                        src={form.coverImageUrl}
                        alt={tAdmin("showcase_cover_preview_alt")}
                        width={144}
                        height={192}
                        className="h-48 w-36 rounded-xl border border-[#252525] object-cover"
                      />
                      <p className="font-sans text-xs text-[#88C89A]">
                        {tAdmin("showcase_cover_status_complete")}
                      </p>
                    </div>
                  ) : null}
                </div>
              </FieldContent>
              {coverUploadError ? <FieldError>{coverUploadError}</FieldError> : null}
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={onSubmitEntry}
                disabled={!canSubmit}
                className="min-h-11 rounded-full"
              >
                {createEntryMutation.isPending || updateEntryMutation.isPending
                  ? tAdmin("showcase_entry_action_creating")
                  : tAdmin("showcase_entry_action_create")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[1.5rem] border border-[#1D1D1D] bg-[#0B0B0B] p-6 text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-white">
              {tAdmin("showcase_entry_edit_title")}
            </DialogTitle>
            <DialogDescription className="font-sans text-sm text-[#B4B4B4]">
              {tAdmin("showcase_entry_edit_modal_description")}
            </DialogDescription>
          </DialogHeader>

          {editForm ? (
            <div className="grid gap-4">
              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_author_name")}</FieldLabel>
                <FieldContent>
                  <Input
                    value={editForm.authorName}
                    onChange={(event) =>
                      setEditForm((previous) =>
                        previous ? { ...previous, authorName: event.target.value } : previous
                      )
                    }
                    aria-label={tAdmin("showcase_entry_field_author_name")}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_title")}</FieldLabel>
                <FieldContent>
                  <Input
                    value={editForm.bookTitle}
                    onChange={(event) =>
                      setEditForm((previous) =>
                        previous ? { ...previous, bookTitle: event.target.value } : previous
                      )
                    }
                    aria-label={tAdmin("showcase_entry_field_title")}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{tAdmin("showcase_entry_field_about_book")}</FieldLabel>
                <FieldContent>
                  <Textarea
                    value={editForm.aboutBook}
                    onChange={(event) =>
                      setEditForm((previous) =>
                        previous ? { ...previous, aboutBook: event.target.value } : previous
                      )
                    }
                    rows={4}
                    aria-label={tAdmin("showcase_entry_field_about_book")}
                  />
                </FieldContent>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>{tAdmin("showcase_entry_field_category")}</FieldLabel>
                  <FieldContent>
                    <Select
                      value={editForm.categoryId || "none"}
                      onValueChange={(value) =>
                        setEditForm((previous) =>
                          previous
                            ? {
                                ...previous,
                                categoryId: value === "none" ? "" : value,
                              }
                            : previous
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={tAdmin("showcase_entry_field_category_placeholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tAdmin("packages_mobile_filter_all")}</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>{tAdmin("showcase_entry_field_published_year")}</FieldLabel>
                  <FieldContent>
                    <Input
                      inputMode="numeric"
                      value={editForm.publishedYear}
                      onChange={(event) =>
                        setEditForm((previous) =>
                          previous ? { ...previous, publishedYear: event.target.value } : previous
                        )
                      }
                      aria-label={tAdmin("showcase_entry_field_published_year")}
                    />
                  </FieldContent>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>{tAdmin("showcase_entry_field_sort_order")}</FieldLabel>
                  <FieldContent>
                    <Input
                      inputMode="numeric"
                      value={editForm.sortOrder}
                      onChange={(event) =>
                        setEditForm((previous) =>
                          previous ? { ...previous, sortOrder: event.target.value } : previous
                        )
                      }
                      aria-label={tAdmin("showcase_entry_field_sort_order")}
                    />
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>{tAdmin("showcase_entry_field_featured")}</FieldLabel>
                  <FieldContent>
                    <div className="flex min-h-11 items-center justify-start">
                      <Switch
                        checked={editForm.isFeatured}
                        onCheckedChange={(checked) =>
                          setEditForm((previous) =>
                            previous ? { ...previous, isFeatured: checked } : previous
                          )
                        }
                      />
                    </div>
                  </FieldContent>
                </Field>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full"
              onClick={() => {
                setEditDialogOpen(false);
                setEditForm(null);
              }}
            >
              {tAdmin("showcase_entry_action_cancel")}
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={!editForm || updateEntryMutation.isPending}
              onClick={() => void onSubmitEditEntry()}
            >
              {updateEntryMutation.isPending
                ? tAdmin("showcase_entry_action_saving")
                : tAdmin("showcase_entry_action_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmationEntry !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmationEntry(null);
          }
        }}
      >
        <AlertDialogContent className="border-[#2A2A2A] bg-[#0B0B0B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-white">
              {tAdmin("showcase_entry_delete_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm text-[#B4B4B4]">
              {tAdmin("showcase_entry_delete_confirm_description", {
                title: deleteConfirmationEntry?.bookTitle ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full border-[#2A2A2A] bg-[#F5F5F5] px-5 font-sans text-sm text-black hover:bg-white hover:text-black">
              {tAdmin("showcase_entry_delete_confirm_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-full bg-[#B3261E] px-5 font-sans text-sm text-white hover:bg-[#8F1F19]"
              disabled={deleteEntryMutation.isPending || !deleteConfirmationEntry}
              onClick={() => {
                if (!deleteConfirmationEntry) {
                  return;
                }
                void onDeleteEntry(deleteConfirmationEntry.id);
              }}
            >
              {deleteEntryMutation.isPending
                ? tAdmin("showcase_entry_action_deleting")
                : tAdmin("showcase_entry_delete_confirm_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
