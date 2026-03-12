"use client";

import {
  type MyProfileResponse,
  type PurchaseLink,
  PurchaseLinkSchema,
  type SocialLink,
  SocialLinkSchema,
  type UpdateMyProfileBodyInput,
  UserWebsiteUrlSchema,
  UserWhatsAppNumberSchema,
} from "@bookprinta/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, LoaderCircle, Plus, Trash2, UploadCloud } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  useDeleteMyProfileImage,
  useMyProfile,
  useUpdateMyProfile,
  useUploadProfileImage,
} from "@/hooks/use-user-profile";
import { cn } from "@/lib/utils";

const BIO_CHARACTER_LIMIT = 500;
const PROFILE_LINK_LIMIT = 10;
const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

const SOCIAL_PLATFORM_OPTIONS = [
  { value: "Instagram", labelKey: "profile_social_platform_instagram" },
  { value: "X", labelKey: "profile_social_platform_x" },
  { value: "Facebook", labelKey: "profile_social_platform_facebook" },
  { value: "LinkedIn", labelKey: "profile_social_platform_linkedin" },
  { value: "TikTok", labelKey: "profile_social_platform_tiktok" },
  { value: "YouTube", labelKey: "profile_social_platform_youtube" },
  { value: "Threads", labelKey: "profile_social_platform_threads" },
  { value: "Goodreads", labelKey: "profile_social_platform_goodreads" },
  { value: "Amazon Author Central", labelKey: "profile_social_platform_amazon_author_central" },
] as const;

type EditablePurchaseLink = {
  id: string;
  label: string;
  url: string;
};

type EditableSocialLink = {
  id: string;
  platform: string;
  url: string;
};

type ProfileDraft = {
  bio: string;
  whatsAppNumber: string;
  websiteUrl: string;
  purchaseLinks: EditablePurchaseLink[];
  socialLinks: EditableSocialLink[];
};

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `profile-link-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyProfileDraft(): ProfileDraft {
  return {
    bio: "",
    whatsAppNumber: "",
    websiteUrl: "",
    purchaseLinks: [],
    socialLinks: [],
  };
}

function createProfileDraft(profile: MyProfileResponse): ProfileDraft {
  return {
    bio: profile.bio ?? "",
    whatsAppNumber: profile.whatsAppNumber ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    purchaseLinks: profile.purchaseLinks.map((link) => ({
      id: createClientId(),
      label: link.label,
      url: link.url,
    })),
    socialLinks: profile.socialLinks.map((link) => ({
      id: createClientId(),
      platform: link.platform,
      url: link.url,
    })),
  };
}

function stripDraftIds(draft: ProfileDraft) {
  return {
    bio: draft.bio,
    whatsAppNumber: draft.whatsAppNumber,
    websiteUrl: draft.websiteUrl,
    purchaseLinks: draft.purchaseLinks.map(({ label, url }) => ({ label, url })),
    socialLinks: draft.socialLinks.map(({ platform, url }) => ({ platform, url })),
  };
}

function areProfileDraftsEqual(left: ProfileDraft, right: ProfileDraft) {
  return JSON.stringify(stripDraftIds(left)) === JSON.stringify(stripDraftIds(right));
}

function createLoadingBlocks() {
  return Array.from({ length: 4 }, (_unused, index) => `profile-loading-block-${index + 1}`);
}

export function ProfileSettingsProfilePanel() {
  const tDashboard = useTranslations("dashboard");
  const prefersReducedMotion = useReducedMotion();
  const { profile, isLoading, isError, error, refetch } = useMyProfile();
  const { updateProfile, isPending: isSaving } = useUpdateMyProfile();
  const { uploadProfileImage, isPending: isUploadingImage } = useUploadProfileImage();
  const { deleteProfileImage, isPending: isDeletingImage } = useDeleteMyProfileImage();
  const [draft, setDraft] = useState<ProfileDraft>(() => createEmptyProfileDraft());
  const [serverSnapshot, setServerSnapshot] = useState<ProfileDraft>(() =>
    createEmptyProfileDraft()
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrlState] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const hasHydratedProfileRef = useRef(false);
  const draftRef = useRef(draft);
  const serverSnapshotRef = useRef(serverSnapshot);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    serverSnapshotRef.current = serverSnapshot;
  }, [serverSnapshot]);

  const setLocalPreviewUrl = (nextValue: string | null) => {
    if (objectUrlRef.current && objectUrlRef.current !== nextValue) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    objectUrlRef.current = nextValue;
    setLocalPreviewUrlState(nextValue);
  };

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const applyServerProfile = useCallback(
    (nextProfile: MyProfileResponse, options?: { forceFormReset?: boolean }) => {
      const nextDraft = createProfileDraft(nextProfile);
      const shouldResetForm =
        options?.forceFormReset === true ||
        !hasHydratedProfileRef.current ||
        areProfileDraftsEqual(draftRef.current, serverSnapshotRef.current);

      serverSnapshotRef.current = nextDraft;
      setServerSnapshot(nextDraft);

      if (shouldResetForm) {
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }

      hasHydratedProfileRef.current = true;
    },
    []
  );

  useEffect(() => {
    if (!profile) {
      return;
    }

    applyServerProfile(profile);
  }, [applyServerProfile, profile]);

  const socialPlatformOptions = useMemo(
    () =>
      SOCIAL_PLATFORM_OPTIONS.map((option) => ({
        value: option.value,
        label: tDashboard(option.labelKey),
      })),
    [tDashboard]
  );

  const currentImageUrl = localPreviewUrl ?? profile?.profileImageUrl ?? null;
  const bioCharacterCount = draft.bio.length;
  const isDirty = useMemo(
    () => !areProfileDraftsEqual(draft, serverSnapshot),
    [draft, serverSnapshot]
  );
  const isBusy = isSaving || isUploadingImage || isDeletingImage;
  const loadingBlocks = useMemo(() => createLoadingBlocks(), []);

  const updateDraftField = <TKey extends keyof Omit<ProfileDraft, "purchaseLinks" | "socialLinks">>(
    key: TKey,
    value: ProfileDraft[TKey]
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updatePurchaseLink = (id: string, key: "label" | "url", value: string) => {
    setDraft((current) => ({
      ...current,
      purchaseLinks: current.purchaseLinks.map((link) =>
        link.id === id ? { ...link, [key]: value } : link
      ),
    }));
  };

  const updateSocialLink = (id: string, key: "platform" | "url", value: string) => {
    setDraft((current) => ({
      ...current,
      socialLinks: current.socialLinks.map((link) =>
        link.id === id ? { ...link, [key]: value } : link
      ),
    }));
  };

  const addPurchaseLink = () => {
    setDraft((current) => {
      if (current.purchaseLinks.length >= PROFILE_LINK_LIMIT) {
        return current;
      }

      return {
        ...current,
        purchaseLinks: [...current.purchaseLinks, { id: createClientId(), label: "", url: "" }],
      };
    });
  };

  const removePurchaseLink = (id: string) => {
    setDraft((current) => ({
      ...current,
      purchaseLinks: current.purchaseLinks.filter((link) => link.id !== id),
    }));
  };

  const addSocialLink = () => {
    setDraft((current) => {
      if (current.socialLinks.length >= PROFILE_LINK_LIMIT) {
        return current;
      }

      return {
        ...current,
        socialLinks: [...current.socialLinks, { id: createClientId(), platform: "", url: "" }],
      };
    });
  };

  const removeSocialLink = (id: string) => {
    setDraft((current) => ({
      ...current,
      socialLinks: current.socialLinks.filter((link) => link.id !== id),
    }));
  };

  const resetUploadState = () => {
    setImageUploadProgress(null);
    setIsDragActive(false);
    setLocalPreviewUrl(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleProfileImageFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    setImageError(null);

    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setImageError(tDashboard("profile_image_invalid_type"));
      toast.error(tDashboard("profile_image_invalid_type"));
      return;
    }

    if (file.size <= 0 || file.size > MAX_PROFILE_IMAGE_BYTES) {
      setImageError(tDashboard("profile_image_invalid_size"));
      toast.error(tDashboard("profile_image_invalid_size"));
      return;
    }

    setLocalPreviewUrl(URL.createObjectURL(file));
    setImageUploadProgress(0);

    try {
      const nextProfile = await uploadProfileImage({
        file,
        onProgress: (percentage) => {
          setImageUploadProgress(percentage);
        },
      });

      resetUploadState();
      applyServerProfile(nextProfile);
      toast.success(tDashboard("profile_image_upload_success"));
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : tDashboard("profile_image_upload_error");

      resetUploadState();
      setImageError(message);
      toast.error(message);
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleProfileImageFile(event.target.files?.[0] ?? null);
  };

  const handleDeleteProfileImage = async () => {
    setImageError(null);

    try {
      const nextProfile = await deleteProfileImage();
      resetUploadState();
      applyServerProfile(nextProfile);
      toast.success(tDashboard("profile_image_remove_success"));
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : tDashboard("profile_image_remove_error");

      setImageError(message);
      toast.error(message);
    }
  };

  const buildProfilePayload = (): { payload: UpdateMyProfileBodyInput } | { error: string } => {
    const bio = draft.bio.trim();
    const whatsAppNumber = draft.whatsAppNumber.trim();
    const websiteUrl = draft.websiteUrl.trim();

    if (whatsAppNumber.length > 0 && !UserWhatsAppNumberSchema.safeParse(whatsAppNumber).success) {
      return { error: tDashboard("profile_whatsapp_invalid") };
    }

    if (websiteUrl.length > 0 && !UserWebsiteUrlSchema.safeParse(websiteUrl).success) {
      return { error: tDashboard("profile_website_invalid") };
    }

    const purchaseLinks: PurchaseLink[] = [];
    for (const [index, link] of draft.purchaseLinks.entries()) {
      const label = link.label.trim();
      const url = link.url.trim();

      if (label.length === 0 && url.length === 0) {
        continue;
      }

      const parsed = PurchaseLinkSchema.safeParse({ label, url });
      if (!parsed.success) {
        return { error: tDashboard("profile_purchase_link_invalid", { index: index + 1 }) };
      }

      purchaseLinks.push(parsed.data);
    }

    const socialLinks: SocialLink[] = [];
    for (const [index, link] of draft.socialLinks.entries()) {
      const platform = link.platform.trim();
      const url = link.url.trim();

      if (platform.length === 0 && url.length === 0) {
        continue;
      }

      const parsed = SocialLinkSchema.safeParse({ platform, url });
      if (!parsed.success) {
        return { error: tDashboard("profile_social_link_invalid", { index: index + 1 }) };
      }

      socialLinks.push(parsed.data);
    }

    return {
      payload: {
        bio: bio.length > 0 ? bio : null,
        whatsAppNumber: whatsAppNumber.length > 0 ? whatsAppNumber : null,
        websiteUrl: websiteUrl.length > 0 ? websiteUrl : null,
        purchaseLinks,
        socialLinks,
      },
    };
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const validation = buildProfilePayload();
    if ("error" in validation) {
      setFormError(validation.error);
      return;
    }

    try {
      const nextProfile = await updateProfile(validation.payload);
      applyServerProfile(nextProfile, { forceFormReset: true });
      toast.success(tDashboard("profile_save_success"));
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : tDashboard("profile_save_error");
      setFormError(message);
      toast.error(message);
    }
  };

  if (isLoading && !profile) {
    return (
      <section
        data-testid="profile-settings-profile-panel"
        className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        aria-labelledby="profile-settings-heading"
      >
        <div className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
          <div className="mx-auto h-44 w-44 animate-pulse rounded-full bg-[#1C1C1C]" />
        </div>
        <div className="grid gap-4">
          {loadingBlocks.map((key) => (
            <div
              key={key}
              className="h-32 animate-pulse rounded-[32px] border border-[#2A2A2A] bg-[#111111]"
            />
          ))}
        </div>
      </section>
    );
  }

  if (isError || !profile) {
    return (
      <section
        data-testid="profile-settings-profile-panel"
        className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5"
        aria-labelledby="profile-settings-heading"
      >
        <h2 id="profile-settings-heading" className="font-sans text-sm font-medium text-white">
          {tDashboard("profile_load_error_title")}
        </h2>
        <p className="font-sans mt-2 text-sm leading-6 text-[#A3A3A3]">
          {error instanceof Error ? error.message : tDashboard("profile_load_error_description")}
        </p>
        <Button
          type="button"
          onClick={() => {
            void refetch();
          }}
          className="font-sans mt-4 min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
        >
          {tDashboard("profile_retry")}
        </Button>
      </section>
    );
  }

  return (
    <section
      data-testid="profile-settings-profile-panel"
      className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
      aria-labelledby="profile-settings-heading"
    >
      <aside className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="profile-settings-heading" className="font-sans text-sm font-medium text-white">
              {tDashboard("profile_image")}
            </h2>
            <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
              {tDashboard("profile_image_hint")}
            </p>
          </div>
          {profile.isProfileComplete ? (
            <span className="font-sans rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              {tDashboard("profile_complete_status")}
            </span>
          ) : (
            <span className="font-sans rounded-full border border-[#2A2A2A] bg-[#171717] px-3 py-1 text-xs font-medium text-[#D6D6D6]">
              {tDashboard("profile_incomplete_status")}
            </span>
          )}
        </div>

        <div className="mt-6">
          <button
            type="button"
            aria-label={tDashboard("profile_image")}
            disabled={isBusy}
            onClick={() => {
              if (!isBusy) {
                fileInputRef.current?.click();
              }
            }}
            onKeyDown={(event) => {
              if (isBusy) {
                return;
              }

              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isBusy) {
                setIsDragActive(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!isBusy && event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                return;
              }

              setIsDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);

              if (isBusy) {
                return;
              }

              void handleProfileImageFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "group relative flex min-h-[19rem] w-full flex-col items-center justify-center gap-4 rounded-[32px] border border-dashed bg-[#0B0B0B] px-5 py-6 text-center outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-4",
              isDragActive ? "border-[#007eff] bg-[#07111e]" : "border-[#2A2A2A]",
              isBusy && "cursor-not-allowed opacity-70"
            )}
          >
            <AnimatePresence initial={false} mode="wait">
              {currentImageUrl ? (
                <motion.div
                  key={currentImageUrl}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.22, ease: PANEL_EASE }}
                  className="relative h-40 w-40 overflow-hidden rounded-full border border-[#2A2A2A] bg-[#050505]"
                >
                  <Image
                    src={currentImageUrl}
                    alt={tDashboard("profile_image_preview_alt")}
                    fill
                    unoptimized
                    sizes="160px"
                    className="object-cover"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty-profile-image"
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.22, ease: PANEL_EASE }}
                  className="flex h-40 w-40 items-center justify-center rounded-full border border-dashed border-[#2A2A2A] bg-[#050505] text-[#A3A3A3]"
                >
                  <Camera className="size-10" aria-hidden="true" />
                </motion.div>
              )}
            </AnimatePresence>

            {isUploadingImage ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-[32px] bg-black/55">
                <motion.span
                  animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                  transition={
                    prefersReducedMotion
                      ? undefined
                      : { duration: 0.9, ease: "linear", repeat: Infinity }
                  }
                  className="inline-flex rounded-full border border-[#2A2A2A] bg-[#111111] p-3 text-[#007eff]"
                >
                  <LoaderCircle className="size-5" aria-hidden="true" />
                </motion.span>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="font-sans text-sm font-medium text-white">
                {currentImageUrl
                  ? tDashboard("profile_image_replace")
                  : tDashboard("profile_image_drop_prompt")}
              </p>
              <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
                {tDashboard("profile_image_formats")}
              </p>
            </div>

            {imageUploadProgress !== null ? (
              <div className="w-full max-w-xs space-y-2" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-[#D6D6D6]">
                    {tDashboard("profile_image_uploading")}
                  </span>
                  <span className="font-sans text-sm font-medium text-white">
                    {imageUploadProgress}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#1D1D1D]">
                  <div
                    className="h-full rounded-full bg-[#007eff] transition-[width] duration-200"
                    style={{ width: `${imageUploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            aria-label={tDashboard("profile_image")}
            onChange={(event) => {
              void handleFileInputChange(event);
            }}
          />

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="font-sans min-h-11 flex-1 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
            >
              <UploadCloud className="size-4" aria-hidden="true" />
              {currentImageUrl
                ? tDashboard("profile_image_replace")
                : tDashboard("profile_image_choose")}
            </Button>
            {profile.profileImageUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void handleDeleteProfileImage();
                }}
                disabled={isBusy}
                className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-transparent px-5 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#171717]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {tDashboard("profile_image_remove")}
              </Button>
            ) : null}
          </div>

          <FieldError className="mt-3" role="alert">
            {imageError}
          </FieldError>
        </div>
      </aside>
      <form noValidate onSubmit={handleSave} className="grid gap-4">
        <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-sans text-sm font-medium text-white">{tDashboard("bio")}</h3>
              <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
                {tDashboard("profile_bio_hint")}
              </p>
            </div>
            <span className="font-sans text-sm font-medium text-[#D6D6D6]">
              {tDashboard("profile_bio_counter", {
                count: bioCharacterCount,
                max: BIO_CHARACTER_LIMIT,
              })}
            </span>
          </div>
          <Textarea
            value={draft.bio}
            maxLength={BIO_CHARACTER_LIMIT}
            onChange={(event) => {
              updateDraftField("bio", event.target.value);
            }}
            className="font-sans mt-4 min-h-36 rounded-[24px] border-[#2A2A2A] bg-[#0B0B0B] px-4 py-3 text-base text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
            placeholder={tDashboard("profile_bio_placeholder")}
          />
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
            <div className="space-y-1">
              <h3 className="font-sans text-sm font-medium text-white">
                {tDashboard("profile_whatsapp_label")}
              </h3>
              <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
                {tDashboard("profile_whatsapp_hint")}
              </p>
            </div>
            <Input
              type="tel"
              value={draft.whatsAppNumber}
              onChange={(event) => {
                updateDraftField("whatsAppNumber", event.target.value);
              }}
              className="font-sans mt-4 min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
              placeholder={tDashboard("profile_whatsapp_placeholder")}
            />
          </section>

          <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
            <div className="space-y-1">
              <h3 className="font-sans text-sm font-medium text-white">{tDashboard("website")}</h3>
              <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
                {tDashboard("profile_website_hint")}
              </p>
            </div>
            <Input
              type="url"
              value={draft.websiteUrl}
              onChange={(event) => {
                updateDraftField("websiteUrl", event.target.value);
              }}
              className="font-sans mt-4 min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
              placeholder={tDashboard("profile_website_placeholder")}
            />
          </section>
        </div>

        <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h3 className="font-sans text-sm font-medium text-white">
                {tDashboard("purchase_links")}
              </h3>
              <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
                {tDashboard("profile_purchase_links_hint")}
              </p>
            </div>
            <Button
              type="button"
              onClick={addPurchaseLink}
              disabled={draft.purchaseLinks.length >= PROFILE_LINK_LIMIT || isBusy}
              className="font-sans min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
            >
              <Plus className="size-4" aria-hidden="true" />
              {tDashboard("profile_add_purchase_link")}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <AnimatePresence initial={false}>
              {draft.purchaseLinks.map((link, index) => (
                <motion.div
                  key={link.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: -12 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, ease: PANEL_EASE }}
                  className="grid gap-3 rounded-[24px] border border-[#2A2A2A] bg-[#0B0B0B] p-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
                >
                  <Input
                    type="text"
                    value={link.label}
                    onChange={(event) => {
                      updatePurchaseLink(link.id, "label", event.target.value);
                    }}
                    className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#050505] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                    placeholder={tDashboard("profile_purchase_link_label")}
                    aria-label={tDashboard("profile_purchase_link_label_indexed", {
                      index: index + 1,
                    })}
                  />
                  <Input
                    type="url"
                    value={link.url}
                    onChange={(event) => {
                      updatePurchaseLink(link.id, "url", event.target.value);
                    }}
                    className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#050505] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                    placeholder={tDashboard("profile_purchase_link_url")}
                    aria-label={tDashboard("profile_purchase_link_url_indexed", {
                      index: index + 1,
                    })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removePurchaseLink(link.id)}
                    className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-transparent px-4 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#171717]"
                    aria-label={tDashboard("profile_remove_purchase_link", { index: index + 1 })}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {tDashboard("remove_link")}
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h3 className="font-sans text-sm font-medium text-white">
                {tDashboard("social_links")}
              </h3>
              <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
                {tDashboard("profile_social_links_hint")}
              </p>
            </div>
            <Button
              type="button"
              onClick={addSocialLink}
              disabled={draft.socialLinks.length >= PROFILE_LINK_LIMIT || isBusy}
              className="font-sans min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
            >
              <Plus className="size-4" aria-hidden="true" />
              {tDashboard("profile_add_social_link")}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <AnimatePresence initial={false}>
              {draft.socialLinks.map((link, index) => {
                const hasKnownPlatform = socialPlatformOptions.some(
                  (option) => option.value === link.platform
                );
                const options = hasKnownPlatform
                  ? socialPlatformOptions
                  : [...socialPlatformOptions, { value: link.platform, label: link.platform }];

                return (
                  <motion.div
                    key={link.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, ease: PANEL_EASE }}
                    className="grid gap-3 rounded-[24px] border border-[#2A2A2A] bg-[#0B0B0B] p-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]"
                  >
                    <div className="relative">
                      <select
                        value={link.platform}
                        onChange={(event) => {
                          updateSocialLink(link.id, "platform", event.target.value);
                        }}
                        className="font-sans min-h-11 w-full appearance-none rounded-full border border-[#2A2A2A] bg-[#050505] px-4 pr-10 text-base text-white outline-none transition-[border-color,box-shadow] focus-visible:border-[#007eff] focus-visible:ring-2 focus-visible:ring-[#007eff]/20 md:text-sm"
                        aria-label={tDashboard("profile_social_platform_indexed", {
                          index: index + 1,
                        })}
                      >
                        <option value="">
                          {tDashboard("profile_social_platform_placeholder")}
                        </option>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#A3A3A3]"
                      >
                        ▾
                      </span>
                    </div>
                    <Input
                      type="url"
                      value={link.url}
                      onChange={(event) => {
                        updateSocialLink(link.id, "url", event.target.value);
                      }}
                      className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#050505] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                      placeholder={tDashboard("profile_social_link_url")}
                      aria-label={tDashboard("profile_social_link_url_indexed", {
                        index: index + 1,
                      })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeSocialLink(link.id)}
                      className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-transparent px-4 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#171717]"
                      aria-label={tDashboard("profile_remove_social_link", { index: index + 1 })}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      {tDashboard("remove_link")}
                    </Button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </section>

        <FieldError role="alert">{formError}</FieldError>

        <Button
          type="submit"
          disabled={isBusy || !isDirty}
          className="font-sans min-h-12 w-full rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0a72df]"
        >
          {isSaving ? (
            <>
              <motion.span
                animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                transition={
                  prefersReducedMotion
                    ? undefined
                    : { duration: 0.9, ease: "linear", repeat: Infinity }
                }
                className="inline-flex"
              >
                <LoaderCircle className="size-4" aria-hidden="true" />
              </motion.span>
              {tDashboard("profile_saving")}
            </>
          ) : (
            tDashboard("profile_save")
          )}
        </Button>
      </form>
    </section>
  );
}
