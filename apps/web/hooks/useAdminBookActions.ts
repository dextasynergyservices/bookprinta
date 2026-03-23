"use client";

import type {
  AdminBookDownloadFileType,
  AdminBookHtmlUploadBodyInput,
  AdminBookHtmlUploadResponse,
  AdminCancelProcessingInput,
  AdminCancelProcessingResponse,
  AdminRejectBookInput,
  AdminRejectBookResponse,
  AdminResetProcessingInput,
  AdminResetProcessingResponse,
  AdminUpdateBookStatusInput,
  AdminUpdateBookStatusResponse,
  AuthorizeAdminBookHtmlUploadResponse,
  FinalizeAdminBookHtmlUploadResponse,
} from "@bookprinta/shared";
import { ADMIN_BOOK_HTML_UPLOAD_MAX_BYTES } from "@bookprinta/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";
import { adminBooksQueryKeys } from "./useAdminBooks";

const ADMIN_BOOK_HTML_EXTENSIONS = [".html", ".htm"] as const;

type ApiErrorPayload = {
  message?: unknown;
  error?: {
    message?: unknown;
  };
};

type UpdateAdminBookStatusVariables = {
  bookId: string;
  input: AdminUpdateBookStatusInput;
};

type RejectAdminBookVariables = {
  bookId: string;
  input: AdminRejectBookInput;
};

type ResetAdminBookProcessingVariables = {
  bookId: string;
  input: AdminResetProcessingInput;
};

type CancelAdminBookProcessingVariables = {
  bookId: string;
  input: AdminCancelProcessingInput;
};

type RequestAdminBookHtmlUploadVariables = {
  bookId: string;
  input: AdminBookHtmlUploadBodyInput;
};

type DownloadAdminBookFileVariables = {
  bookId: string;
  fileType: AdminBookDownloadFileType;
};

type DownloadAdminBookVersionFileVariables = {
  bookId: string;
  fileId: string;
};

type UploadAdminBookHtmlInput = {
  file: File;
  expectedVersion: number;
  onProgress?: (percentage: number) => void;
};

type AdminHtmlUploadValidationError = "unsupported" | "empty" | "size";

type CloudinarySignedUploadPayload = NonNullable<AuthorizeAdminBookHtmlUploadResponse["upload"]>;

export class AdminBookConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminBookConflictError";
  }
}

function extractErrorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  if (typeof payload?.error?.message === "string" && payload.error.message.trim().length > 0) {
    return payload.error.message;
  }

  if (typeof payload?.message === "string" && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (Array.isArray(payload?.message)) {
    const joined = payload.message
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .join(", ");

    if (joined.length > 0) {
      return joined;
    }
  }

  return fallback;
}

async function throwAdminBookApiError(response: Response, fallback: string): Promise<never> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const message = extractErrorMessage(payload, fallback);

  if (response.status === 409) {
    throw new AdminBookConflictError(message);
  }

  throw new Error(message);
}

function readXhrErrorMessage(xhr: XMLHttpRequest, fallback: string): string {
  const raw = xhr.responseText;
  if (!raw || raw.trim().length === 0) return fallback;

  try {
    const payload = JSON.parse(raw) as ApiErrorPayload;
    return extractErrorMessage(payload, fallback);
  } catch {
    return fallback;
  }
}

function readContentDispositionFileName(header: string | null): string | null {
  if (!header) return null;

  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

function sanitizeDownloadFileName(fileName: string | null | undefined, fallback: string): string {
  const value = fileName?.trim();
  if (!value) return fallback;

  let sanitized = "";

  for (const character of value) {
    const characterCode = character.charCodeAt(0);
    sanitized += characterCode <= 31 || '<>:"/\\|?*'.includes(character) ? "-" : character;
  }

  return sanitized;
}

function validateAdminBookHtmlExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return ADMIN_BOOK_HTML_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function validateAdminBookHtmlFile(file: File): AdminHtmlUploadValidationError | null {
  if (!validateAdminBookHtmlExtension(file.name)) {
    return "unsupported";
  }

  if (file.size <= 0) {
    return "empty";
  }

  if (file.size > ADMIN_BOOK_HTML_UPLOAD_MAX_BYTES) {
    return "size";
  }

  return null;
}

async function triggerBrowserDownload(response: Response, fallbackFileName: string): Promise<void> {
  const fileName = sanitizeDownloadFileName(
    readContentDispositionFileName(response.headers.get("content-disposition")),
    fallbackFileName
  );
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}

async function updateAdminBookStatus({
  bookId,
  input,
}: UpdateAdminBookStatusVariables): Promise<AdminUpdateBookStatusResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}/status`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to update the book status right now.");
  }

  if (!response.ok) {
    await throwAdminBookApiError(response, "Unable to update the book status");
  }

  return (await response.json()) as AdminUpdateBookStatusResponse;
}

async function rejectAdminBook({
  bookId,
  input,
}: RejectAdminBookVariables): Promise<AdminRejectBookResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}/reject`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to reject the manuscript right now.");
  }

  if (!response.ok) {
    await throwAdminBookApiError(response, "Unable to reject the manuscript");
  }

  return (await response.json()) as AdminRejectBookResponse;
}

async function resetAdminBookProcessing({
  bookId,
  input,
}: ResetAdminBookProcessingVariables): Promise<AdminResetProcessingResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}/reset-processing`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to reset processing right now.");
  }

  if (!response.ok) {
    await throwAdminBookApiError(response, "Unable to reset processing");
  }

  return (await response.json()) as AdminResetProcessingResponse;
}

async function cancelAdminBookProcessing({
  bookId,
  input,
}: CancelAdminBookProcessingVariables): Promise<AdminCancelProcessingResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}/cancel-processing`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to cancel processing right now.");
  }

  if (!response.ok) {
    await throwAdminBookApiError(response, "Unable to cancel processing");
  }

  return (await response.json()) as AdminCancelProcessingResponse;
}

async function requestAdminBookHtmlUpload({
  bookId,
  input,
}: RequestAdminBookHtmlUploadVariables): Promise<AdminBookHtmlUploadResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}/upload-html`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to process the HTML upload right now.");
  }

  if (!response.ok) {
    await throwAdminBookApiError(response, "Unable to process the HTML upload");
  }

  return (await response.json()) as AdminBookHtmlUploadResponse;
}

async function uploadFileToCloudinary(params: {
  file: File;
  upload: CloudinarySignedUploadPayload;
  onProgress?: (percentage: number) => void;
}): Promise<{ secureUrl: string; publicId: string }> {
  return await new Promise<{ secureUrl: string; publicId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${params.upload.cloudName}/${params.upload.resourceType}/upload`
    );

    xhr.upload.onprogress = (event) => {
      if (!params.onProgress || !event.lengthComputable || event.total <= 0) {
        return;
      }

      const percentage = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      params.onProgress(percentage);
    };

    xhr.onerror = () => {
      reject(new Error("Unable to upload the HTML file right now."));
    };

    xhr.onabort = () => {
      reject(new Error("The HTML upload was cancelled."));
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText) as {
            secure_url?: unknown;
            public_id?: unknown;
          };

          if (
            typeof payload.secure_url === "string" &&
            payload.secure_url.trim().length > 0 &&
            typeof payload.public_id === "string" &&
            payload.public_id.trim().length > 0
          ) {
            resolve({
              secureUrl: payload.secure_url,
              publicId: payload.public_id,
            });
            return;
          }
        } catch {
          // Keep fallback below.
        }

        reject(new Error("Unexpected upload response from Cloudinary."));
        return;
      }

      reject(new Error(readXhrErrorMessage(xhr, "Unable to upload the HTML file right now.")));
    };

    const formData = new FormData();
    formData.append("file", params.file);
    formData.append("api_key", params.upload.apiKey);
    formData.append("timestamp", String(params.upload.timestamp));
    formData.append("signature", params.upload.signature);
    formData.append("folder", params.upload.folder);
    formData.append("public_id", params.upload.publicId);

    if (params.upload.eager) {
      formData.append("eager", params.upload.eager);
    }

    if (params.upload.tags && params.upload.tags.length > 0) {
      formData.append("tags", params.upload.tags.join(","));
    }

    xhr.send(formData);
  });
}

async function uploadAdminBookHtml({
  bookId,
  file,
  expectedVersion,
  onProgress,
}: UploadAdminBookHtmlInput & { bookId: string }): Promise<FinalizeAdminBookHtmlUploadResponse> {
  const authorizeResponse = await requestAdminBookHtmlUpload({
    bookId,
    input: {
      action: "authorize",
      fileName: file.name,
      fileSize: file.size,
      mimeType: "text/html",
    },
  });

  if (authorizeResponse.action !== "authorize" || !authorizeResponse.upload) {
    throw new Error("Unable to authorize the HTML upload.");
  }

  const uploadedFile = await uploadFileToCloudinary({
    file,
    upload: authorizeResponse.upload,
    onProgress,
  });

  const finalizeResponse = await requestAdminBookHtmlUpload({
    bookId,
    input: {
      action: "finalize",
      expectedVersion,
      fileName: file.name,
      fileSize: file.size,
      mimeType: "text/html",
      secureUrl: uploadedFile.secureUrl,
      publicId: uploadedFile.publicId,
    },
  });

  if (finalizeResponse.action !== "finalize") {
    throw new Error("Unable to finalize the HTML upload.");
  }

  return finalizeResponse;
}

export async function downloadAdminBookFile({
  bookId,
  fileType,
}: DownloadAdminBookFileVariables): Promise<void> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}/download/${fileType}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to download the requested file right now.");
  }

  if (!response.ok) {
    await throwAdminBookApiError(response, "Unable to download the requested file");
  }

  await triggerBrowserDownload(
    response,
    fileType === "raw"
      ? "book-manuscript"
      : fileType === "cleaned"
        ? "book-cleaned-html"
        : "book-final-pdf"
  );
}

export async function downloadAdminBookVersionFile({
  bookId,
  fileId,
}: DownloadAdminBookVersionFileVariables): Promise<void> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/books/${bookId}/files/${fileId}/download`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to download the requested file right now.");
  }

  if (!response.ok) {
    await throwAdminBookApiError(response, "Unable to download the requested file");
  }

  await triggerBrowserDownload(response, "book-file");
}

function createInvalidationTargets(bookId: string) {
  return [
    {
      queryKey: adminBooksQueryKeys.detail(bookId),
    },
    {
      queryKey: adminBooksQueryKeys.all,
    },
  ] as const;
}

export function useAdminBookStatusMutation(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminUpdateBookStatusInput) =>
      updateAdminBookStatus({
        bookId,
        input,
      }),
    onSuccess: async () => {
      await Promise.all(
        createInvalidationTargets(bookId).map((target) => queryClient.invalidateQueries(target))
      );
    },
  });
}

export function useAdminBookRejectMutation(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminRejectBookInput) =>
      rejectAdminBook({
        bookId,
        input,
      }),
    onSuccess: async () => {
      await Promise.all(
        createInvalidationTargets(bookId).map((target) => queryClient.invalidateQueries(target))
      );
    },
  });
}

export function useAdminBookResetProcessingMutation(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminResetProcessingInput) =>
      resetAdminBookProcessing({
        bookId,
        input,
      }),
    onSuccess: async () => {
      await Promise.all(
        createInvalidationTargets(bookId).map((target) => queryClient.invalidateQueries(target))
      );
    },
  });
}

export function useAdminBookCancelProcessingMutation(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminCancelProcessingInput) =>
      cancelAdminBookProcessing({
        bookId,
        input,
      }),
    onSuccess: async () => {
      await Promise.all(
        createInvalidationTargets(bookId).map((target) => queryClient.invalidateQueries(target))
      );
    },
  });
}

export function useAdminBookHtmlUploadMutation(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UploadAdminBookHtmlInput) =>
      uploadAdminBookHtml({
        ...input,
        bookId,
      }),
    onSuccess: async () => {
      await Promise.all(
        createInvalidationTargets(bookId).map((target) => queryClient.invalidateQueries(target))
      );
    },
  });
}

export function useAdminBookDownloadMutation(bookId: string) {
  return useMutation({
    mutationFn: (fileType: AdminBookDownloadFileType) =>
      downloadAdminBookFile({
        bookId,
        fileType,
      }),
  });
}

export function useAdminBookVersionFileDownloadMutation(bookId: string) {
  return useMutation({
    mutationFn: (fileId: string) =>
      downloadAdminBookVersionFile({
        bookId,
        fileId,
      }),
  });
}

export function isAdminBookConflictError(error: unknown): error is AdminBookConflictError {
  return error instanceof AdminBookConflictError;
}
