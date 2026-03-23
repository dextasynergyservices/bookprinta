"use client";

import type { BookFileVersion, BookStatus } from "@bookprinta/shared";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CircleAlert,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { humanizeAdminBookStatus } from "@/hooks/use-admin-books-filters";
import {
  isAdminBookConflictError,
  useAdminBookCancelProcessingMutation,
  useAdminBookDownloadMutation,
  useAdminBookHtmlUploadMutation,
  useAdminBookRejectMutation,
  useAdminBookResetProcessingMutation,
  useAdminBookStatusMutation,
  useAdminBookVersionFileDownloadMutation,
  validateAdminBookHtmlFile,
} from "@/hooks/useAdminBookActions";
import { useAdminBookDetail } from "@/hooks/useAdminBookDetail";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const AdminBookPdfVerifier = dynamic(
  () => import("./AdminBookPdfVerifier").then((mod) => mod.AdminBookPdfVerifier),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
        <Skeleton className="h-5 w-40 bg-[#171717]" />
        <Skeleton className="mt-3 h-[20rem] rounded-[1rem] bg-[#171717]" />
      </div>
    ),
  }
);

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};
const DETAIL_SUMMARY_SKELETON_IDS = [
  "book-detail-summary-skeleton-1",
  "book-detail-summary-skeleton-2",
  "book-detail-summary-skeleton-3",
  "book-detail-summary-skeleton-4",
] as const;
const DETAIL_ASIDE_SKELETON_IDS = [
  "book-detail-aside-skeleton-1",
  "book-detail-aside-skeleton-2",
  "book-detail-aside-skeleton-3",
] as const;
const PDF_FILE_TYPES = new Set(["PREVIEW_PDF", "FORMATTED_PDF", "FINAL_PDF"]);
const FILE_TYPE_ORDER = [
  "RAW_MANUSCRIPT",
  "CLEANED_TEXT",
  "CLEANED_HTML",
  "PREVIEW_PDF",
  "FORMATTED_PDF",
  "FINAL_PDF",
  "ADMIN_GENERATED_DOCX",
  "COVER_DESIGN_DRAFT",
  "COVER_DESIGN_FINAL",
  "USER_UPLOADED_IMAGE",
] as const satisfies ReadonlyArray<BookFileVersion["fileType"]>;
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
const FILE_TYPE_LABELS: Partial<Record<BookFileVersion["fileType"], string>> = {
  RAW_MANUSCRIPT: "Raw Manuscript",
  CLEANED_TEXT: "Cleaned Text",
  CLEANED_HTML: "Cleaned HTML",
  PREVIEW_PDF: "Preview PDF",
  FORMATTED_PDF: "Formatted PDF",
  FINAL_PDF: "Final PDF",
  ADMIN_GENERATED_DOCX: "Admin Generated DOCX",
  COVER_DESIGN_DRAFT: "Cover Design Draft",
  COVER_DESIGN_FINAL: "Cover Design Final",
  USER_UPLOADED_IMAGE: "Uploaded Image",
};

type AdminBookDetailViewProps = {
  bookId: string;
};

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

function formatInteger(value: number | null | undefined, locale: string, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFileSize(
  value: number | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;

  const units = ["B", "KB", "MB", "GB"] as const;
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(resolveIntlLocale(locale), {
    maximumFractionDigits: size >= 10 || unitIndex === 0 ? 0 : 1,
  }).format(size)} ${units[unitIndex]}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
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

function resolveFileTypeLabel(fileType: BookFileVersion["fileType"]): string {
  return FILE_TYPE_LABELS[fileType] ?? humanizeAdminBookStatus(fileType);
}

function isPdfFile(file: BookFileVersion): boolean {
  return PDF_FILE_TYPES.has(file.fileType);
}

function groupBookFiles(files: BookFileVersion[]) {
  const buckets = new Map<BookFileVersion["fileType"], BookFileVersion[]>();

  for (const file of [...files].sort((left, right) => {
    const rightTime = new Date(right.createdAt).getTime();
    const leftTime = new Date(left.createdAt).getTime();
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return right.version - left.version;
  })) {
    const current = buckets.get(file.fileType) ?? [];
    current.push(file);
    buckets.set(file.fileType, current);
  }

  const grouped = FILE_TYPE_ORDER.map((fileType) => ({
    fileType,
    files: buckets.get(fileType) ?? [],
  })).filter((group) => group.files.length > 0);

  for (const [fileType, groupedFiles] of buckets.entries()) {
    if (FILE_TYPE_ORDER.includes(fileType)) {
      continue;
    }

    grouped.push({
      fileType,
      files: groupedFiles,
    });
  }

  return grouped;
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
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 font-sans text-xs font-medium",
        toneClassName,
        className
      )}
    >
      {label}
    </span>
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
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.95fr)]">
        <div className="grid min-w-0 gap-4">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {DETAIL_SUMMARY_SKELETON_IDS.map((skeletonId) => (
              <Skeleton key={skeletonId} className="h-36 rounded-[1.5rem] bg-[#171717]" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-[1.5rem] bg-[#171717]" />
          <Skeleton className="h-[34rem] rounded-[1.5rem] bg-[#171717]" />
        </div>
        <div className="grid gap-4">
          {DETAIL_ASIDE_SKELETON_IDS.map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-64 rounded-[1.5rem] bg-[#171717]" />
          ))}
        </div>
      </div>
    </section>
  );
}

export function AdminBookDetailView({ bookId }: AdminBookDetailViewProps) {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const detailQuery = useAdminBookDetail({
    bookId,
    enabled: Boolean(bookId),
  });
  const statusMutation = useAdminBookStatusMutation(bookId);
  const rejectMutation = useAdminBookRejectMutation(bookId);
  const resetProcessingMutation = useAdminBookResetProcessingMutation(bookId);
  const cancelProcessingMutation = useAdminBookCancelProcessingMutation(bookId);
  const htmlUploadMutation = useAdminBookHtmlUploadMutation(bookId);
  const downloadMutation = useAdminBookDownloadMutation(bookId);
  const fileVersionDownloadMutation = useAdminBookVersionFileDownloadMutation(bookId);
  const pdfVerifierPanelId = useId();
  const nextStatusId = useId();
  const statusReasonId = useId();
  const statusNoteId = useId();
  const rejectionReasonId = useId();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const book = detailQuery.data;
  const groupedFiles = book ? groupBookFiles(book.files) : [];
  const [selectedNextStatus, setSelectedNextStatus] = useState<BookStatus | "">("");
  const [statusReason, setStatusReason] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedPdfFileId, setSelectedPdfFileId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!book) return;

    const firstNextStatus = book.statusControl.nextAllowedStatuses[0] ?? "";
    setSelectedNextStatus((current) =>
      current && book.statusControl.nextAllowedStatuses.includes(current as BookStatus)
        ? current
        : firstNextStatus
    );
  }, [book]);

  useEffect(() => {
    if (!book || !selectedPdfFileId) {
      return;
    }

    const exists = book.files.some((file) => file.id === selectedPdfFileId);
    if (!exists) {
      setSelectedPdfFileId(null);
    }
  }, [book, selectedPdfFileId]);

  const selectedPdfFile =
    book?.files.find((file) => file.id === selectedPdfFileId && isPdfFile(file)) ?? null;
  const canDownloadFinalPdf = Boolean(
    book?.finalPdfUrl || book?.files.some((file) => file.fileType === "FINAL_PDF")
  );
  const statusSourceLabel = book
    ? book.statusSource === "production"
      ? tAdmin("books_detail_status_source_production")
      : tAdmin("books_detail_status_source_manuscript")
    : tAdmin("orders_detail_unknown");

  async function handleStatusAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book || !selectedNextStatus) return;

    setConflictMessage(null);

    try {
      const response = await statusMutation.mutateAsync({
        nextStatus: selectedNextStatus,
        expectedVersion: book.statusControl.expectedVersion,
        reason: statusReason.trim() || undefined,
        note: statusNote.trim() || undefined,
      });

      setStatusReason("");
      setStatusNote("");
      toast.success(tAdmin("books_detail_status_success"), {
        description: tAdmin("books_detail_status_success_description", {
          status: humanizeAdminBookStatus(response.nextStatus),
        }),
      });
    } catch (error) {
      if (isAdminBookConflictError(error)) {
        const message = getErrorMessage(error, tAdmin("books_detail_conflict_description"));
        setConflictMessage(message);
        toast.error(tAdmin("books_detail_conflict_title"), {
          description: message,
        });
        return;
      }

      toast.error(tAdmin("books_detail_status_error_title"), {
        description: getErrorMessage(error, tAdmin("books_detail_status_error_description")),
      });
    }
  }

  async function handleRejectBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    const normalizedReason = rejectionReason.trim();
    if (!normalizedReason) return;

    setConflictMessage(null);

    try {
      const response = await rejectMutation.mutateAsync({
        expectedVersion: book.statusControl.expectedVersion,
        rejectionReason: normalizedReason,
      });

      setRejectionReason("");
      setIsRejectDialogOpen(false);
      toast.success(tAdmin("books_detail_reject_success"), {
        description: tAdmin("books_detail_reject_success_description", {
          status: humanizeAdminBookStatus(response.nextStatus),
        }),
      });
    } catch (error) {
      if (isAdminBookConflictError(error)) {
        const message = getErrorMessage(error, tAdmin("books_detail_conflict_description"));
        setConflictMessage(message);
        toast.error(tAdmin("books_detail_conflict_title"), {
          description: message,
        });
        return;
      }

      toast.error(tAdmin("books_detail_reject_error_title"), {
        description: getErrorMessage(error, tAdmin("books_detail_reject_error_description")),
      });
    }
  }

  async function handleResetProcessing() {
    if (!book) return;

    setConflictMessage(null);

    try {
      await resetProcessingMutation.mutateAsync({
        expectedVersion: book.statusControl.expectedVersion,
      });

      toast.success(tAdmin("books_detail_reset_processing_success"), {
        description: tAdmin("books_detail_reset_processing_success_description"),
      });
    } catch (error) {
      if (isAdminBookConflictError(error)) {
        const message = getErrorMessage(error, tAdmin("books_detail_conflict_description"));
        setConflictMessage(message);
        toast.error(tAdmin("books_detail_conflict_title"), {
          description: message,
        });
        return;
      }

      toast.error(tAdmin("books_detail_reset_processing_error_title"), {
        description: getErrorMessage(
          error,
          tAdmin("books_detail_reset_processing_error_description")
        ),
      });
    }
  }

  async function handleCancelProcessing() {
    if (!book) return;

    setConflictMessage(null);

    try {
      await cancelProcessingMutation.mutateAsync({
        expectedVersion: book.statusControl.expectedVersion,
      });

      toast.success(tAdmin("books_detail_cancel_processing_success"), {
        description: tAdmin("books_detail_cancel_processing_success_description"),
      });
    } catch (error) {
      if (isAdminBookConflictError(error)) {
        const message = getErrorMessage(error, tAdmin("books_detail_conflict_description"));
        setConflictMessage(message);
        toast.error(tAdmin("books_detail_conflict_title"), {
          description: message,
        });
        return;
      }

      toast.error(tAdmin("books_detail_cancel_processing_error_title"), {
        description: getErrorMessage(
          error,
          tAdmin("books_detail_cancel_processing_error_description")
        ),
      });
    }
  }

  async function handleUploadInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !book) return;

    const validation = validateAdminBookHtmlFile(file);
    if (validation === "unsupported") {
      toast.error(tAdmin("books_detail_upload_error_title"), {
        description: tAdmin("books_detail_upload_validation_unsupported"),
      });
      return;
    }

    if (validation === "empty") {
      toast.error(tAdmin("books_detail_upload_error_title"), {
        description: tAdmin("books_detail_upload_validation_empty"),
      });
      return;
    }

    if (validation === "size") {
      toast.error(tAdmin("books_detail_upload_error_title"), {
        description: tAdmin("books_detail_upload_validation_size"),
      });
      return;
    }

    setConflictMessage(null);
    setUploadFileName(file.name);
    setUploadProgress(0);

    try {
      await htmlUploadMutation.mutateAsync({
        file,
        expectedVersion: book.statusControl.expectedVersion,
        onProgress: (percentage) => {
          setUploadProgress(percentage);
        },
      });

      setUploadProgress(100);
      toast.success(tAdmin("books_detail_upload_success"), {
        description: tAdmin("books_detail_upload_success_description"),
      });
    } catch (error) {
      setUploadProgress(null);

      if (isAdminBookConflictError(error)) {
        const message = getErrorMessage(error, tAdmin("books_detail_conflict_description"));
        setConflictMessage(message);
        toast.error(tAdmin("books_detail_conflict_title"), {
          description: message,
        });
        return;
      }

      toast.error(tAdmin("books_detail_upload_error_title"), {
        description: getErrorMessage(error, tAdmin("books_detail_upload_error_description")),
      });
    }
  }

  async function handleDownload(fileType: "raw" | "cleaned" | "final-pdf") {
    try {
      await downloadMutation.mutateAsync(fileType);
      toast.success(
        fileType === "raw"
          ? tAdmin("books_detail_download_raw_success")
          : fileType === "cleaned"
            ? tAdmin("books_detail_download_cleaned_success")
            : tAdmin("books_detail_download_final_pdf_success")
      );
    } catch (error) {
      toast.error(tAdmin("books_detail_download_error_title"), {
        description: getErrorMessage(error, tAdmin("books_detail_download_error_description")),
      });
    }
  }

  async function handleFileVersionDownload(fileId: string) {
    try {
      await fileVersionDownloadMutation.mutateAsync(fileId);
      toast.success(tAdmin("books_detail_file_download_success"));
    } catch (error) {
      toast.error(tAdmin("books_detail_download_error_title"), {
        description: getErrorMessage(error, tAdmin("books_detail_download_error_description")),
      });
    }
  }

  if (detailQuery.isInitialLoading) {
    return <DetailSkeleton />;
  }

  if (detailQuery.isError || !book) {
    return (
      <section className="grid min-w-0 gap-4">
        <div className="rounded-[1.75rem] border border-[#4A1616] bg-[linear-gradient(180deg,#160707_0%,#0C0A0A_100%)] p-6 md:p-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 size-5 shrink-0 text-[#ff6b6b]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold tracking-tight text-white">
                {tAdmin("books_detail_error_title")}
              </p>
              <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#FFC5C5]">
                {detailQuery.error instanceof Error && detailQuery.error.message
                  ? detailQuery.error.message
                  : tAdmin("books_detail_error_description")}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => detailQuery.refetch()}
                  className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                >
                  <RefreshCcw className="size-4" aria-hidden="true" />
                  {tAdmin("books_detail_refetch")}
                </Button>
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                >
                  <Link href="/admin/books">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {tAdmin("books_back_to_list")}
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
                <Link href="/admin/books">
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  {tAdmin("books_back_to_list")}
                </Link>
              </Button>

              <p className="font-sans mt-4 text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
                {tAdmin("panel_label")}
              </p>
              <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                {book.title || tAdmin("books_title_untitled")}
              </h1>
              <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
                {tAdmin("books_detail_description")}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <AdminBookStatusBadge
                  status={book.displayStatus}
                  label={humanizeAdminBookStatus(book.displayStatus)}
                />
                <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                  {statusSourceLabel}
                </span>
                {book.processing.isActive ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#007eff]/35 bg-[#007eff]/12 px-3 py-1 font-sans text-xs text-[#7bb9ff]">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    {tAdmin("books_detail_processing_active")}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:max-w-[28rem]">
              <DetailValue
                label={tAdmin("books_detail_meta_uploaded")}
                value={formatDateTime(book.uploadedAt, locale, tAdmin("orders_date_unavailable"))}
              />
              <DetailValue
                label={tAdmin("books_detail_meta_updated")}
                value={formatDateTime(book.updatedAt, locale, tAdmin("orders_date_unavailable"))}
              />
            </div>
          </div>
        </header>

        {conflictMessage ? (
          <div className="rounded-[1.5rem] border border-[#6b4b14] bg-[linear-gradient(180deg,#1f1405_0%,#120e08_100%)] p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-1 size-5 shrink-0 text-[#facc15]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-display text-xl font-semibold tracking-tight text-white">
                      {tAdmin("books_detail_conflict_title")}
                    </p>
                    <p className="font-sans mt-2 text-sm leading-6 text-[#F5DF9D]">
                      {conflictMessage}
                    </p>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setConflictMessage(null);
                  detailQuery.refetch();
                }}
                className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
              >
                <RefreshCcw className="size-4" aria-hidden="true" />
                {tAdmin("books_detail_conflict_refresh")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.95fr)]">
          <div className="grid min-w-0 gap-4">
            <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <MetricTile
                label={tAdmin("books_detail_metric_pages")}
                value={formatInteger(
                  book.pageCount,
                  locale,
                  tAdmin("books_detail_metric_unavailable")
                )}
                hint={tAdmin("books_detail_metric_pages_hint")}
              />
              <MetricTile
                label={tAdmin("books_detail_metric_words")}
                value={formatInteger(
                  book.wordCount,
                  locale,
                  tAdmin("books_detail_metric_unavailable")
                )}
                hint={tAdmin("books_detail_metric_words_hint")}
              />
              <MetricTile
                label={tAdmin("books_detail_metric_size")}
                value={book.pageSize ?? tAdmin("books_detail_metric_unavailable")}
                hint={tAdmin("books_detail_metric_size_hint")}
              />
              <MetricTile
                label={tAdmin("books_detail_metric_font")}
                value={
                  book.fontSize
                    ? tAdmin("books_detail_metric_font_value", {
                        size: String(book.fontSize),
                      })
                    : tAdmin("books_detail_metric_unavailable")
                }
                hint={tAdmin("books_detail_metric_font_hint")}
              />
            </section>

            <InfoCard
              eyebrow={tAdmin("books_detail_section_summary_eyebrow")}
              title={tAdmin("books_detail_section_summary")}
              description={tAdmin("books_detail_section_summary_description")}
            >
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                <DetailValue label={tAdmin("books_table_author")} value={book.author.fullName} />
                <DetailValue label={tAdmin("orders_table_email")} value={book.author.email} />
                <DetailValue
                  label={tAdmin("orders_detail_customer_language")}
                  value={book.author.preferredLanguage.toUpperCase()}
                />
                <DetailValue
                  label={tAdmin("books_table_order_ref")}
                  value={book.order.orderNumber}
                />
                <DetailValue
                  label={tAdmin("orders_table_status")}
                  value={humanizeAdminBookStatus(book.order.status)}
                />
                <DetailValue
                  label={tAdmin("orders_detail_book_version")}
                  value={formatInteger(book.version, locale, tAdmin("orders_detail_unknown"))}
                />
                <DetailValue
                  label={tAdmin("orders_detail_meta_created")}
                  value={formatDateTime(book.createdAt, locale, tAdmin("orders_date_unavailable"))}
                />
                <DetailValue
                  label={tAdmin("books_detail_processing_step")}
                  value={
                    book.processing.currentStep
                      ? humanizeAdminBookStatus(book.processing.currentStep)
                      : tAdmin("books_detail_processing_idle")
                  }
                />
                <DetailValue
                  label={tAdmin("books_detail_processing_trigger")}
                  value={
                    book.processing.trigger
                      ? humanizeAdminBookStatus(book.processing.trigger)
                      : tAdmin("orders_detail_unknown")
                  }
                />
              </div>

              {(book.rejectionReason || book.latestProcessingError) && (
                <div className="mt-4 grid gap-3">
                  {book.rejectionReason ? (
                    <div className="rounded-[1.35rem] border border-[#5B1818] bg-[#180B0B] p-4">
                      <div className="flex items-start gap-3">
                        <CircleAlert
                          className="mt-1 size-4 shrink-0 text-[#ff6b6b]"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#FF9F9F]">
                            {tAdmin("orders_detail_book_rejection")}
                          </p>
                          <p className="font-sans mt-2 text-sm leading-6 text-[#FFD2D2]">
                            {book.rejectionReason}
                          </p>
                          {book.rejectedAt ? (
                            <p className="font-sans mt-2 text-xs text-[#D59A9A]">
                              {formatDateTime(
                                book.rejectedAt,
                                locale,
                                tAdmin("orders_date_unavailable")
                              )}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {book.latestProcessingError ? (
                    <div className="rounded-[1.35rem] border border-[#6B4B14] bg-[#171006] p-4">
                      <div className="flex items-start gap-3">
                        <CircleAlert
                          className="mt-1 size-4 shrink-0 text-[#facc15]"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#F5DF9D]">
                            {tAdmin("books_detail_processing_error")}
                          </p>
                          <p className="font-sans mt-2 text-sm leading-6 text-[#F9E8BC]">
                            {book.latestProcessingError}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  className="min-h-10 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                >
                  <Link href={book.order.detailUrl}>{tAdmin("books_detail_order_action")}</Link>
                </Button>
              </div>
            </InfoCard>

            <InfoCard
              eyebrow={tAdmin("books_detail_section_files_eyebrow")}
              title={tAdmin("books_detail_section_files")}
              description={tAdmin("books_detail_section_files_description")}
            >
              {groupedFiles.length === 0 ? (
                <p className="font-sans text-sm text-[#8F8F8F]">
                  {tAdmin("books_detail_empty_files")}
                </p>
              ) : (
                <div className="space-y-5">
                  {groupedFiles.map((group) => (
                    <section key={group.fileType} className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-display text-lg font-semibold tracking-tight text-white">
                            {resolveFileTypeLabel(group.fileType)}
                          </h3>
                          <p className="font-sans mt-1 text-xs text-[#8F8F8F]">
                            {tAdmin("books_detail_file_versions", {
                              count: String(group.files.length),
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {group.files.map((file) => {
                          const pdfSelected = selectedPdfFileId === file.id;

                          return (
                            <article
                              key={file.id}
                              className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4"
                            >
                              <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                                      {resolveFileTypeLabel(file.fileType)}
                                    </span>
                                    <span className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 font-sans text-xs text-[#D6D6D6]">
                                      {tAdmin("books_detail_file_version", {
                                        version: String(file.version),
                                      })}
                                    </span>
                                  </div>
                                  <p className="font-display mt-3 text-lg font-semibold leading-tight tracking-tight text-white [overflow-wrap:anywhere] sm:text-xl lg:text-2xl">
                                    {file.fileName || resolveFileTypeLabel(file.fileType)}
                                  </p>
                                </div>

                                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                                  {isPdfFile(file) ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        setSelectedPdfFileId((current) =>
                                          current === file.id ? null : file.id
                                        )
                                      }
                                      aria-controls={pdfVerifierPanelId}
                                      aria-pressed={pdfSelected}
                                      className="min-h-10 w-full justify-center rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818] sm:w-auto"
                                    >
                                      <Eye className="size-4" aria-hidden="true" />
                                      {pdfSelected
                                        ? tAdmin("books_detail_file_actions_hide_verifier")
                                        : tAdmin("books_detail_file_actions_verify")}
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleFileVersionDownload(file.id)}
                                    disabled={fileVersionDownloadMutation.isPending}
                                    className="min-h-10 w-full justify-center rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white hover:border-[#3A3A3A] hover:bg-[#181818] sm:w-auto"
                                  >
                                    {fileVersionDownloadMutation.isPending &&
                                    fileVersionDownloadMutation.variables === file.id ? (
                                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <Download className="size-4" aria-hidden="true" />
                                    )}
                                    {tAdmin("books_detail_file_actions_open")}
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                                <DetailValue
                                  label={tAdmin("books_detail_file_created")}
                                  value={formatDateTime(
                                    file.createdAt,
                                    locale,
                                    tAdmin("orders_date_unavailable")
                                  )}
                                />
                                <DetailValue
                                  label={tAdmin("books_detail_file_creator")}
                                  value={file.createdBy ?? tAdmin("orders_detail_unknown")}
                                />
                                <DetailValue
                                  label={tAdmin("books_detail_file_mime")}
                                  value={file.mimeType ?? tAdmin("orders_detail_unknown")}
                                />
                                <DetailValue
                                  label={tAdmin("books_detail_file_size")}
                                  value={formatFileSize(
                                    file.fileSize,
                                    locale,
                                    tAdmin("orders_detail_unknown")
                                  )}
                                />
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              <div className="mt-5">
                {selectedPdfFile ? (
                  <div
                    id={pdfVerifierPanelId}
                    className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4"
                  >
                    <div className="mb-4">
                      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
                        {tAdmin("books_detail_pdf_panel_eyebrow")}
                      </p>
                      <h3 className="font-display mt-2 text-xl font-semibold tracking-tight text-white">
                        {tAdmin("books_detail_pdf_panel_title")}
                      </h3>
                      <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF] [overflow-wrap:anywhere]">
                        {tAdmin("books_detail_pdf_panel_description", {
                          fileName:
                            selectedPdfFile.fileName ||
                            resolveFileTypeLabel(selectedPdfFile.fileType),
                        })}
                      </p>
                    </div>
                    <AdminBookPdfVerifier
                      fileName={
                        selectedPdfFile.fileName || resolveFileTypeLabel(selectedPdfFile.fileType)
                      }
                      fileUrl={selectedPdfFile.url}
                      emptyLabel={tAdmin("books_detail_pdf_empty")}
                      loadingLabel={tAdmin("books_detail_pdf_loading")}
                      errorLabel={tAdmin("books_detail_pdf_failed")}
                      pageLabel={tAdmin("books_detail_pdf_page", {
                        page: "{page}",
                        count: "{count}",
                      })}
                      previousLabel={tAdmin("books_detail_pdf_previous")}
                      nextLabel={tAdmin("books_detail_pdf_next")}
                    />
                  </div>
                ) : (
                  <div className="rounded-[1.35rem] border border-dashed border-[#2A2A2A] bg-[#0B0B0B] p-5">
                    <div className="flex items-start gap-3">
                      <FileText
                        className="mt-1 size-4 shrink-0 text-[#8C8C8C]"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="font-display text-lg font-semibold tracking-tight text-white">
                          {tAdmin("books_detail_pdf_placeholder")}
                        </p>
                        <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">
                          {tAdmin("books_detail_pdf_placeholder_description")}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </InfoCard>
          </div>

          <aside className="grid min-w-0 gap-4 self-start">
            <InfoCard
              eyebrow={tAdmin("books_detail_section_workflow_eyebrow")}
              title={tAdmin("books_detail_section_workflow")}
              description={tAdmin("books_detail_section_workflow_description")}
            >
              <div className="space-y-5">
                <div className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-white">
                    {tAdmin("books_detail_status_heading")}
                  </h3>
                  {book.statusControl.nextAllowedStatuses.length === 0 ? (
                    <p className="font-sans mt-3 text-sm text-[#8F8F8F]">
                      {tAdmin("books_detail_status_locked")}
                    </p>
                  ) : (
                    <form className="mt-4 space-y-4" onSubmit={handleStatusAdvance}>
                      <div>
                        <label
                          htmlFor={nextStatusId}
                          className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                        >
                          {tAdmin("books_detail_status_next_label")}
                        </label>
                        <select
                          id={nextStatusId}
                          value={selectedNextStatus}
                          onChange={(event) =>
                            setSelectedNextStatus(event.target.value as BookStatus | "")
                          }
                          aria-label={tAdmin("books_detail_status_next_label")}
                          disabled={statusMutation.isPending}
                          className="min-h-11 w-full rounded-2xl border border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white outline-none transition-colors duration-150 focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/25"
                        >
                          {book.statusControl.nextAllowedStatuses.map((status) => (
                            <option key={status} value={status}>
                              {humanizeAdminBookStatus(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={statusReasonId}
                          className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                        >
                          {tAdmin("books_detail_status_reason_label")}
                        </label>
                        <Input
                          id={statusReasonId}
                          value={statusReason}
                          onChange={(event) => setStatusReason(event.target.value)}
                          aria-label={tAdmin("books_detail_status_reason_label")}
                          disabled={statusMutation.isPending}
                          placeholder={tAdmin("books_detail_status_reason_placeholder")}
                          className="min-h-11 rounded-2xl border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={statusNoteId}
                          className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
                        >
                          {tAdmin("books_detail_status_note_label")}
                        </label>
                        <Textarea
                          id={statusNoteId}
                          value={statusNote}
                          onChange={(event) => setStatusNote(event.target.value)}
                          aria-label={tAdmin("books_detail_status_note_label")}
                          disabled={statusMutation.isPending}
                          placeholder={tAdmin("books_detail_status_note_placeholder")}
                          className="min-h-24 rounded-[1.25rem] border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={!selectedNextStatus || statusMutation.isPending}
                        className="min-h-11 w-full rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                      >
                        {statusMutation.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            {tAdmin("books_detail_status_submitting")}
                          </>
                        ) : (
                          tAdmin("books_detail_status_submit")
                        )}
                      </Button>
                    </form>
                  )}
                </div>

                <div className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-white">
                    {tAdmin("books_detail_reject_heading")}
                  </h3>
                  <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">
                    {book.statusControl.canRejectManuscript
                      ? tAdmin("books_detail_reject_description")
                      : tAdmin("books_detail_reject_locked")}
                  </p>
                  <Button
                    type="button"
                    disabled={!book.statusControl.canRejectManuscript || rejectMutation.isPending}
                    onClick={() => setIsRejectDialogOpen(true)}
                    aria-haspopup="dialog"
                    className="mt-4 min-h-11 w-full rounded-full bg-[#A32020] px-5 font-sans text-sm font-medium text-white hover:bg-[#8d1a1a] disabled:bg-[#1C1C1C] disabled:text-[#7D7D7D]"
                  >
                    {rejectMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("books_detail_reject_submitting")}
                      </>
                    ) : (
                      tAdmin("books_detail_reject_button")
                    )}
                  </Button>
                </div>

                <div className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-white">
                    {tAdmin("books_detail_reset_processing_heading")}
                  </h3>
                  <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">
                    {book.statusControl.canResetProcessing
                      ? tAdmin("books_detail_reset_processing_description")
                      : tAdmin("books_detail_reset_processing_locked")}
                  </p>
                  <Button
                    type="button"
                    disabled={
                      !book.statusControl.canResetProcessing || resetProcessingMutation.isPending
                    }
                    onClick={handleResetProcessing}
                    className="mt-4 min-h-11 w-full rounded-full bg-[#b45309] px-5 font-sans text-sm font-medium text-white hover:bg-[#92400e] disabled:bg-[#1C1C1C] disabled:text-[#7D7D7D]"
                  >
                    {resetProcessingMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("books_detail_reset_processing_submitting")}
                      </>
                    ) : (
                      tAdmin("books_detail_reset_processing_button")
                    )}
                  </Button>
                </div>

                <div className="rounded-[1.35rem] border border-[#A32020]/40 bg-[#0B0B0B] p-4">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-white">
                    {tAdmin("books_detail_cancel_processing_heading")}
                  </h3>
                  <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">
                    {book.statusControl.canCancelProcessing
                      ? tAdmin("books_detail_cancel_processing_description")
                      : tAdmin("books_detail_cancel_processing_locked")}
                  </p>
                  <Button
                    type="button"
                    disabled={
                      !book.statusControl.canCancelProcessing || cancelProcessingMutation.isPending
                    }
                    onClick={handleCancelProcessing}
                    className="mt-4 min-h-11 w-full rounded-full bg-[#A32020] px-5 font-sans text-sm font-medium text-white hover:bg-[#8d1a1a] disabled:bg-[#1C1C1C] disabled:text-[#7D7D7D]"
                  >
                    {cancelProcessingMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("books_detail_cancel_processing_submitting")}
                      </>
                    ) : (
                      tAdmin("books_detail_cancel_processing_button")
                    )}
                  </Button>
                </div>

                <div className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-white">
                    {tAdmin("books_detail_upload_title")}
                  </h3>
                  <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">
                    {book.statusControl.canUploadHtmlFallback
                      ? tAdmin("books_detail_upload_description")
                      : tAdmin("books_detail_upload_locked")}
                  </p>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept=".html,.htm,text/html"
                    aria-label={tAdmin("books_detail_upload_action")}
                    onChange={handleUploadInputChange}
                    className="sr-only"
                    tabIndex={-1}
                  />
                  <Button
                    type="button"
                    disabled={
                      !book.statusControl.canUploadHtmlFallback || htmlUploadMutation.isPending
                    }
                    onClick={() => uploadInputRef.current?.click()}
                    className="mt-4 min-h-11 w-full rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8] disabled:bg-[#1C1C1C] disabled:text-[#7D7D7D]"
                  >
                    {htmlUploadMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("books_detail_upload_submitting")}
                      </>
                    ) : (
                      <>
                        <Upload className="size-4" aria-hidden="true" />
                        {tAdmin("books_detail_upload_action")}
                      </>
                    )}
                  </Button>

                  {uploadProgress !== null ? (
                    <div className="mt-4 space-y-2" aria-live="polite" aria-atomic="true">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-sans text-xs text-[#BDBDBD]">
                          {uploadFileName || tAdmin("books_detail_upload_progress_label")}
                        </span>
                        <span className="font-sans text-xs text-[#D6D6D6]">{uploadProgress}%</span>
                      </div>
                      <Progress
                        value={uploadProgress}
                        aria-label={tAdmin("books_detail_upload_progress_label")}
                        className="h-2 rounded-full bg-[#1B1B1B] [&_[data-slot='progress-indicator']]:bg-[#007eff]"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.35rem] border border-[#202020] bg-[#0B0B0B] p-4">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-white">
                    {tAdmin("books_detail_download_title")}
                  </h3>
                  <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">
                    {tAdmin("books_detail_download_description")}
                  </p>
                  <div className="mt-4 grid gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDownload("raw")}
                      disabled={downloadMutation.isPending}
                      className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                    >
                      {downloadMutation.isPending && downloadMutation.variables === "raw" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="size-4" aria-hidden="true" />
                      )}
                      {tAdmin("books_detail_download_raw")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDownload("final-pdf")}
                      disabled={!canDownloadFinalPdf || downloadMutation.isPending}
                      className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818] disabled:bg-[#1C1C1C] disabled:text-[#7D7D7D]"
                    >
                      {downloadMutation.isPending && downloadMutation.variables === "final-pdf" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="size-4" aria-hidden="true" />
                      )}
                      {tAdmin("books_detail_download_final_pdf")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDownload("cleaned")}
                      disabled={downloadMutation.isPending}
                      className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                    >
                      {downloadMutation.isPending && downloadMutation.variables === "cleaned" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="size-4" aria-hidden="true" />
                      )}
                      {tAdmin("books_detail_download_cleaned")}
                    </Button>
                  </div>
                </div>
              </div>
            </InfoCard>
          </aside>
        </div>
      </motion.section>

      <Dialog
        open={isRejectDialogOpen}
        onOpenChange={(open) => {
          setIsRejectDialogOpen(open);
          if (!open) {
            setRejectionReason("");
          }
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-[1.75rem] border border-[#1D1D1D] bg-[#0B0B0B] p-6 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold tracking-tight text-white">
              {tAdmin("books_detail_reject_modal_title")}
            </DialogTitle>
            <DialogDescription className="font-sans text-sm leading-6 text-[#B4B4B4]">
              {tAdmin("books_detail_reject_modal_description")}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleRejectBook}>
            <div>
              <label
                htmlFor={rejectionReasonId}
                className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]"
              >
                {tAdmin("books_detail_reject_reason_label")}
              </label>
              <Textarea
                id={rejectionReasonId}
                required
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                aria-label={tAdmin("books_detail_reject_reason_label")}
                placeholder={tAdmin("books_detail_reject_reason_placeholder")}
                disabled={rejectMutation.isPending}
                className="min-h-36 rounded-[1.25rem] border-[#2A2A2A] bg-[#0B0B0B] font-sans text-white placeholder:text-[#6D6D6D] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/25"
              />
            </div>

            <DialogFooter className="pt-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRejectDialogOpen(false)}
                className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
              >
                {tAdmin("books_detail_reject_cancel")}
              </Button>
              <Button
                type="submit"
                disabled={rejectMutation.isPending || rejectionReason.trim().length === 0}
                className="min-h-11 rounded-full bg-[#A32020] px-5 font-sans text-sm font-medium text-white hover:bg-[#8d1a1a]"
              >
                {rejectMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {tAdmin("books_detail_reject_submitting")}
                  </>
                ) : (
                  tAdmin("books_detail_reject_confirm")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
