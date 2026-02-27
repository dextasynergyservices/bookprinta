"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AddonCard } from "@/components/checkout/AddonCard";
import { PaymentMethodModal } from "@/components/checkout/PaymentMethodModal";
import { type Addon, useAddons } from "@/hooks/useAddons";
import { usePackages } from "@/hooks/usePackages";
import { useRouter } from "@/lib/i18n/navigation";
import {
  type AddonType,
  isPricingConfigurationComplete,
  type SelectedAddon,
  selectAddonTotal,
  selectBasePrice,
  selectTotalPrice,
  usePricingStore,
} from "@/stores/usePricingStore";

type CheckoutAddon = Addon & {
  type: AddonType;
  resolvedPrice: number;
};

const FALLBACK_FORMATTING_PRICE = 35_000;

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function inferAddonType(addon: Addon): AddonType {
  const fingerprint = `${addon.slug} ${addon.name}`.toLowerCase();

  if (fingerprint.includes("isbn")) return "isbn";
  if (fingerprint.includes("format")) return "formatting";
  if (fingerprint.includes("cover")) return "cover";

  return "other";
}

function resolveAddonPrice(addon: Addon, type: AddonType) {
  if (typeof addon.price === "number") return addon.price;
  if (type === "formatting") return FALLBACK_FORMATTING_PRICE;
  return 0;
}

function toSelectedAddon(addon: CheckoutAddon, isAutoIncluded: boolean): SelectedAddon {
  return {
    id: addon.id,
    slug: addon.slug,
    name: addon.name,
    type: addon.type,
    price: addon.resolvedPrice,
    pricingType: addon.pricingType,
    pricePerWord: addon.pricePerWord,
    isAutoIncluded,
  };
}

function areAddonsEqual(next: SelectedAddon[], current: SelectedAddon[]) {
  if (next.length !== current.length) return false;

  for (const [index, addon] of next.entries()) {
    const existing = current[index];
    if (
      existing?.id !== addon.id ||
      existing?.price !== addon.price ||
      existing?.isAutoIncluded !== addon.isAutoIncluded
    ) {
      return false;
    }
  }

  return true;
}

function AnimatedAmount({ value }: { value: number }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={value}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -8, opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="font-sans text-xl font-semibold text-white"
      >
        {formatPrice(value)}
      </motion.span>
    </AnimatePresence>
  );
}

export function CheckoutView() {
  const t = useTranslations("checkout");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const packageSlug = searchParams.get("package");
  const categorySlug = searchParams.get("category");

  const { data: packages, isLoading: isLoadingPackages } = usePackages();
  const { data: addons, isLoading: isLoadingAddons, isError: isAddonsError, refetch } = useAddons();

  const {
    selectedPackage: pricingSelectedPackage,
    hasCoverDesign,
    hasFormatting,
    bookSize,
    paperColor,
    lamination,
    selectedAddons,
    setSelectedPackage,
    setSelectedAddons,
    toggleSelectedAddon,
    toPaymentMetadata,
  } = usePricingStore();

  const packageBasePrice = usePricingStore(selectBasePrice);
  const addonTotal = usePricingStore(selectAddonTotal);
  const orderTotal = usePricingStore(selectTotalPrice);

  const isConfigurationComplete = isPricingConfigurationComplete({
    hasCoverDesign,
    hasFormatting,
    bookSize,
    paperColor,
    lamination,
  });

  const selectedPackage = useMemo(() => {
    if (!packages || !packageSlug) return null;

    const exactMatch = packages.find(
      (pkg) => pkg.slug === packageSlug && (!categorySlug || pkg.category.slug === categorySlug)
    );

    if (exactMatch) return exactMatch;

    return packages.find((pkg) => pkg.slug === packageSlug) ?? null;
  }, [categorySlug, packageSlug, packages]);

  const checkoutAddons = useMemo(() => {
    return (addons ?? []).map((addon) => {
      const type = inferAddonType(addon);
      return {
        ...addon,
        type,
        resolvedPrice: resolveAddonPrice(addon, type),
      };
    });
  }, [addons]);

  const openPaymentModal = () => setIsPaymentModalOpen(true);

  const visibleAddons = checkoutAddons;

  useEffect(() => {
    if (!selectedPackage) return;

    const selectedById = new Map(selectedAddons.map((addon) => [addon.id, addon]));
    const nextSelected: SelectedAddon[] = [];

    for (const addon of visibleAddons) {
      const lockAsIncluded = addon.type === "isbn" && selectedPackage.includesISBN;

      if (lockAsIncluded) {
        nextSelected.push(toSelectedAddon(addon, true));
        continue;
      }

      const existing = selectedById.get(addon.id);
      if (existing && !existing.isAutoIncluded) {
        nextSelected.push(toSelectedAddon(addon, false));
      }
    }

    if (!areAddonsEqual(nextSelected, selectedAddons)) {
      setSelectedAddons(nextSelected);
    }
  }, [selectedAddons, selectedPackage, setSelectedAddons, visibleAddons]);

  useEffect(() => {
    if (!selectedPackage) {
      if (pricingSelectedPackage !== null) {
        setSelectedPackage(null);
      }
      return;
    }

    const hasSamePackage =
      pricingSelectedPackage?.id === selectedPackage.id &&
      pricingSelectedPackage?.slug === selectedPackage.slug &&
      pricingSelectedPackage?.basePrice === selectedPackage.basePrice &&
      pricingSelectedPackage?.includesISBN === selectedPackage.includesISBN;

    if (hasSamePackage) return;

    setSelectedPackage({
      id: selectedPackage.id,
      name: selectedPackage.name,
      slug: selectedPackage.slug,
      basePrice: selectedPackage.basePrice,
      includesISBN: selectedPackage.includesISBN,
    });
  }, [pricingSelectedPackage, selectedPackage, setSelectedPackage]);

  const isLoading = isLoadingPackages || isLoadingAddons;

  if (!packageSlug) {
    return (
      <main className="min-h-screen bg-black px-4 py-16 text-white md:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#2A2A2A] bg-[#0a0a0a] p-8 text-center">
          <p className="font-sans text-base text-white/70">{t("addons_missing_package")}</p>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="mt-5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-95"
          >
            {t("addons_back_to_pricing")}
          </button>
        </div>
      </main>
    );
  }

  if (!isConfigurationComplete) {
    return (
      <main className="min-h-screen bg-black px-4 py-16 text-white md:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#2A2A2A] bg-[#0a0a0a] p-8 text-center">
          <p className="font-sans text-base text-white/70">{t("addons_configuration_required")}</p>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="mt-5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-95"
          >
            {t("addons_back_to_pricing")}
          </button>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black px-4 py-16 text-white md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 rounded-3xl border border-[#2A2A2A] bg-[#0a0a0a] p-10">
          <Loader2 className="size-4 animate-spin text-[#007eff]" aria-hidden="true" />
          <span className="font-sans text-sm text-white/65">{t("addons_loading")}</span>
        </div>
      </main>
    );
  }

  if (!selectedPackage || isAddonsError) {
    return (
      <main className="min-h-screen bg-black px-4 py-16 text-white md:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#2A2A2A] bg-[#0a0a0a] p-8 text-center">
          <p className="font-sans text-base text-white/70">{t("addons_error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-95"
          >
            {t("addons_retry")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white md:pb-12">
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 15% 20%, rgba(0,126,255,0.2), transparent 36%), radial-gradient(circle at 85% 0%, rgba(255,255,255,0.08), transparent 42%)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-10 md:px-6 md:pt-14 lg:px-8">
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            aria-label={t("addons_back_to_pricing_aria")}
            className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-full border border-[#2A2A2A] bg-black px-4 font-sans text-sm font-medium text-white/80 transition-colors duration-150 hover:border-[#007eff] hover:text-white"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("addons_back_to_pricing")}
          </button>

          <div className="mt-6 flex flex-col gap-2">
            <span className="inline-flex w-fit items-center rounded-full border border-[#007eff]/40 bg-[#007eff]/15 px-3 py-1 font-sans text-[11px] font-semibold tracking-[0.12em] text-[#a7d4ff] uppercase">
              {t("addons_step_badge")}
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
              {t("addons_title")}
            </h1>
            <p className="max-w-2xl font-sans text-sm text-white/65 md:text-base">
              {t("addons_subtitle")}
            </p>
          </div>

          <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
            <div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleAddons.map((addon) => {
                  const isLockedIncluded = addon.type === "isbn" && selectedPackage.includesISBN;
                  const isSelected = selectedAddons.some((item) => item.id === addon.id);

                  const includedNote = isLockedIncluded
                    ? t("addons_isbn_included_note", { packageName: selectedPackage.name })
                    : undefined;

                  const notice =
                    addon.type === "formatting"
                      ? t("addons_formatting_extra_page_notice")
                      : undefined;

                  return (
                    <AddonCard
                      key={addon.id}
                      name={addon.name}
                      description={addon.description}
                      priceLabel={
                        addon.type === "isbn" && selectedPackage.includesISBN
                          ? t("addons_included_label")
                          : formatPrice(addon.resolvedPrice)
                      }
                      selected={isSelected}
                      disabled={isLockedIncluded}
                      includedNote={includedNote}
                      notice={notice}
                      ariaLabel={t("addons_card_aria", { addonName: addon.name })}
                      onToggle={() => {
                        if (isLockedIncluded) return;
                        toggleSelectedAddon(toSelectedAddon(addon, false));
                      }}
                    />
                  );
                })}
              </div>

              {visibleAddons.length === 0 ? (
                <div className="rounded-2xl border border-[#2A2A2A] bg-[#0e0e0e] px-5 py-6">
                  <p className="font-sans text-sm text-white/65">{t("addons_none_relevant")}</p>
                </div>
              ) : null}
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-24 rounded-3xl border border-[#2A2A2A] bg-[#090909] p-5">
                <p className="font-sans text-xs font-medium tracking-[0.08em] text-white/45 uppercase">
                  {t("configuration_package", { packageName: selectedPackage.name })}
                </p>
                <p className="font-sans text-xs font-medium tracking-[0.08em] text-white/45 uppercase">
                  {t("package_base_total")}
                </p>
                <p className="mt-2 font-sans text-lg font-semibold text-white">
                  {formatPrice(packageBasePrice)}
                </p>

                <p className="mt-4 font-sans text-xs font-medium tracking-[0.08em] text-white/45 uppercase">
                  {t("addon_total")}
                </p>
                <div className="mt-2">
                  <AnimatedAmount value={addonTotal} />
                </div>

                <p className="mt-4 font-sans text-xs font-medium tracking-[0.08em] text-white/45 uppercase">
                  {t("order_total")}
                </p>
                <p className="mt-2 font-sans text-2xl font-semibold text-white">
                  {formatPrice(orderTotal)}
                </p>

                <div className="mt-5 rounded-2xl border border-[#2A2A2A] bg-black px-4 py-3">
                  <p className="font-sans text-xs text-white/55">
                    {t("addons_selected_count", { count: selectedAddons.length })}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openPaymentModal}
                  className="mt-5 inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
                  {t("addons_continue")}
                </button>
              </div>
            </aside>
          </div>

          <section className="mt-10 rounded-3xl border border-[#2A2A2A] bg-[#090909] p-5 md:mt-12 md:p-6 lg:hidden">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                {t("payment_section_title")}
              </h2>
              <p className="mt-2 font-sans text-sm text-white/60">
                {t("payment_section_subtitle")}
              </p>

              <div className="mt-5 rounded-2xl border border-[#2A2A2A] bg-black p-4 md:p-5">
                <p className="font-sans text-xs font-medium tracking-[0.08em] text-white/45 uppercase">
                  {t("configuration_package", { packageName: selectedPackage.name })}
                </p>
                <p className="font-sans text-xs font-medium tracking-[0.08em] text-white/45 uppercase">
                  {t("order_total")}
                </p>
                <p className="mt-2 font-sans text-3xl font-semibold text-white">
                  {formatPrice(orderTotal)}
                </p>

                <div className="mt-4 space-y-2 border-t border-[#2A2A2A] pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-sans text-sm text-white/65">
                      {t("package_base_total")}
                    </span>
                    <span className="font-sans text-sm font-medium text-white">
                      {formatPrice(packageBasePrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-sans text-sm text-white/65">{t("addon_total")}</span>
                    <span className="font-sans text-sm font-medium text-white">
                      {formatPrice(addonTotal)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#2A2A2A] bg-[#0a0a0a] px-4 py-3">
                  <p className="font-sans text-xs text-white/55">
                    {t("addons_selected_count", { count: selectedAddons.length })}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openPaymentModal}
                className="mt-5 inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
                {t("addons_continue")}
              </button>

              <p className="mt-4 font-sans text-xs leading-relaxed text-white/45">
                {t("payment_verified")}
              </p>
            </div>
          </section>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#2A2A2A] bg-black/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="font-sans text-[11px] tracking-[0.08em] text-white/50 uppercase">
              {t("order_total")}
            </p>
            <AnimatedAmount value={orderTotal} />
          </div>

          <button
            type="button"
            onClick={openPaymentModal}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {t("addons_continue")}
          </button>
        </div>
      </div>

      <PaymentMethodModal
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
        amount={orderTotal}
        packageName={selectedPackage.name}
        paymentMetadata={toPaymentMetadata()}
      />
    </main>
  );
}
