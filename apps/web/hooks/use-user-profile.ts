"use client";

import type {
  AuthorizeMyProfileImageUploadResponse,
  ChangeMyPasswordBodyInput,
  ChangeMyPasswordResponse,
  DeleteMyProfileImageResponse,
  MyProfileResponse,
  RequestMyProfileImageUploadResponse,
  SupportedLanguage,
  UpdateMyLanguageBodyInput,
  UpdateMyLanguageResponse,
  UpdateMyNotificationPreferencesBodyInput,
  UpdateMyNotificationPreferencesResponse,
  UpdateMyProfileBodyInput,
  UpdateMyProfileResponse,
} from "@bookprinta/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  normalizeChangeMyPasswordPayload,
  normalizeDeleteMyProfileImagePayload,
  normalizeMyProfilePayload,
  normalizeRequestMyProfileImageUploadPayload,
  normalizeUpdateMyLanguagePayload,
  normalizeUpdateMyNotificationPreferencesPayload,
  normalizeUpdateMyProfilePayload,
} from "@/lib/api/users-contract";
import { throwApiError } from "@/lib/api-error";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export const MY_PROFILE_QUERY_KEY = ["dashboard", "user", "profile"] as const;

type UploadProfileImageInput = {
  file: File;
  onProgress?: (percentage: number) => void;
};

type CloudinarySignedUploadPayload = NonNullable<AuthorizeMyProfileImageUploadResponse["upload"]>;

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

function readXhrErrorMessage(xhr: XMLHttpRequest, fallback: string): string {
  const raw = xhr.responseText;
  if (!raw || raw.trim().length === 0) return fallback;

  try {
    const payload = JSON.parse(raw) as { error?: { message?: unknown }; message?: unknown };
    if (typeof payload.error?.message === "string" && payload.error.message.trim().length > 0) {
      return payload.error.message;
    }

    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }
  } catch {
    // Keep fallback below.
  }

  return fallback;
}

async function fetchMyProfile({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<MyProfileResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_V1_BASE_URL}/users/me/profile`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load your profile");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your profile");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeMyProfilePayload(payload);
}

async function updateMyProfileRequest(
  input: UpdateMyProfileBodyInput
): Promise<UpdateMyProfileResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/users/me/profile`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to save your profile");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeUpdateMyProfilePayload(payload);
}

async function requestMyProfileImageUploadRequest(
  input:
    | {
        action: "authorize";
        mimeType: "image/jpeg" | "image/png";
      }
    | {
        action: "finalize";
        secureUrl: string;
        publicId: string;
      }
): Promise<RequestMyProfileImageUploadResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/users/me/profile/image`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to process your profile image");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeRequestMyProfileImageUploadPayload(payload);
}

async function deleteMyProfileImageRequest(): Promise<DeleteMyProfileImageResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/users/me/profile/image`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to remove your profile image");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeDeleteMyProfileImagePayload(payload);
}

async function updateMyLanguageRequest(
  input: UpdateMyLanguageBodyInput
): Promise<UpdateMyLanguageResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/users/me/language`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to update your language preference");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeUpdateMyLanguagePayload(payload);
}

async function changeMyPasswordRequest(
  input: ChangeMyPasswordBodyInput
): Promise<ChangeMyPasswordResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/users/me/password`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to change your password");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeChangeMyPasswordPayload(payload);
}

async function updateNotificationPreferencesRequest(
  input: UpdateMyNotificationPreferencesBodyInput
): Promise<UpdateMyNotificationPreferencesResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/users/me/notification-preferences`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to update your notification preferences");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeUpdateMyNotificationPreferencesPayload(payload);
}

async function uploadFileToCloudinary(params: {
  file: File;
  upload: CloudinarySignedUploadPayload;
  onProgress?: (percentage: number) => void;
}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
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
      reject(new Error("Unable to upload your profile image right now"));
    };

    xhr.onabort = () => {
      reject(new Error("Profile image upload was cancelled"));
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText) as { secure_url?: unknown };
          if (typeof payload.secure_url === "string" && payload.secure_url.trim().length > 0) {
            resolve(payload.secure_url);
            return;
          }
        } catch {
          // Keep fallback below.
        }

        reject(new Error("Unexpected upload response from Cloudinary"));
        return;
      }

      reject(new Error(readXhrErrorMessage(xhr, "Unable to upload your profile image right now")));
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

async function uploadProfileImageRequest({
  file,
  onProgress,
}: UploadProfileImageInput): Promise<MyProfileResponse> {
  const authorizeResponse = await requestMyProfileImageUploadRequest({
    action: "authorize",
    mimeType: file.type as "image/jpeg" | "image/png",
  });

  if (authorizeResponse.action !== "authorize" || !authorizeResponse.upload) {
    throw new Error("Unable to authorize your profile image upload");
  }

  const secureUrl = await uploadFileToCloudinary({
    file,
    upload: authorizeResponse.upload,
    onProgress,
  });

  const finalizeResponse = await requestMyProfileImageUploadRequest({
    action: "finalize",
    secureUrl,
    publicId: authorizeResponse.upload.publicId,
  });

  if (finalizeResponse.action !== "finalize" || !finalizeResponse.profile) {
    throw new Error("Unable to finalize your profile image upload");
  }

  return finalizeResponse.profile;
}

export function useMyProfile() {
  const query = useQuery({
    queryKey: MY_PROFILE_QUERY_KEY,
    meta: {
      sentryName: "fetchMyProfile",
      sentryEndpoint: "/api/v1/users/me/profile",
    },
    queryFn: ({ signal }) => fetchMyProfile({ signal }),
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  return {
    ...query,
    profile: query.data ?? null,
  };
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateMyProfileRequest,
    meta: {
      sentryName: "updateMyProfile",
      sentryEndpoint: "/api/v1/users/me/profile",
    },
    onSuccess: (result) => {
      queryClient.setQueryData(MY_PROFILE_QUERY_KEY, result);
    },
  });

  return {
    ...mutation,
    updateProfile: mutation.mutateAsync,
  };
}

export function useUploadProfileImage() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: uploadProfileImageRequest,
    meta: {
      sentryName: "uploadProfileImage",
      sentryEndpoint: "/api/v1/users/me/profile/image",
    },
    onSuccess: (result) => {
      queryClient.setQueryData(MY_PROFILE_QUERY_KEY, result);
    },
  });

  return {
    ...mutation,
    uploadProfileImage: mutation.mutateAsync,
  };
}

export function useDeleteMyProfileImage() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteMyProfileImageRequest,
    meta: {
      sentryName: "deleteProfileImage",
      sentryEndpoint: "/api/v1/users/me/profile/image",
    },
    onSuccess: (result) => {
      queryClient.setQueryData(MY_PROFILE_QUERY_KEY, result);
    },
  });

  return {
    ...mutation,
    deleteProfileImage: mutation.mutateAsync,
  };
}

export function useUpdateMyLanguage() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateMyLanguageRequest,
    meta: {
      sentryName: "updateMyLanguage",
      sentryEndpoint: "/api/v1/users/me/language",
    },
    onSuccess: (result) => {
      queryClient.setQueryData<MyProfileResponse | null>(MY_PROFILE_QUERY_KEY, (current) =>
        current
          ? {
              ...current,
              preferredLanguage: result.preferredLanguage as SupportedLanguage,
            }
          : current
      );
    },
  });

  return {
    ...mutation,
    updateLanguage: mutation.mutateAsync,
  };
}

export function useChangeMyPassword() {
  const mutation = useMutation({
    mutationFn: changeMyPasswordRequest,
    meta: {
      sentryName: "changeMyPassword",
      sentryEndpoint: "/api/v1/users/me/password",
    },
  });

  return {
    ...mutation,
    changePassword: mutation.mutateAsync,
  };
}

export function useUpdateMyNotificationPreferences() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateNotificationPreferencesRequest,
    meta: {
      sentryName: "updateMyNotificationPreferences",
      sentryEndpoint: "/api/v1/users/me/notification-preferences",
    },
    onSuccess: (result) => {
      queryClient.setQueryData<MyProfileResponse | null>(MY_PROFILE_QUERY_KEY, (current) =>
        current
          ? {
              ...current,
              notificationPreferences: result.notificationPreferences,
            }
          : current
      );
    },
  });

  return {
    ...mutation,
    updateNotificationPreferences: mutation.mutateAsync,
  };
}
