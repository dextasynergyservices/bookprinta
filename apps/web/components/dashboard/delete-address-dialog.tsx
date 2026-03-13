"use client";

import type { Address } from "@bookprinta/shared";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type DeleteAddressDialogProps = {
  address: Address | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  returnFocusElement?: HTMLElement | null;
};

const DIALOG_EASE = [0.22, 1, 0.36, 1] as const;

function formatAddressSummary(address: Address) {
  return [address.street, address.city, address.state, address.country].filter(Boolean).join(", ");
}

export function getDeleteAddressDialogMotionProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return {
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: { opacity: 1, scale: 1, y: 0 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 1, scale: 1, y: 0 },
        transition: { duration: 0 },
      },
    };
  }

  return {
    overlay: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.18, ease: "easeOut" as const },
    },
    panel: {
      initial: { opacity: 0, scale: 0.96, y: 16 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.97, y: 12 },
      transition: { duration: 0.24, ease: DIALOG_EASE },
    },
  };
}

export function DeleteAddressDialog({
  address,
  isPending,
  onConfirm,
  onOpenChange,
  open,
  returnFocusElement,
}: DeleteAddressDialogProps) {
  const tDashboard = useTranslations("dashboard");
  const prefersReducedMotion = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const motionProps = getDeleteAddressDialogMotionProps(prefersReducedMotion);

  const handleOpenChange = (nextOpen: boolean) => {
    setSubmitError(null);
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    setSubmitError(null);

    try {
      await onConfirm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : tDashboard("addresses_delete_error"));
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <AnimatePresence initial={false}>
        {open && address ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={motionProps.overlay.initial}
                animate={motionProps.overlay.animate}
                exit={motionProps.overlay.exit}
                transition={motionProps.overlay.transition}
                className="fixed inset-0 z-50 bg-black/82 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content
              asChild
              forceMount
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                closeButtonRef.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusElement?.focus();
              }}
            >
              <motion.section
                data-testid="delete-address-dialog-shell"
                initial={motionProps.panel.initial}
                animate={motionProps.panel.animate}
                exit={motionProps.panel.exit}
                transition={motionProps.panel.transition}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-6"
              >
                <div
                  data-testid="delete-address-dialog"
                  className="relative w-full max-w-lg rounded-[32px] border border-[#2A2A2A] bg-[#111111] text-white shadow-[0_32px_96px_rgba(0,0,0,0.72)]"
                >
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => handleOpenChange(false)}
                    aria-label={tDashboard("addresses_delete_close")}
                    className="absolute right-4 top-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#0A0A0A] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#111111] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>

                  <div className="flex flex-col gap-5 px-5 pb-6 pt-14 sm:px-6 sm:pb-6 sm:pt-6">
                    <div className="flex items-center gap-4">
                      <div className="flex size-14 items-center justify-center rounded-full border border-[#dc2626]/25 bg-[#dc2626]/10 text-[#ffb2b2]">
                        <AlertTriangle className="size-7" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <DialogPrimitive.Title className="font-display text-2xl font-semibold tracking-tight text-white">
                          {tDashboard("addresses_delete_title")}
                        </DialogPrimitive.Title>
                        <DialogPrimitive.Description className="font-sans mt-1 text-sm leading-6 text-[#BDBDBD]">
                          {tDashboard("addresses_delete_description")}
                        </DialogPrimitive.Description>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-[#2A2A2A] bg-[#111111] p-4">
                      <p className="font-sans text-sm font-semibold text-white">
                        {address.fullName}
                      </p>
                      <p className="font-sans mt-2 text-sm leading-6 text-[#BDBDBD]">
                        {formatAddressSummary(address)}
                      </p>
                    </div>

                    <FieldError>{submitError}</FieldError>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={isPending}
                        className="font-sans min-h-11 w-full rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-5 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#141414] sm:w-auto"
                      >
                        {tDashboard("addresses_delete_cancel")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          void handleConfirm();
                        }}
                        disabled={isPending}
                        className="font-sans min-h-11 w-full rounded-full bg-[#dc2626] px-5 text-sm font-semibold text-white hover:bg-[#b91c1c] sm:w-auto"
                      >
                        {isPending ? (
                          <>
                            <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                            {tDashboard("addresses_delete_confirming")}
                          </>
                        ) : (
                          tDashboard("addresses_delete_confirm")
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.section>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
