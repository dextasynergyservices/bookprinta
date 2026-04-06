import type {
  AdminAuthorizeShowcaseCoverUploadResponse,
  AdminCreateShowcaseCategoryInput,
  AdminCreateShowcaseEntryInput,
  AdminDeleteShowcaseCategoryResponse,
  AdminDeleteShowcaseEntryResponse,
  AdminFinalizeShowcaseCoverUploadResponse,
  AdminShowcaseCategoriesListResponse,
  AdminShowcaseCoverUploadBodyInput,
  AdminShowcaseCoverUploadMimeType,
  AdminShowcaseCoverUploadResponse,
  AdminShowcaseEntriesListQuery,
  AdminShowcaseEntriesListResponse,
  AdminShowcaseImageUploadTarget,
  AdminShowcaseUserSearchQuery,
  AdminShowcaseUserSearchResponse,
  AdminUpdateShowcaseCategoryInput,
  AdminUpdateShowcaseEntryInput,
} from "@bookprinta/shared";
import {
  ADMIN_SHOWCASE_COVER_UPLOAD_MAX_BYTES,
  AdminFinalizeShowcaseCoverUploadResponseSchema,
} from "@bookprinta/shared";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

function buildParamsFromEntriesListQuery(query: AdminShowcaseEntriesListQuery): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(query.limit),
    sort: query.sort,
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.q) params.set("q", query.q);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (typeof query.isFeatured === "boolean") params.set("isFeatured", String(query.isFeatured));

  return params;
}

function buildParamsFromUserSearchQuery(query: AdminShowcaseUserSearchQuery): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(query.limit),
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.q) params.set("q", query.q);

  return params;
}

export async function fetchAdminShowcaseCategories(
  input: { signal?: AbortSignal } = {}
): Promise<AdminShowcaseCategoriesListResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/showcase-categories", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load showcase categories right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load showcase categories");
  }

  return (await response.json()) as AdminShowcaseCategoriesListResponse;
}

export async function createAdminShowcaseCategory(
  input: AdminCreateShowcaseCategoryInput
): Promise<AdminShowcaseCategoriesListResponse["categories"][number]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/showcase-categories", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create showcase category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create showcase category");
  }

  return (await response.json()) as AdminShowcaseCategoriesListResponse["categories"][number];
}

export async function updateAdminShowcaseCategory(params: {
  categoryId: string;
  input: AdminUpdateShowcaseCategoryInput;
}): Promise<AdminShowcaseCategoriesListResponse["categories"][number]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/showcase-categories/${encodeURIComponent(params.categoryId)}`,
      {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.input),
      }
    );
  } catch {
    throw new Error("Unable to update showcase category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update showcase category");
  }

  return (await response.json()) as AdminShowcaseCategoriesListResponse["categories"][number];
}

export async function deleteAdminShowcaseCategory(
  categoryId: string
): Promise<AdminDeleteShowcaseCategoryResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/showcase-categories/${encodeURIComponent(categoryId)}`,
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }
    );
  } catch {
    throw new Error("Unable to delete showcase category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete showcase category");
  }

  return (await response.json()) as AdminDeleteShowcaseCategoryResponse;
}

export async function fetchAdminShowcaseEntries(
  query: AdminShowcaseEntriesListQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminShowcaseEntriesListResponse> {
  const params = buildParamsFromEntriesListQuery(query);
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/showcase?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load showcase entries right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load showcase entries");
  }

  return (await response.json()) as AdminShowcaseEntriesListResponse;
}

export async function createAdminShowcaseEntry(
  input: AdminCreateShowcaseEntryInput
): Promise<AdminShowcaseEntriesListResponse["items"][number]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/showcase", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create showcase entry right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create showcase entry");
  }

  return (await response.json()) as AdminShowcaseEntriesListResponse["items"][number];
}

export async function updateAdminShowcaseEntry(params: {
  entryId: string;
  input: AdminUpdateShowcaseEntryInput;
}): Promise<AdminShowcaseEntriesListResponse["items"][number]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/showcase/${encodeURIComponent(params.entryId)}`,
      {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.input),
      }
    );
  } catch {
    throw new Error("Unable to update showcase entry right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update showcase entry");
  }

  return (await response.json()) as AdminShowcaseEntriesListResponse["items"][number];
}

export async function deleteAdminShowcaseEntry(
  entryId: string
): Promise<AdminDeleteShowcaseEntryResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/showcase/${encodeURIComponent(entryId)}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to delete showcase entry right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete showcase entry");
  }

  return (await response.json()) as AdminDeleteShowcaseEntryResponse;
}

export async function searchAdminShowcaseUsers(
  query: AdminShowcaseUserSearchQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminShowcaseUserSearchResponse> {
  const params = buildParamsFromUserSearchQuery(query);
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/showcase/users/search?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to search users right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to search users");
  }

  return (await response.json()) as AdminShowcaseUserSearchResponse;
}

type ApiErrorPayload = {
  message?: unknown;
  error?: {
    message?: unknown;
  };
};

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

type CloudinarySignedUploadPayload = NonNullable<
  AdminAuthorizeShowcaseCoverUploadResponse["upload"]
>;

export const ADMIN_SHOWCASE_COVER_MAX_BYTES = ADMIN_SHOWCASE_COVER_UPLOAD_MAX_BYTES;
export const ADMIN_SHOWCASE_COVER_MIME_TYPES: readonly AdminShowcaseCoverUploadMimeType[] = [
  "image/jpeg",
  "image/png",
];
export const ADMIN_SHOWCASE_IMAGE_MAX_BYTES = ADMIN_SHOWCASE_COVER_MAX_BYTES;
export const ADMIN_SHOWCASE_IMAGE_MIME_TYPES = ADMIN_SHOWCASE_COVER_MIME_TYPES;

export type AdminShowcaseCoverValidationError = "unsupported" | "empty" | "size";
export type AdminShowcaseImageValidationError = AdminShowcaseCoverValidationError;

export function validateAdminShowcaseImageFile(
  file: File
): AdminShowcaseImageValidationError | null {
  if (!ADMIN_SHOWCASE_IMAGE_MIME_TYPES.includes(file.type as AdminShowcaseCoverUploadMimeType)) {
    return "unsupported";
  }

  if (file.size <= 0) {
    return "empty";
  }

  if (file.size > ADMIN_SHOWCASE_IMAGE_MAX_BYTES) {
    return "size";
  }

  return null;
}

export function validateAdminShowcaseCoverFile(
  file: File
): AdminShowcaseCoverValidationError | null {
  return validateAdminShowcaseImageFile(file);
}

export async function requestAdminShowcaseCoverUpload(
  input: AdminShowcaseCoverUploadBodyInput,
  options: { processingErrorMessage?: string } = {}
): Promise<AdminShowcaseCoverUploadResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/showcase/cover-upload", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error(
      options.processingErrorMessage ?? "Unable to process showcase cover upload right now."
    );
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to process showcase cover upload");
  }

  return (await response.json()) as AdminShowcaseCoverUploadResponse;
}

export async function uploadFileToCloudinary(params: {
  file: File;
  upload: CloudinarySignedUploadPayload;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
  uploadErrorMessage?: string;
  cancelledErrorMessage?: string;
}): Promise<{ secureUrl: string; publicId: string }> {
  return await new Promise<{ secureUrl: string; publicId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${params.upload.cloudName}/${params.upload.resourceType}/upload`
    );

    const onAbortSignal = () => {
      xhr.abort();
    };

    if (params.signal) {
      if (params.signal.aborted) {
        reject(new Error(params.cancelledErrorMessage ?? "The upload was cancelled."));
        return;
      }

      params.signal.addEventListener("abort", onAbortSignal, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (!params.onProgress || !event.lengthComputable || event.total <= 0) {
        return;
      }

      const percentage = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      params.onProgress(percentage);
    };

    xhr.onerror = () => {
      reject(new Error(params.uploadErrorMessage ?? "Unable to upload the image right now."));
    };

    xhr.onabort = () => {
      reject(new Error(params.cancelledErrorMessage ?? "The upload was cancelled."));
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

      reject(
        new Error(
          readXhrErrorMessage(
            xhr,
            params.uploadErrorMessage ?? "Unable to upload the image right now."
          )
        )
      );
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

export async function uploadAdminShowcaseCover(params: {
  file: File;
  entryId?: string;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}): Promise<AdminFinalizeShowcaseCoverUploadResponse> {
  return uploadAdminShowcaseImageAsset({
    file: params.file,
    entryId: params.entryId,
    signal: params.signal,
    onProgress: params.onProgress,
    target: "cover",
    processingErrorMessage: "Unable to process showcase cover upload right now.",
    authorizationErrorMessage: "Unable to authorize showcase cover upload.",
    uploadErrorMessage: "Unable to upload the cover image right now.",
    cancelledErrorMessage: "The cover upload was cancelled.",
    finalizationErrorMessage: "Unable to finalize showcase cover upload.",
  });
}

export async function uploadAdminShowcaseFallbackAuthorImage(params: {
  file: File;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}): Promise<AdminFinalizeShowcaseCoverUploadResponse> {
  return uploadAdminShowcaseImageAsset({
    file: params.file,
    signal: params.signal,
    onProgress: params.onProgress,
    target: "fallbackAuthorProfileImage",
    processingErrorMessage: "Unable to process fallback author image upload right now.",
    authorizationErrorMessage: "Unable to authorize fallback author image upload.",
    uploadErrorMessage: "Unable to upload the author image right now.",
    cancelledErrorMessage: "The author image upload was cancelled.",
    finalizationErrorMessage: "Unable to finalize fallback author image upload.",
  });
}

async function uploadAdminShowcaseImageAsset(params: {
  file: File;
  entryId?: string;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
  target: AdminShowcaseImageUploadTarget;
  processingErrorMessage: string;
  authorizationErrorMessage: string;
  uploadErrorMessage: string;
  cancelledErrorMessage: string;
  finalizationErrorMessage: string;
}): Promise<AdminFinalizeShowcaseCoverUploadResponse> {
  const authorizeResponse = await requestAdminShowcaseCoverUpload(
    {
      action: "authorize",
      target: params.target,
      fileName: params.file.name,
      fileSize: params.file.size,
      mimeType: params.file.type as AdminShowcaseCoverUploadMimeType,
    },
    { processingErrorMessage: params.processingErrorMessage }
  );

  if (authorizeResponse.action !== "authorize" || !authorizeResponse.upload) {
    throw new Error(params.authorizationErrorMessage);
  }

  const uploadedFile = await uploadFileToCloudinary({
    file: params.file,
    upload: authorizeResponse.upload,
    signal: params.signal,
    onProgress: params.onProgress,
    uploadErrorMessage: params.uploadErrorMessage,
    cancelledErrorMessage: params.cancelledErrorMessage,
  });

  // Cloudinary returns public_id including folder. The finalize endpoint expects
  // the signed publicId token (without folder) to validate signed metadata.
  const signedPublicId = authorizeResponse.upload.publicId;

  const finalizeResponse = await requestAdminShowcaseCoverUpload(
    {
      action: "finalize",
      target: params.target,
      secureUrl: uploadedFile.secureUrl,
      publicId: signedPublicId,
      entryId: params.entryId,
    },
    { processingErrorMessage: params.processingErrorMessage }
  );

  if (finalizeResponse.action !== "finalize") {
    throw new Error(params.finalizationErrorMessage);
  }

  const finalized = AdminFinalizeShowcaseCoverUploadResponseSchema.parse(finalizeResponse);

  return {
    action: "finalize",
    secureUrl: finalized.secureUrl,
    publicId: finalized.publicId,
    ...(finalized.entry ? { entry: finalized.entry } : {}),
  };
}
