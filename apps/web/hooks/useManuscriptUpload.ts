"use client";

import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh, getApiV1BaseUrl } from "@/lib/fetch-with-refresh";
export const MAX_MANUSCRIPT_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MANUSCRIPT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const ALLOWED_MANUSCRIPT_EXTENSIONS = [".pdf", ".docx"] as const;

export type BookPageSize = "A4" | "A5";
export type BookFontSize = 11 | 12 | 14;

export interface BookSettingsResponse {
  id: string;
  title: string | null;
  pageSize: BookPageSize;
  fontSize: BookFontSize;
  wordCount: number | null;
  estimatedPages: number | null;
  updatedAt: string;
}

export interface BookManuscriptUploadResponse {
  bookId: string;
  title: string | null;
  fileId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: (typeof ALLOWED_MANUSCRIPT_MIME_TYPES)[number];
  pageSize: BookPageSize;
  fontSize: BookFontSize;
  wordCount: number;
  estimatedPages: number;
}

export interface UpdateBookSettingsInput {
  bookId: string;
  title?: string;
  pageSize: BookPageSize;
  fontSize: BookFontSize;
}

export interface UploadManuscriptInput {
  bookId: string;
  file: File;
  onProgress?: (percentage: number) => void;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export function normalizeBookPageSize(value: string | null | undefined): BookPageSize | null {
  return value === "A4" || value === "A5" ? value : null;
}

export function normalizeBookFontSize(value: number | null | undefined): BookFontSize | null {
  return value === 11 || value === 12 || value === 14 ? value : null;
}

export function isSupportedManuscriptFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_MANUSCRIPT_EXTENSIONS.some((extension) =>
    name.endsWith(extension)
  );
  if (!hasValidExtension) return false;

  if (!file.type) return true;
  return (ALLOWED_MANUSCRIPT_MIME_TYPES as readonly string[]).includes(file.type);
}

export function validateManuscriptFile(file: File): string | null {
  if (!isSupportedManuscriptFile(file)) {
    return "unsupported";
  }

  if (file.size <= 0) {
    return "empty";
  }

  if (file.size > MAX_MANUSCRIPT_FILE_BYTES) {
    return "size";
  }

  return null;
}

export async function updateBookSettings(
  payload: UpdateBookSettingsInput
): Promise<BookSettingsResponse> {
  const response = await fetchApiV1WithRefresh(
    `/books/${encodeURIComponent(payload.bookId)}/settings`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(payload.title ? { title: payload.title } : {}),
        pageSize: payload.pageSize,
        fontSize: payload.fontSize,
      }),
    }
  );

  if (!response.ok) {
    await throwApiError(response, "Unable to save manuscript settings");
  }

  return (await response.json()) as BookSettingsResponse;
}

function readXhrErrorMessage(xhr: XMLHttpRequest, fallback: string): string {
  const raw = xhr.responseText;
  if (!raw || raw.trim().length === 0) return fallback;

  try {
    const payload = JSON.parse(raw) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }

    if (Array.isArray(payload.message)) {
      const joined = payload.message
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .join(", ");
      if (joined.length > 0) return joined;
    }
  } catch {
    // Keep fallback below.
  }

  return fallback;
}

export async function uploadManuscriptWithProgress(
  payload: UploadManuscriptInput
): Promise<BookManuscriptUploadResponse> {
  return await new Promise<BookManuscriptUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_V1_BASE_URL}/books/${encodeURIComponent(payload.bookId)}/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!payload.onProgress || !event.lengthComputable || event.total <= 0) return;
      const percentage = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      payload.onProgress(percentage);
    };

    xhr.onerror = () => {
      reject(new Error("Unable to upload manuscript right now"));
    };

    xhr.onabort = () => {
      reject(new Error("Manuscript upload was cancelled"));
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText) as BookManuscriptUploadResponse;
          resolve(json);
        } catch {
          reject(new Error("Unexpected upload response from server"));
        }
        return;
      }

      reject(readXhrErrorMessage(xhr, "Unable to upload manuscript"));
    };

    const formData = new FormData();
    formData.append("file", payload.file);
    xhr.send(formData);
  }).catch((error) => {
    if (typeof error === "string") {
      throw new Error(error);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unable to upload manuscript");
  });
}
