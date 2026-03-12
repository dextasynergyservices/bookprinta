"use client";

import type { MyProfileResponse } from "@bookprinta/shared";
import { AnimatePresence, motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  useChangeMyPassword,
  useMyProfile,
  useUpdateMyLanguage,
  useUpdateMyNotificationPreferences,
} from "@/hooks/use-user-profile";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "../shared/language-switcher";

const PASSWORD_STRENGTH_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/;
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

type NotificationPreferencesDraft = MyProfileResponse["notificationPreferences"];

function createEmptyNotificationPreferences(): NotificationPreferencesDraft {
  return {
    email: false,
    whatsApp: false,
    inApp: false,
  };
}

function areNotificationPreferencesEqual(
  left: NotificationPreferencesDraft,
  right: NotificationPreferencesDraft
) {
  return (
    left.email === right.email && left.whatsApp === right.whatsApp && left.inApp === right.inApp
  );
}

function createLoadingBlocks() {
  return Array.from({ length: 3 }, (_unused, index) => `settings-loading-block-${index + 1}`);
}

function resolveLanguageLabel(locale: string, tDashboard: (key: string) => string) {
  switch (locale) {
    case "fr":
      return tDashboard("settings_language_name_fr");
    case "es":
      return tDashboard("settings_language_name_es");
    default:
      return tDashboard("settings_language_name_en");
  }
}

export function ProfileSettingsSettingsPanel() {
  const tDashboard = useTranslations("dashboard");
  const prefersReducedMotion = useReducedMotion();
  const { profile, isLoading, isError, error, refetch } = useMyProfile();
  const { changePassword, isPending: isChangingPassword } = useChangeMyPassword();
  const { updateLanguage, isPending: isUpdatingLanguage } = useUpdateMyLanguage();
  const { updateNotificationPreferences, isPending: isUpdatingNotifications } =
    useUpdateMyNotificationPreferences();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationDraft, setNotificationDraft] = useState<NotificationPreferencesDraft>(() =>
    createEmptyNotificationPreferences()
  );
  const [notificationSnapshot, setNotificationSnapshot] = useState<NotificationPreferencesDraft>(
    () => createEmptyNotificationPreferences()
  );
  const notificationDraftRef = useRef(notificationDraft);
  const notificationSnapshotRef = useRef(notificationSnapshot);
  const hasHydratedNotificationPreferencesRef = useRef(false);
  const loadingBlocks = useMemo(() => createLoadingBlocks(), []);

  useEffect(() => {
    notificationDraftRef.current = notificationDraft;
  }, [notificationDraft]);

  useEffect(() => {
    notificationSnapshotRef.current = notificationSnapshot;
  }, [notificationSnapshot]);

  const applyNotificationPreferences = useCallback(
    (
      nextPreferences: NotificationPreferencesDraft,
      options?: {
        forceReset?: boolean;
      }
    ) => {
      const shouldReset =
        options?.forceReset === true ||
        !hasHydratedNotificationPreferencesRef.current ||
        areNotificationPreferencesEqual(
          notificationDraftRef.current,
          notificationSnapshotRef.current
        );

      notificationSnapshotRef.current = nextPreferences;
      setNotificationSnapshot(nextPreferences);

      if (shouldReset) {
        notificationDraftRef.current = nextPreferences;
        setNotificationDraft(nextPreferences);
      }

      hasHydratedNotificationPreferencesRef.current = true;
    },
    []
  );

  useEffect(() => {
    if (!profile) {
      return;
    }

    applyNotificationPreferences(profile.notificationPreferences);
  }, [applyNotificationPreferences, profile]);

  const isNotificationDirty = useMemo(
    () => !areNotificationPreferencesEqual(notificationDraft, notificationSnapshot),
    [notificationDraft, notificationSnapshot]
  );
  const currentLanguageLabel = resolveLanguageLabel(profile?.preferredLanguage ?? "en", tDashboard);

  const handleLanguageChange = async (newLocale: string) => {
    const nextLocale: "en" | "fr" | "es" =
      newLocale === "fr" || newLocale === "es" ? newLocale : "en";

    if (nextLocale === (profile?.preferredLanguage ?? "en")) {
      return;
    }

    try {
      await updateLanguage({ preferredLanguage: nextLocale });
      toast.success(tDashboard("settings_language_success"));
    } catch (languageError) {
      const message =
        languageError instanceof Error
          ? languageError.message
          : tDashboard("settings_language_error");
      toast.error(message);
      throw languageError;
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);

    if (currentPassword.trim().length === 0) {
      setPasswordError(tDashboard("settings_password_current_required"));
      return;
    }

    if (newPassword.length === 0) {
      setPasswordError(tDashboard("settings_password_new_required"));
      return;
    }

    if (!PASSWORD_STRENGTH_REGEX.test(newPassword) || newPassword.length < 8) {
      setPasswordError(tDashboard("settings_password_strength_error"));
      return;
    }

    if (confirmPassword.length === 0) {
      setPasswordError(tDashboard("settings_password_confirm_required"));
      return;
    }

    if (confirmPassword !== newPassword) {
      setPasswordError(tDashboard("settings_password_mismatch"));
      return;
    }

    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(tDashboard("settings_password_success"));
    } catch (passwordSubmitError) {
      const message =
        passwordSubmitError instanceof Error
          ? passwordSubmitError.message
          : tDashboard("settings_password_error");
      setPasswordError(message);
      toast.error(message);
    }
  };

  const handleNotificationSave = async () => {
    setNotificationError(null);

    try {
      const response = await updateNotificationPreferences(notificationDraft);
      applyNotificationPreferences(response.notificationPreferences, { forceReset: true });
      toast.success(tDashboard("settings_notifications_success"));
    } catch (notificationSaveError) {
      const message =
        notificationSaveError instanceof Error
          ? notificationSaveError.message
          : tDashboard("settings_notifications_error");
      setNotificationError(message);
      toast.error(message);
    }
  };

  if (isLoading && !profile) {
    return (
      <section data-testid="profile-settings-settings-panel" className="grid gap-4">
        {loadingBlocks.map((key) => (
          <div
            key={key}
            className="h-36 animate-pulse rounded-[32px] border border-[#2A2A2A] bg-[#111111]"
          />
        ))}
      </section>
    );
  }

  if (isError || !profile) {
    return (
      <section
        data-testid="profile-settings-settings-panel"
        className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5"
      >
        <h2 className="font-sans text-sm font-medium text-white">
          {tDashboard("settings_load_error_title")}
        </h2>
        <p className="font-sans mt-2 text-sm leading-6 text-[#A3A3A3]">
          {error instanceof Error ? error.message : tDashboard("settings_load_error_description")}
        </p>
        <Button
          type="button"
          onClick={() => {
            void refetch();
          }}
          className="font-sans mt-4 min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
        >
          {tDashboard("settings_retry")}
        </Button>
      </section>
    );
  }

  return (
    <section data-testid="profile-settings-settings-panel" className="grid gap-4">
      <form
        noValidate
        onSubmit={handlePasswordSubmit}
        className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5"
      >
        <div className="space-y-1">
          <h2 className="font-sans text-sm font-medium text-white">
            {tDashboard("settings_password_title")}
          </h2>
          <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
            {tDashboard("settings_password_description")}
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label
              className="font-sans text-sm font-medium text-white"
              htmlFor="settings-current-password"
            >
              {tDashboard("settings_password_current_label")}
            </label>
            <Input
              id="settings-current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
              }}
              className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
              placeholder={tDashboard("settings_password_current_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <label
              className="font-sans text-sm font-medium text-white"
              htmlFor="settings-new-password"
            >
              {tDashboard("settings_password_new_label")}
            </label>
            <Input
              id="settings-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
              }}
              className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
              placeholder={tDashboard("settings_password_new_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <label
              className="font-sans text-sm font-medium text-white"
              htmlFor="settings-confirm-password"
            >
              {tDashboard("settings_password_confirm_label")}
            </label>
            <Input
              id="settings-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
              }}
              className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
              placeholder={tDashboard("settings_password_confirm_placeholder")}
            />
          </div>
        </div>

        <FieldError className="mt-4">{passwordError}</FieldError>

        <Button
          type="submit"
          disabled={isChangingPassword}
          className="font-sans mt-5 min-h-12 w-full rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0a72df]"
        >
          {isChangingPassword ? (
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
              {tDashboard("settings_password_submitting")}
            </>
          ) : (
            tDashboard("settings_password_submit")
          )}
        </Button>
      </form>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
          <div className="space-y-1">
            <h2 className="font-sans text-sm font-medium text-white">
              {tDashboard("settings_language_title")}
            </h2>
            <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
              {tDashboard("settings_language_description")}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-[24px] border border-[#2A2A2A] bg-[#0B0B0B] px-4 py-4">
            <div className="space-y-1">
              <p className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-[#A3A3A3]">
                {tDashboard("settings_language_current_label")}
              </p>
              <p className="font-sans text-sm font-medium text-white">{currentLanguageLabel}</p>
            </div>

            <div className="flex items-center gap-3">
              <AnimatePresence initial={false}>
                {isUpdatingLanguage ? (
                  <motion.span
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: prefersReducedMotion ? 0.01 : 0.18, ease: PANEL_EASE }}
                    className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-[#D6D6D6]"
                  >
                    {tDashboard("settings_language_saving")}
                  </motion.span>
                ) : null}
              </AnimatePresence>
              <LanguageSwitcher
                compact
                disabled={isUpdatingLanguage}
                selectedLocale={profile.preferredLanguage}
                onLocaleChange={handleLanguageChange}
                className="rounded-full border border-[#2A2A2A] bg-[#171717] text-white hover:border-[#007eff] hover:bg-[#171717]"
              />
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
          <div className="space-y-1">
            <h2 className="font-sans text-sm font-medium text-white">
              {tDashboard("settings_notifications_title")}
            </h2>
            <p className="font-sans text-sm leading-6 text-[#A3A3A3]">
              {tDashboard("settings_notifications_description")}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {[
              {
                key: "email" as const,
                label: tDashboard("settings_notifications_email_label"),
                description: tDashboard("settings_notifications_email_description"),
              },
              {
                key: "whatsApp" as const,
                label: tDashboard("settings_notifications_whatsapp_label"),
                description: tDashboard("settings_notifications_whatsapp_description"),
              },
              {
                key: "inApp" as const,
                label: tDashboard("settings_notifications_in_app_label"),
                description: tDashboard("settings_notifications_in_app_description"),
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 rounded-[24px] border border-[#2A2A2A] bg-[#0B0B0B] px-4 py-4"
              >
                <div className="space-y-1">
                  <label
                    htmlFor={`settings-notification-${item.key}`}
                    className="font-sans text-sm font-medium text-white"
                  >
                    {item.label}
                  </label>
                  <p className="font-sans text-sm leading-6 text-[#A3A3A3]">{item.description}</p>
                </div>
                <Switch
                  id={`settings-notification-${item.key}`}
                  checked={notificationDraft[item.key]}
                  disabled={isUpdatingNotifications}
                  onCheckedChange={(checked) => {
                    setNotificationDraft((current) => ({
                      ...current,
                      [item.key]: checked,
                    }));
                  }}
                  className={cn(
                    "data-[state=checked]:bg-[#007eff] data-[state=unchecked]:bg-[#2A2A2A]",
                    "focus-visible:ring-[#007eff]/20"
                  )}
                  aria-label={item.label}
                />
              </div>
            ))}
          </div>

          <FieldError className="mt-4">{notificationError}</FieldError>

          <Button
            type="button"
            disabled={isUpdatingNotifications || !isNotificationDirty}
            onClick={() => {
              void handleNotificationSave();
            }}
            className="font-sans mt-5 min-h-12 w-full rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0a72df]"
          >
            {isUpdatingNotifications ? (
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
                {tDashboard("settings_notifications_saving")}
              </>
            ) : (
              tDashboard("settings_notifications_save")
            )}
          </Button>
        </section>
      </div>
    </section>
  );
}
