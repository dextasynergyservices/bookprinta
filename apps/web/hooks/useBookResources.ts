"use client";

import { useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { dashboardHistoryQueryOptions } from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function toBooleanValue(value: unknown): boolean {
  return value === true;
}

function resolveBookId(bookId: string | null | undefined): string | null {
  if (typeof bookId !== "string") return null;
  const normalized = bookId.trim();
  return normalized.length > 0 ? normalized : null;
}

export type BookPreviewSummary = {
  bookId: string;
  previewPdfUrl: string;
  status: string | null;
  watermarked: boolean;
};

export type BookFileSummary = {
  id: string;
  fileType: string;
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  version: number;
  createdBy: string | null;
  createdAt: string | null;
};

export type BookFilesSummary = {
  bookId: string;
  files: BookFileSummary[];
};

function normalizeBookPreviewPayload(
  payload: unknown,
  requestedBookId: string
): BookPreviewSummary {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const source = data ?? root;
  const previewPdfUrl = toStringValue(source?.previewPdfUrl);

  if (!previewPdfUrl) {
    throw new Error("Preview PDF is not available right now");
  }

  return {
    bookId: toStringValue(source?.bookId) ?? requestedBookId,
    previewPdfUrl,
    status: toStringValue(source?.status),
    watermarked: toBooleanValue(source?.watermarked),
  };
}

function normalizeBookFilesPayload(payload: unknown, requestedBookId: string): BookFilesSummary {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const source = data ?? root;
  const files = toArray(source?.files)
    .map((value) => {
      const record = toRecord(value);
      if (!record) return null;

      const id = toStringValue(record.id);
      const fileType = toStringValue(record.fileType);
      const url = toStringValue(record.url);
      const version = toNumberValue(record.version);
      if (!id || !fileType || !url || version === null) {
        return null;
      }

      return {
        id,
        fileType,
        url,
        fileName: toStringValue(record.fileName),
        fileSize: toNumberValue(record.fileSize),
        mimeType: toStringValue(record.mimeType),
        version,
        createdBy: toStringValue(record.createdBy),
        createdAt: toStringValue(record.createdAt),
      } satisfies BookFileSummary;
    })
    .filter((value): value is BookFileSummary => Boolean(value));

  return {
    bookId: toStringValue(source?.bookId) ?? requestedBookId,
    files,
  };
}

export const bookResourceQueryKeys = {
  preview: (bookId: string) => ["book-resource", "preview", bookId] as const,
  files: (bookId: string) => ["book-resource", "files", bookId] as const,
};

export async function fetchBookPreview(params: {
  bookId: string;
  signal?: AbortSignal;
}): Promise<BookPreviewSummary> {
  const response = await fetchApiV1WithRefresh(
    `/books/${encodeURIComponent(params.bookId)}/preview`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: params.signal,
    }
  );

  if (!response.ok) {
    await throwApiError(response, "Unable to load preview right now");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeBookPreviewPayload(payload, params.bookId);
}

export async function fetchBookFiles(params: {
  bookId: string;
  signal?: AbortSignal;
}): Promise<BookFilesSummary> {
  const response = await fetchApiV1WithRefresh(
    `/books/${encodeURIComponent(params.bookId)}/files`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: params.signal,
    }
  );

  if (!response.ok) {
    await throwApiError(response, "Unable to load book files right now");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeBookFilesPayload(payload, params.bookId);
}

type UseBookResourceParams = {
  bookId?: string | null;
  enabled?: boolean;
};

export function useBookPreview({ bookId, enabled = false }: UseBookResourceParams) {
  const resolvedBookId = resolveBookId(bookId);

  return useQuery({
    queryKey: resolvedBookId
      ? bookResourceQueryKeys.preview(resolvedBookId)
      : ["book-resource", "preview"],
    meta: {
      sentryName: "fetchBookPreview",
      sentryEndpoint: "/api/v1/books/:id/preview",
    },
    queryFn: ({ signal }) => {
      if (!resolvedBookId) {
        throw new Error("Book id is required to fetch preview");
      }

      return fetchBookPreview({
        bookId: resolvedBookId,
        signal,
      });
    },
    ...dashboardHistoryQueryOptions,
    enabled: enabled && Boolean(resolvedBookId),
    refetchOnWindowFocus: false,
  });
}

export function useBookFiles({ bookId, enabled = false }: UseBookResourceParams) {
  const resolvedBookId = resolveBookId(bookId);
  const fallbackData: BookFilesSummary = {
    bookId: resolvedBookId ?? "",
    files: [],
  };

  const query = useQuery({
    queryKey: resolvedBookId
      ? bookResourceQueryKeys.files(resolvedBookId)
      : ["book-resource", "files"],
    meta: {
      sentryName: "fetchBookFiles",
      sentryEndpoint: "/api/v1/books/:id/files",
    },
    queryFn: ({ signal }) => {
      if (!resolvedBookId) {
        return Promise.resolve(fallbackData);
      }

      return fetchBookFiles({
        bookId: resolvedBookId,
        signal,
      });
    },
    ...dashboardHistoryQueryOptions,
    enabled: enabled && Boolean(resolvedBookId),
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    data: query.data ?? fallbackData,
  };
}
