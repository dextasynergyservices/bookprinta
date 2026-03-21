"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * localStorage key for tracking install-banner dismissals.
 * Stores a JSON object: { dismissedAt: number, count: number }
 */
const STORAGE_KEY = "bookprinta_pwa_install_dismissed";

/** localStorage key set permanently once the app is installed. */
const INSTALLED_KEY = "bookprinta_pwa_installed";

/** Re-show the banner after 3 days of dismissal. */
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface DismissalRecord {
  dismissedAt: number;
  count: number;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function wasInstalledPreviously(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(INSTALLED_KEY) === "true";
}

function getDismissalRecord(): DismissalRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DismissalRecord;
  } catch {
    return null;
  }
}

function isDismissCooldownActive(): boolean {
  const record = getDismissalRecord();
  if (!record) return false;
  return Date.now() - record.dismissedAt < DISMISS_COOLDOWN_MS;
}

function saveDismissal(): void {
  if (typeof localStorage === "undefined") return;
  const existing = getDismissalRecord();
  const record: DismissalRecord = {
    dismissedAt: Date.now(),
    count: (existing?.count ?? 0) + 1,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

function markInstalled(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(INSTALLED_KEY, "true");
  localStorage.removeItem(STORAGE_KEY);
}

export type InstallPromptState = {
  /** Whether to show the install banner. */
  canShow: boolean;
  /** True on iOS (no `beforeinstallprompt` — show manual instructions). */
  isIOS: boolean;
  /** Trigger the native install prompt (Chromium browsers only). */
  install: () => Promise<void>;
  /** Dismiss the banner for 7 days. */
  dismiss: () => void;
};

export function useInstallPrompt(): InstallPromptState {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canShow, setCanShow] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);

  useEffect(() => {
    // Already running as installed PWA — never show.
    if (isStandalone() || wasInstalledPreviously()) return;

    // Still within the 7-day dismiss cooldown — don't show yet.
    if (isDismissCooldownActive()) return;

    // iOS: no beforeinstallprompt, show manual instructions.
    if (isIOS()) {
      setIosDevice(true);
      setCanShow(true);
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      // Prevent the browser's default mini-infobar.
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setCanShow(true);
    };

    const handleAppInstalled = () => {
      markInstalled();
      deferredPromptRef.current = null;
      setCanShow(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    const result = await prompt.prompt();
    if (result.outcome === "accepted") {
      markInstalled();
    }
    deferredPromptRef.current = null;
    setCanShow(false);
  }, []);

  const dismiss = useCallback(() => {
    saveDismissal();
    setCanShow(false);
  }, []);

  return { canShow, isIOS: iosDevice, install, dismiss };
}
