"use client";

export type SerwistWindowEventType = "waiting" | "controlling";

export type SerwistWindowEvent = {
  isExternal?: boolean;
  isUpdate?: boolean;
  originalEvent?: Event;
  sw?: ServiceWorker | null;
  wasWaitingBeforeRegister?: boolean;
};

export type SerwistWindowController = {
  addEventListener: (
    type: SerwistWindowEventType,
    listener: (event: SerwistWindowEvent) => void
  ) => void;
  removeEventListener: (
    type: SerwistWindowEventType,
    listener: (event: SerwistWindowEvent) => void
  ) => void;
  messageSkipWaiting: () => void;
  update?: () => Promise<unknown>;
};

declare global {
  interface Window {
    serwist?: SerwistWindowController;
  }
}

function normalizePathname(pathname: string | null | undefined) {
  if (!pathname) {
    return "/";
  }

  const trimmed = pathname.trim();
  if (!trimmed) {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return withLeadingSlash === "/" ? "/" : withLeadingSlash.replace(/\/+$/, "");
}

export function isSensitiveServiceWorkerUpdatePath(pathname: string | null | undefined): boolean {
  const normalizedPath = normalizePathname(pathname);

  return (
    normalizedPath === "/checkout" ||
    normalizedPath.startsWith("/checkout/") ||
    normalizedPath === "/payment/confirmation" ||
    normalizedPath.startsWith("/payment/confirmation/") ||
    normalizedPath === "/pay" ||
    normalizedPath.startsWith("/pay/") ||
    normalizedPath === "/signup/finish" ||
    normalizedPath.startsWith("/signup/finish/") ||
    normalizedPath === "/dashboard/books" ||
    normalizedPath.startsWith("/dashboard/books/")
  );
}

export function getSerwistWindowController(): SerwistWindowController | null {
  if (typeof window === "undefined") {
    return null;
  }

  const maybeController = window.serwist;

  if (
    !maybeController ||
    typeof maybeController.addEventListener !== "function" ||
    typeof maybeController.removeEventListener !== "function" ||
    typeof maybeController.messageSkipWaiting !== "function"
  ) {
    return null;
  }

  return maybeController;
}
