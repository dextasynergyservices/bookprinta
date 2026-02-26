"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AddonCard } from "@/components/checkout/AddonCard";
import { type Addon, useAddons } from "@/hooks/useAddons";
import { usePackages } from "@/hooks/usePackages";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
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

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function inferAddonType(addon: Addon): AddonType | null {
  const fingerprint = `${addon.slug} ${addon.name}`.toLowerCase();

  if (fingerprint.includes("isbn")) return "isbn";
  if (fingerprint.includes("format")) return "formatting";
  if (fingerprint.includes("cover")) return "cover";

  return null;
}

function toSelectedAddon(addon: CheckoutAddon, isAutoIncluded: boolean): SelectedAddon {
  return {
    id: addon.id,
    slug: addon.slug,
    name: addon.name,
    type: addon.type,
    price: addon.resolvedPrice,
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
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const packageSlug = searchParams.get("package");
  const categorySlug = searchParams.get("category");

  const { data: packages, isLoading: isLoadingPackages } = usePackages();
  const { data: addons, isLoading: isLoadingAddons, isError: isAddonsError, refetch } = useAddons();

  const {
    hasCoverDesign,
    hasFormatting,
    bookSize,
    paperColor,
    lamination,
    selectedAddons,
    setSelectedPackage,
    setSelectedAddons,
    toggleSelectedAddon,
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

  const addonsByType = useMemo(() => {
    const byType: Partial<Record<AddonType, CheckoutAddon>> = {};

    for (const addon of addons ?? []) {
      const type = inferAddonType(addon);
      if (!type || byType[type]) continue;

      // Formatting is moving from per-word to fixed checkout pricing. Use a temporary fallback
      // so the add-on stays selectable before manuscript upload.
      const fallbackPrice = type === "formatting" ? 35_000 : 0;
      const resolvedPrice = addon.price ?? fallbackPrice;

      byType[type] = {
        ...addon,
        type,
        resolvedPrice,
      };
    }

    return byType;
  }, [addons]);

  const scrollToPaymentSection = () => {
    const paymentSection = document.getElementById("payment-section");
    if (!paymentSection) return;
    paymentSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visibleAddons = useMemo(() => {
    const cards: CheckoutAddon[] = [];

    if (hasCoverDesign === false && addonsByType.cover) {
      cards.push(addonsByType.cover);
    }

    if (hasFormatting === false && addonsByType.formatting) {
      cards.push(addonsByType.formatting);
    }

    if (addonsByType.isbn) {
      cards.push(addonsByType.isbn);
    }

    return cards;
  }, [addonsByType, hasCoverDesign, hasFormatting]);

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
      setSelectedPackage(null);
      return;
    }

    setSelectedPackage({
      id: selectedPackage.id,
      name: selectedPackage.name,
      slug: selectedPackage.slug,
      basePrice: selectedPackage.basePrice,
      includesISBN: selectedPackage.includesISBN,
    });
  }, [selectedPackage, setSelectedPackage]);

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
              {t("title")}
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
                        isLockedIncluded
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
                  onClick={scrollToPaymentSection}
                  className={cn(
                    "mt-5 inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  )}
                >
                  <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
                  {t("addons_continue")}
                </button>
              </div>
            </aside>
          </div>

          <section
            id="payment-section"
            className="mt-10 rounded-3xl border border-[#2A2A2A] bg-[#090909] p-5 md:mt-12 md:p-6"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                  {t("payment_section_title")}
                </h2>
                <p className="mt-2 font-sans text-sm text-white/60">
                  {t("payment_section_subtitle")}
                </p>

                <div className="mt-5 grid grid-cols-1 gap-4">
                  <label className="block">
                    <span className="mb-2 block font-sans text-sm font-medium text-white">
                      {t("full_name")}
                    </span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder={t("full_name")}
                      className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block font-sans text-sm font-medium text-white">
                      {t("email")}
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t("email")}
                      className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block font-sans text-sm font-medium text-white">
                      {t("phone")}
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder={t("phone")}
                      className="min-h-11 w-full rounded-xl border border-[#2A2A2A] bg-black px-4 font-sans text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff]"
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {t("pay_now")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-full border border-[#2A2A2A] bg-black px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:border-[#007eff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {t("bank_transfer")}
                  </button>
                </div>
              </div>

              <aside>
                <div className="rounded-2xl border border-[#2A2A2A] bg-black p-4">
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
                </div>

                <p className="mt-4 font-sans text-xs leading-relaxed text-white/45">
                  {t("payment_verified")}
                </p>
              </aside>
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
            onClick={scrollToPaymentSection}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#007eff] px-5 font-sans text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007eff] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {t("addons_continue")}
          </button>
        </div>
      </div>
    </main>
  );
}
