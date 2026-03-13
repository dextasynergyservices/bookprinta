"use client";

import type { Address, CreateAddressBodyInput } from "@bookprinta/shared";
import { CreateAddressBodySchema } from "@bookprinta/shared";
import { AnimatePresence, motion } from "framer-motion";
import { LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type AddressFormPanelProps = {
  address: Address | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateAddressBodyInput) => Promise<void>;
  open: boolean;
  returnFocusElement?: HTMLElement | null;
};

type AddressFormFields = {
  city: string;
  country: string;
  fullName: string;
  phoneNumber: string;
  state: string;
  street: string;
  zipCode: string;
};

type AddressFormErrors = Partial<Record<keyof AddressFormFields, string>>;

const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

function createFormState(address: Address | null): AddressFormFields {
  return {
    fullName: address?.fullName ?? "",
    phoneNumber: address?.phoneNumber ?? "",
    street: address?.street ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    country: address?.country ?? "",
    zipCode: address?.zipCode ?? "",
  };
}

export function getAddressFormMotionProps(prefersReducedMotion: boolean, isMobile: boolean) {
  if (prefersReducedMotion) {
    return {
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: isMobile ? { y: 0 } : { x: 0 },
        animate: isMobile ? { y: 0 } : { x: 0 },
        exit: isMobile ? { y: 0 } : { x: 0 },
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
    panel: isMobile
      ? {
          initial: { y: "100%" },
          animate: { y: 0 },
          exit: { y: "100%" },
          transition: { duration: 0.28, ease: PANEL_EASE },
        }
      : {
          initial: { x: "100%" },
          animate: { x: 0 },
          exit: { x: "100%" },
          transition: { duration: 0.28, ease: PANEL_EASE },
        },
  };
}

export function AddressFormPanel({
  address,
  isPending,
  onOpenChange,
  onSubmit,
  open,
  returnFocusElement,
}: AddressFormPanelProps) {
  const tDashboard = useTranslations("dashboard");
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [fields, setFields] = useState<AddressFormFields>(() => createFormState(address));
  const [fieldErrors, setFieldErrors] = useState<AddressFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEditing = address !== null;

  useEffect(() => {
    if (!open) {
      return;
    }

    setFields(createFormState(address));
    setFieldErrors({});
    setSubmitError(null);
  }, [address, open]);

  const updateField = (field: keyof AddressFormFields, value: string) => {
    setFields((current) => ({
      ...current,
      [field]: value,
    }));
    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
    setSubmitError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const result = CreateAddressBodySchema.safeParse(fields);
    if (!result.success) {
      const flattened = result.error.flatten();
      setFieldErrors({
        fullName: flattened.fieldErrors.fullName?.[0],
        phoneNumber: flattened.fieldErrors.phoneNumber?.[0],
        street: flattened.fieldErrors.street?.[0],
        city: flattened.fieldErrors.city?.[0],
        state: flattened.fieldErrors.state?.[0],
        country: flattened.fieldErrors.country?.[0],
        zipCode: flattened.fieldErrors.zipCode?.[0],
      });
      setSubmitError(flattened.formErrors[0] ?? null);
      return;
    }

    try {
      await onSubmit(result.data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : tDashboard("addresses_save_error"));
    }
  };

  const motionProps = getAddressFormMotionProps(prefersReducedMotion, isMobile);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence initial={false}>
        {open ? (
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
                data-testid="address-form-shell"
                data-motion-layout={isMobile ? "mobile-sheet" : "desktop-panel"}
                initial={motionProps.panel.initial}
                animate={motionProps.panel.animate}
                exit={motionProps.panel.exit}
                transition={motionProps.panel.transition}
                data-lenis-prevent
                className={
                  isMobile
                    ? "fixed inset-0 z-50 flex items-stretch justify-center outline-none"
                    : "fixed inset-0 z-50 flex items-stretch justify-end outline-none sm:inset-6"
                }
              >
                <div
                  data-testid="address-form-panel"
                  className="relative flex h-full w-full flex-col overflow-hidden border border-[#2A2A2A] bg-[#111111] text-white shadow-[0_32px_96px_rgba(0,0,0,0.72)] sm:max-w-[34rem] sm:rounded-[32px]"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(72% 58% at 16% 0%, rgba(0,126,255,0.18) 0%, rgba(0,0,0,0) 76%)",
                    }}
                  />

                  <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
                    <button
                      ref={closeButtonRef}
                      type="button"
                      onClick={() => onOpenChange(false)}
                      aria-label={tDashboard("addresses_form_close")}
                      className="absolute right-4 top-4 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#0A0A0A] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#111111] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>

                    <header className="pr-14">
                      <p className="font-sans text-[11px] font-semibold tracking-[0.16em] text-[#007eff] uppercase">
                        {tDashboard("addresses")}
                      </p>
                      <DialogPrimitive.Title className="font-display mt-4 text-[2rem] leading-[1.04] font-semibold tracking-tight text-white sm:text-[2.35rem]">
                        {isEditing
                          ? tDashboard("addresses_form_edit_title")
                          : tDashboard("addresses_form_add_title")}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="font-sans mt-3 max-w-xl text-sm leading-6 text-[#BDBDBD] sm:text-[0.95rem]">
                        {isEditing
                          ? tDashboard("addresses_form_edit_description")
                          : tDashboard("addresses_form_add_description")}
                      </DialogPrimitive.Description>
                    </header>

                    <form
                      noValidate
                      onSubmit={handleSubmit}
                      className="mt-6 flex min-h-0 flex-1 flex-col"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <label
                            className="font-sans text-sm font-medium text-white"
                            htmlFor="address-full-name"
                          >
                            {tDashboard("addresses_field_full_name")}
                          </label>
                          <Input
                            id="address-full-name"
                            value={fields.fullName}
                            onChange={(event) => updateField("fullName", event.target.value)}
                            aria-invalid={fieldErrors.fullName ? "true" : undefined}
                            className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                            placeholder={tDashboard("addresses_placeholder_full_name")}
                          />
                          <FieldError>{fieldErrors.fullName}</FieldError>
                        </div>

                        <div className="space-y-2">
                          <label
                            className="font-sans text-sm font-medium text-white"
                            htmlFor="address-phone-number"
                          >
                            {tDashboard("addresses_field_phone")}
                          </label>
                          <Input
                            id="address-phone-number"
                            value={fields.phoneNumber}
                            onChange={(event) => updateField("phoneNumber", event.target.value)}
                            aria-invalid={fieldErrors.phoneNumber ? "true" : undefined}
                            className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                            placeholder={tDashboard("addresses_placeholder_phone")}
                          />
                          <FieldError>{fieldErrors.phoneNumber}</FieldError>
                        </div>

                        <div className="space-y-2">
                          <label
                            className="font-sans text-sm font-medium text-white"
                            htmlFor="address-country"
                          >
                            {tDashboard("addresses_field_country")}
                          </label>
                          <Input
                            id="address-country"
                            value={fields.country}
                            onChange={(event) => updateField("country", event.target.value)}
                            aria-invalid={fieldErrors.country ? "true" : undefined}
                            className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                            placeholder={tDashboard("addresses_placeholder_country")}
                          />
                          <FieldError>{fieldErrors.country}</FieldError>
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <label
                            className="font-sans text-sm font-medium text-white"
                            htmlFor="address-street"
                          >
                            {tDashboard("addresses_field_street")}
                          </label>
                          <Textarea
                            id="address-street"
                            value={fields.street}
                            onChange={(event) => updateField("street", event.target.value)}
                            aria-invalid={fieldErrors.street ? "true" : undefined}
                            className="font-sans min-h-28 rounded-[28px] border-[#2A2A2A] bg-[#0B0B0B] px-4 py-3 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                            placeholder={tDashboard("addresses_placeholder_street")}
                          />
                          <FieldError>{fieldErrors.street}</FieldError>
                        </div>

                        <div className="space-y-2">
                          <label
                            className="font-sans text-sm font-medium text-white"
                            htmlFor="address-city"
                          >
                            {tDashboard("addresses_field_city")}
                          </label>
                          <Input
                            id="address-city"
                            value={fields.city}
                            onChange={(event) => updateField("city", event.target.value)}
                            aria-invalid={fieldErrors.city ? "true" : undefined}
                            className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                            placeholder={tDashboard("addresses_placeholder_city")}
                          />
                          <FieldError>{fieldErrors.city}</FieldError>
                        </div>

                        <div className="space-y-2">
                          <label
                            className="font-sans text-sm font-medium text-white"
                            htmlFor="address-state"
                          >
                            {tDashboard("addresses_field_state")}
                          </label>
                          <Input
                            id="address-state"
                            value={fields.state}
                            onChange={(event) => updateField("state", event.target.value)}
                            aria-invalid={fieldErrors.state ? "true" : undefined}
                            className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                            placeholder={tDashboard("addresses_placeholder_state")}
                          />
                          <FieldError>{fieldErrors.state}</FieldError>
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <label
                            className="font-sans text-sm font-medium text-white"
                            htmlFor="address-postal-code"
                          >
                            {tDashboard("addresses_field_postal_code")}
                          </label>
                          <Input
                            id="address-postal-code"
                            value={fields.zipCode}
                            onChange={(event) => updateField("zipCode", event.target.value)}
                            aria-invalid={fieldErrors.zipCode ? "true" : undefined}
                            className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 text-white placeholder:text-[#6F6F6F] focus-visible:border-[#007eff] focus-visible:ring-[#007eff]/20"
                            placeholder={tDashboard("addresses_placeholder_postal_code")}
                          />
                          <FieldError>{fieldErrors.zipCode}</FieldError>
                        </div>
                      </div>

                      <div className="mt-6 space-y-4 border-t border-[#2A2A2A] pt-5">
                        <FieldError>{submitError}</FieldError>

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                            className="font-sans min-h-11 w-full rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-5 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#141414] sm:w-auto"
                          >
                            {tDashboard("addresses_form_cancel")}
                          </Button>
                          <Button
                            type="submit"
                            disabled={isPending}
                            className="font-sans min-h-11 w-full rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df] sm:w-auto"
                          >
                            {isPending ? (
                              <>
                                <LoaderCircle
                                  className="mr-2 size-4 animate-spin"
                                  aria-hidden="true"
                                />
                                {tDashboard("addresses_form_saving")}
                              </>
                            ) : isEditing ? (
                              tDashboard("addresses_form_update_submit")
                            ) : (
                              tDashboard("addresses_form_add_submit")
                            )}
                          </Button>
                        </div>
                      </div>
                    </form>
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
