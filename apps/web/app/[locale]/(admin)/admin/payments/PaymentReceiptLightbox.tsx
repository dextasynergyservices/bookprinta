"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, LoaderCircle, X } from "lucide-react";
import Image, { type ImageLoaderProps } from "next/image";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaymentReceiptLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: PaymentReceiptPreviewTarget;
};

export type PaymentReceiptPreviewTarget = {
  receiptUrl: string;
  payerName: string;
  orderReference: string;
  amountLabel: string;
  receivedAtLabel: string;
};

type ReceiptPreviewKind = "image" | "file";

function resolveReceiptPreviewKind(receiptUrl: string): ReceiptPreviewKind {
  const normalized = receiptUrl.trim().toLowerCase();

  if (normalized.startsWith("data:image/")) {
    return "image";
  }

  if (
    normalized.startsWith("data:application/pdf") ||
    normalized.startsWith("data:application/vnd") ||
    normalized.startsWith("data:application/msword")
  ) {
    return "file";
  }

  try {
    const parsed = new URL(receiptUrl);
    if (parsed.pathname.includes("/raw/upload/")) {
      return "file";
    }

    if (parsed.pathname.includes("/image/upload/")) {
      return "image";
    }
  } catch {
    // Ignore parse errors and fall through to extension checks.
  }

  if (/\.(png|jpe?g|webp|gif|avif|bmp|svg)(?:$|[?#])/i.test(normalized)) {
    return "image";
  }

  return "file";
}

function canOptimizeReceiptImage(receiptUrl: string): boolean {
  try {
    const parsed = new URL(receiptUrl);
    return parsed.protocol === "https:" && parsed.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function passthroughReceiptLoader({ src }: ImageLoaderProps): string {
  return src;
}

export function PaymentReceiptLightbox({
  open,
  onOpenChange,
  preview,
}: PaymentReceiptLightboxProps) {
  const tAdmin = useTranslations("admin");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const previewKind = useMemo(
    () => resolveReceiptPreviewKind(preview.receiptUrl),
    [preview.receiptUrl]
  );
  const canOptimizeImage = useMemo(
    () => previewKind === "image" && canOptimizeReceiptImage(preview.receiptUrl),
    [preview.receiptUrl, previewKind]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setHasLoaded(false);
    setHasError(false);
  }, [open]);

  const receiptAlt = tAdmin("payments_receipt_lightbox_alt", {
    payer: preview.payerName,
    orderReference: preview.orderReference,
  });
  const showLoadingState = previewKind === "image" && !hasLoaded && !hasError;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence initial={false}>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                data-slot="dialog-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-black/88 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 18 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="fixed inset-3 z-[60] flex flex-col overflow-hidden rounded-[1.75rem] border border-[#2A2A2A] bg-[#050505] text-white shadow-[0_32px_120px_rgba(0,0,0,0.68)] outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(90vh,56rem)] sm:w-[min(72rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
              >
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  <div className="absolute left-[-4rem] top-[-5rem] size-72 rounded-full bg-[#007eff]/16 blur-3xl" />
                  <div className="absolute bottom-[-6rem] right-[-4rem] size-80 rounded-full bg-[#EF4444]/12 blur-3xl" />
                </div>

                <div className="relative z-10 flex items-start justify-between gap-4 border-b border-[#1F1F1F] px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="font-display text-2xl font-semibold tracking-[-0.03em] text-white">
                      {tAdmin("payments_receipt_lightbox_title")}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="font-sans mt-2 max-w-2xl text-sm leading-6 text-[#B4B4B4]">
                      {tAdmin("payments_receipt_lightbox_description")}
                    </DialogPrimitive.Description>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex min-h-9 items-center rounded-full border border-[#2A2A2A] bg-[#101010] px-3 font-sans text-xs text-[#D6D6D6]">
                        {tAdmin("payments_receipt_lightbox_order_reference", {
                          orderReference: preview.orderReference,
                        })}
                      </span>
                      <span className="inline-flex min-h-9 items-center rounded-full border border-[#2A2A2A] bg-[#101010] px-3 font-sans text-xs text-[#D6D6D6]">
                        {preview.amountLabel}
                      </span>
                      <span className="inline-flex min-h-9 items-center rounded-full border border-[#2A2A2A] bg-[#101010] px-3 font-sans text-xs text-[#D6D6D6]">
                        {preview.receivedAtLabel}
                      </span>
                    </div>
                  </div>

                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label={tAdmin("payments_receipt_lightbox_close")}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#0F0F0F] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#151515] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                  <div className="relative flex min-h-[18rem] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_55%),linear-gradient(180deg,#050505_0%,#090909_100%)] px-4 py-4 sm:px-6 sm:py-6">
                    {showLoadingState ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#070707]/92">
                        <LoaderCircle
                          className="size-6 animate-spin text-[#007eff]"
                          aria-hidden="true"
                        />
                        <p className="font-sans text-sm text-[#CFCFCF]">
                          {tAdmin("payments_receipt_lightbox_loading")}
                        </p>
                      </div>
                    ) : null}

                    {previewKind === "file" ? (
                      <div className="mx-auto max-w-lg rounded-[1.5rem] border border-[#2A2A2A] bg-[#0F0F0F] p-6 text-center">
                        <p className="font-display text-xl font-semibold text-white">
                          {tAdmin("payments_receipt_lightbox_file_title")}
                        </p>
                        <p className="font-sans mt-3 text-sm leading-6 text-[#CFCFCF]">
                          {tAdmin("payments_receipt_lightbox_file_description")}
                        </p>
                      </div>
                    ) : hasError ? (
                      <div className="mx-auto max-w-lg rounded-[1.5rem] border border-[#3A191E] bg-[#14090B] p-6 text-center">
                        <p className="font-display text-xl font-semibold text-white">
                          {tAdmin("payments_receipt_lightbox_error_title")}
                        </p>
                        <p className="font-sans mt-3 text-sm leading-6 text-[#D7B8BD]">
                          {tAdmin("payments_receipt_lightbox_error_description")}
                        </p>
                      </div>
                    ) : (
                      <Image
                        src={preview.receiptUrl}
                        alt={receiptAlt}
                        width={1600}
                        height={2200}
                        sizes="(max-width: 640px) calc(100vw - 2rem), 72rem"
                        loader={canOptimizeImage ? undefined : passthroughReceiptLoader}
                        unoptimized={!canOptimizeImage}
                        onLoad={() => setHasLoaded(true)}
                        onError={() => {
                          setHasLoaded(false);
                          setHasError(true);
                        }}
                        className={cn(
                          "h-auto max-h-full w-auto max-w-full rounded-[1.5rem] border border-[#1C1C1C] bg-[#090909] object-contain shadow-[0_24px_70px_rgba(0,0,0,0.42)] transition-opacity duration-200",
                          hasLoaded ? "opacity-100" : "opacity-0"
                        )}
                      />
                    )}
                  </div>

                  <div className="border-t border-[#1F1F1F] px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-sans text-sm text-[#B4B4B4]">
                        {tAdmin("payments_receipt_lightbox_hint", {
                          payer: preview.payerName,
                        })}
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onOpenChange(false)}
                          className="min-h-11 rounded-full border-[#2A2A2A] bg-[#080808] px-4 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#101010]"
                        >
                          {tAdmin("payments_receipt_lightbox_close")}
                        </Button>
                        <Button
                          type="button"
                          asChild
                          className="min-h-11 rounded-full bg-[#007eff] px-4 font-sans text-sm font-bold text-white hover:bg-[#0069d9]"
                        >
                          <a href={preview.receiptUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" aria-hidden="true" />
                            <span>{tAdmin("payments_receipt_lightbox_open_external")}</span>
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
