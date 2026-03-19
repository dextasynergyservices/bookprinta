import type {
  AdminCreateResourceCategoryInput,
  AdminCreateResourceInput,
  AdminDeleteResourceCategoryResponse,
  AdminDeleteResourceResponse,
  AdminResourceCategoriesListQuery,
  AdminResourceCategoriesListResponse,
  AdminResourceDetail,
  AdminResourceSlugAvailabilityResponse,
  AdminResourcesListQuery,
  AdminResourcesListResponse,
  AdminUpdateResourceCategoryInput,
  AdminUpdateResourceInput,
  AuthorizeAdminResourceCoverUploadResponse,
  FinalizeAdminResourceCoverUploadResponse,
  RequestAdminResourceCoverUploadBodyInput,
  RequestAdminResourceCoverUploadResponse,
} from "@bookprinta/shared";
import {
  ADMIN_RESOURCE_COVER_UPLOAD_MAX_BYTES,
  FinalizeAdminResourceCoverUploadResponseSchema,
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

function buildParamsFromAdminResourcesListQuery(query: AdminResourcesListQuery): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(query.limit),
  });

  if (query.cursor) params.set("cursor", query.cursor);
  if (query.q) params.set("q", query.q);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (typeof query.isPublished === "boolean") {
    params.set("isPublished", String(query.isPublished));
  }

  return params;
}

function buildParamsFromAdminResourceCategoriesListQuery(
  query: AdminResourceCategoriesListQuery
): URLSearchParams {
  const params = new URLSearchParams();

  if (typeof query.isActive === "boolean") {
    params.set("isActive", String(query.isActive));
  }

  return params;
}

export async function fetchAdminResourceCategories(
  query: AdminResourceCategoriesListQuery = {},
  input: { signal?: AbortSignal } = {}
): Promise<AdminResourceCategoriesListResponse> {
  const params = buildParamsFromAdminResourceCategoriesListQuery(query);
  const path =
    params.size > 0
      ? `/admin/resource-categories?${params.toString()}`
      : "/admin/resource-categories";
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(path, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load resource categories right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load resource categories");
  }

  return (await response.json()) as AdminResourceCategoriesListResponse;
}

export async function createAdminResourceCategory(
  input: AdminCreateResourceCategoryInput
): Promise<AdminResourceCategoriesListResponse["categories"][number]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/resource-categories", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create resource category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create resource category");
  }

  return (await response.json()) as AdminResourceCategoriesListResponse["categories"][number];
}

export async function updateAdminResourceCategory(params: {
  categoryId: string;
  input: AdminUpdateResourceCategoryInput;
}): Promise<AdminResourceCategoriesListResponse["categories"][number]> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/resource-categories/${encodeURIComponent(params.categoryId)}`,
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
    throw new Error("Unable to update resource category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update resource category");
  }

  return (await response.json()) as AdminResourceCategoriesListResponse["categories"][number];
}

export async function deleteAdminResourceCategory(
  categoryId: string
): Promise<AdminDeleteResourceCategoryResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/resource-categories/${encodeURIComponent(categoryId)}`,
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }
    );
  } catch {
    throw new Error("Unable to delete resource category right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete resource category");
  }

  return (await response.json()) as AdminDeleteResourceCategoryResponse;
}

export async function fetchAdminResources(
  query: AdminResourcesListQuery,
  input: { signal?: AbortSignal } = {}
): Promise<AdminResourcesListResponse> {
  const params = buildParamsFromAdminResourcesListQuery(query);
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/resources?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load resources right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load resources");
  }

  return (await response.json()) as AdminResourcesListResponse;
}

export async function createAdminResource(
  input: AdminCreateResourceInput
): Promise<AdminResourceDetail> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/resources", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to create resource right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to create resource");
  }

  return (await response.json()) as AdminResourceDetail;
}

export async function updateAdminResource(params: {
  resourceId: string;
  input: AdminUpdateResourceInput;
}): Promise<AdminResourceDetail> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/resources/${encodeURIComponent(params.resourceId)}`,
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
    throw new Error("Unable to update resource right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to update resource");
  }

  return (await response.json()) as AdminResourceDetail;
}

export async function fetchAdminResourceDetail(
  resourceId: string,
  input: { signal?: AbortSignal } = {}
): Promise<AdminResourceDetail> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/resources/${encodeURIComponent(resourceId)}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load resource details right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load resource details");
  }

  return (await response.json()) as AdminResourceDetail;
}

export async function deleteAdminResource(
  resourceId: string
): Promise<AdminDeleteResourceResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(`/admin/resources/${encodeURIComponent(resourceId)}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to delete resource right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to delete resource");
  }

  return (await response.json()) as AdminDeleteResourceResponse;
}

export async function fetchAdminResourceSlugAvailability(input: {
  slug: string;
  excludeId?: string;
  signal?: AbortSignal;
}): Promise<AdminResourceSlugAvailabilityResponse> {
  const params = new URLSearchParams({ slug: input.slug.trim().toLowerCase() });
  if (input.excludeId) {
    params.set("excludeId", input.excludeId);
  }

  let response: Response;

  try {
    response = await fetchApiV1WithRefresh(
      `/admin/resources/slug-availability?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: input.signal,
      }
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to validate slug right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to validate slug");
  }

  return (await response.json()) as AdminResourceSlugAvailabilityResponse;
}

type CloudinarySignedUploadPayload = AuthorizeAdminResourceCoverUploadResponse["upload"];

export const ADMIN_RESOURCE_COVER_MAX_BYTES = ADMIN_RESOURCE_COVER_UPLOAD_MAX_BYTES;
export const ADMIN_RESOURCE_COVER_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export type AdminResourceCoverUploadMimeType = (typeof ADMIN_RESOURCE_COVER_MIME_TYPES)[number];
export type AdminResourceCoverValidationError = "unsupported" | "empty" | "size";
export type AdminResourceCoverPreparationError =
  | AdminResourceCoverValidationError
  | "cannot-compress";

function isExpectedCloudinarySecureUrl(url: string, cloudName: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
      return false;
    }

    const expectedPrefix = `/${cloudName}/`;
    return parsed.pathname.startsWith(expectedPrefix);
  } catch {
    return false;
  }
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function isExpectedCloudinaryPublicId(params: {
  actualPublicId: string;
  signedPublicId: string;
  folder: string;
}): boolean {
  const actual = trimSlashes(params.actualPublicId.trim());
  const signed = trimSlashes(params.signedPublicId.trim());
  const folder = trimSlashes(params.folder.trim());

  if (actual.length === 0 || signed.length === 0) {
    return false;
  }

  if (actual === signed) {
    return true;
  }

  return folder.length > 0 && actual === `${folder}/${signed}`;
}

export function validateAdminResourceCoverFile(
  file: File
): AdminResourceCoverValidationError | null {
  if (!ADMIN_RESOURCE_COVER_MIME_TYPES.includes(file.type as AdminResourceCoverUploadMimeType)) {
    return "unsupported";
  }

  if (file.size <= 0) {
    return "empty";
  }

  if (file.size > ADMIN_RESOURCE_COVER_MAX_BYTES) {
    return "size";
  }

  return null;
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
  mimeType: AdminResourceCoverUploadMimeType,
  quality?: number
): Promise<Blob | null> {
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function compressResourceCoverIfNeeded(file: File): Promise<File | null> {
  if (file.size <= ADMIN_RESOURCE_COVER_MAX_BYTES) {
    return file;
  }

  if (!ADMIN_RESOURCE_COVER_MIME_TYPES.includes(file.type as AdminResourceCoverUploadMimeType)) {
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

  const mimeType = file.type as AdminResourceCoverUploadMimeType;
  const qualitySteps = mimeType === "image/jpeg" ? [0.95, 0.92, 0.88, 0.84, 0.8] : [undefined];

  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!blob) {
      continue;
    }

    if (blob.size <= ADMIN_RESOURCE_COVER_MAX_BYTES) {
      return new File([blob], file.name, {
        type: mimeType,
        lastModified: Date.now(),
      });
    }
  }

  return null;
}

export async function prepareAdminResourceCoverFile(file: File): Promise<
  | {
      ok: true;
      file: File;
      compressed: boolean;
      originalSize: number;
    }
  | {
      ok: false;
      reason: AdminResourceCoverPreparationError;
    }
> {
  const validation = validateAdminResourceCoverFile(file);
  if (validation && validation !== "size") {
    return { ok: false, reason: validation };
  }

  if (file.size <= ADMIN_RESOURCE_COVER_MAX_BYTES) {
    return { ok: true, file, compressed: false, originalSize: file.size };
  }

  const compressed = await compressResourceCoverIfNeeded(file);
  if (!compressed) {
    return { ok: false, reason: "cannot-compress" };
  }

  const compressedValidation = validateAdminResourceCoverFile(compressed);
  if (compressedValidation) {
    return { ok: false, reason: compressedValidation };
  }

  return {
    ok: true,
    file: compressed,
    compressed: compressed.size < file.size,
    originalSize: file.size,
  };
}

export async function requestAdminResourceCoverUpload(
  input: RequestAdminResourceCoverUploadBodyInput
): Promise<RequestAdminResourceCoverUploadResponse> {
  let response: Response;

  try {
    response = await fetchApiV1WithRefresh("/admin/resources/cover-upload", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to process resource cover upload right now.");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to process resource cover upload");
  }

  return (await response.json()) as RequestAdminResourceCoverUploadResponse;
}

export async function uploadFileToCloudinary(params: {
  file: File;
  upload: CloudinarySignedUploadPayload;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
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
        reject(new Error("The cover upload was cancelled."));
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
      reject(new Error("Unable to upload the cover image right now."));
    };

    xhr.onabort = () => {
      reject(new Error("The cover upload was cancelled."));
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
            if (!isExpectedCloudinarySecureUrl(payload.secure_url, params.upload.cloudName)) {
              reject(new Error("Unexpected Cloudinary secure URL for cover upload."));
              return;
            }

            if (
              !isExpectedCloudinaryPublicId({
                actualPublicId: payload.public_id,
                signedPublicId: params.upload.publicId,
                folder: params.upload.folder,
              })
            ) {
              reject(new Error("Unexpected Cloudinary public ID for cover upload."));
              return;
            }

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

      reject(new Error(readXhrErrorMessage(xhr, "Unable to upload the cover image right now.")));
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

export async function uploadAdminResourceCover(params: {
  file: File;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}): Promise<FinalizeAdminResourceCoverUploadResponse> {
  const prepared = await prepareAdminResourceCoverFile(params.file);
  if (!prepared.ok) {
    if (prepared.reason === "unsupported") {
      throw new Error("Only JPEG and PNG cover images are supported.");
    }

    if (prepared.reason === "empty") {
      throw new Error("The selected cover image is empty.");
    }

    if (prepared.reason === "size") {
      throw new Error("The cover image must be 5MB or smaller.");
    }

    throw new Error(
      "The cover image is larger than 5MB and could not be compressed while preserving quality."
    );
  }

  const authorizeResponse = await requestAdminResourceCoverUpload({
    action: "authorize",
    mimeType: prepared.file.type as AdminResourceCoverUploadMimeType,
  });

  if (authorizeResponse.action !== "authorize" || !authorizeResponse.upload) {
    throw new Error("Unable to authorize resource cover upload.");
  }

  const uploadedFile = await uploadFileToCloudinary({
    file: prepared.file,
    upload: authorizeResponse.upload,
    signal: params.signal,
    onProgress: params.onProgress,
  });

  const signedPublicId = authorizeResponse.upload.publicId;

  const finalizeResponse = await requestAdminResourceCoverUpload({
    action: "finalize",
    secureUrl: uploadedFile.secureUrl,
    publicId: signedPublicId,
  });

  if (finalizeResponse.action !== "finalize") {
    throw new Error("Unable to finalize resource cover upload.");
  }

  const finalized = FinalizeAdminResourceCoverUploadResponseSchema.parse(finalizeResponse);

  return {
    action: "finalize",
    coverImageUrl: finalized.coverImageUrl,
  };
}
