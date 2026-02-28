import { create } from "zustand";

export type BookSize = "A4" | "A5" | "A6";
export type PaperColor = "white" | "cream";
export type Lamination = "matt" | "gloss";
export type AddonType = "cover" | "formatting" | "isbn" | "other";

type NullableBoolean = boolean | null;
type AddonSource = "selected";

export interface PricingPackage {
  id: string;
  name: string;
  slug: string;
  basePrice: number;
  includesISBN: boolean;
}

export interface PricingAddon {
  id: string;
  slug: string;
  name: string;
  type?: AddonType;
  price: number;
  pricingType?: "fixed" | "per_word";
  pricePerWord?: number | null;
  isAutoIncluded?: boolean;
}

export type SelectedAddon = PricingAddon;

export interface AddonBreakdownItem {
  name: string;
  price: number;
}

export interface PaymentMetadataAddon {
  id: string | null;
  slug: string;
  name: string;
  price: number;
  source: AddonSource;
}

export interface PaymentMetadata {
  hasCover: boolean;
  hasFormatting: boolean;
  tier: string | null;
  packageId: string | null;
  packageSlug: string | null;
  packageName: string | null;
  includesISBN: boolean;
  bookSize: BookSize | null;
  paperColor: PaperColor | null;
  lamination: Lamination | null;
  formattingWordCount: number;
  couponCode: string | null;
  discountAmount: number;
  basePrice: number;
  addonTotal: number;
  totalPrice: number;
  addons: PaymentMetadataAddon[];
  addonBreakdown: AddonBreakdownItem[];
}

type PricingCalculationInput = {
  selectedPackage: PricingPackage | null;
  selectedAddons: PricingAddon[];
  formattingWordCount: number;
  formattingPricePerWord: number;
  discountAmount: number;
};

type ChargeLine = {
  id: string | null;
  slug: string;
  name: string;
  price: number;
  source: AddonSource;
};

function toCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Number(value.toFixed(2)));
}

function addonFingerprint(addon: Pick<PricingAddon, "slug" | "name">) {
  return `${addon.slug} ${addon.name}`.toLowerCase();
}

function isIsbnAddon(addon: Pick<PricingAddon, "slug" | "name" | "type">) {
  if (addon.type === "isbn") return true;
  const fp = addonFingerprint(addon);
  return fp.includes("isbn");
}

function resolveAddonPrice(addon: PricingAddon, input: PricingCalculationInput) {
  const effectivePerWordPrice =
    input.formattingPricePerWord > 0 ? input.formattingPricePerWord : addon.pricePerWord;
  if (
    addon.pricingType === "per_word" &&
    effectivePerWordPrice &&
    input.formattingWordCount > 0 &&
    effectivePerWordPrice > 0
  ) {
    return toCurrency(input.formattingWordCount * effectivePerWordPrice);
  }

  return toCurrency(addon.price);
}

function getSelectableAddonCharges(input: PricingCalculationInput): ChargeLine[] {
  return input.selectedAddons
    .filter((addon) => !addon.isAutoIncluded)
    .filter((addon) => !(input.selectedPackage?.includesISBN && isIsbnAddon(addon)))
    .map((addon) => ({
      id: addon.id,
      slug: addon.slug,
      name: addon.name,
      price: resolveAddonPrice(addon, input),
      source: "selected" as const,
    }))
    .filter((addon) => addon.price > 0);
}

function getChargeLines(input: PricingCalculationInput) {
  return getSelectableAddonCharges(input);
}

function getBasePriceValue(input: PricingCalculationInput) {
  return toCurrency(input.selectedPackage?.basePrice ?? 0);
}

function getAddonTotalValue(input: PricingCalculationInput) {
  return toCurrency(getChargeLines(input).reduce((sum, line) => sum + line.price, 0));
}

function getAddonBreakdownValue(input: PricingCalculationInput): AddonBreakdownItem[] {
  return getChargeLines(input).map((line) => ({ name: line.name, price: line.price }));
}

function getTotalPriceValue(input: PricingCalculationInput) {
  const subtotal = getBasePriceValue(input) + getAddonTotalValue(input);
  const discount = toCurrency(Math.min(subtotal, Math.max(0, input.discountAmount)));
  return toCurrency(Math.max(0, subtotal - discount));
}

export interface PricingState {
  selectedPackage: PricingPackage | null;
  hasCoverDesign: NullableBoolean;
  hasFormatting: NullableBoolean;
  bookSize: BookSize | null;
  paperColor: PaperColor | null;
  lamination: Lamination | null;
  selectedAddons: PricingAddon[];
  formattingWordCount: number;
  formattingPricePerWord: number;
  couponCode: string | null;
  discountAmount: number;
  setSelectedPackage: (pkg: PricingPackage | null) => void;
  setHasCoverDesign: (value: NullableBoolean) => void;
  setHasFormatting: (value: NullableBoolean) => void;
  setBookSize: (value: BookSize | null) => void;
  setPaperColor: (value: PaperColor | null) => void;
  setLamination: (value: Lamination | null) => void;
  setSelectedAddons: (addons: PricingAddon[]) => void;
  toggleSelectedAddon: (addon: PricingAddon) => void;
  removeSelectedAddon: (addonId: string) => void;
  applyFormattingCost: (wordCount: number, pricePerWord: number) => void;
  applyCoupon: (code: string, discountAmount: number) => void;
  clearCoupon: () => void;
  getBasePrice: () => number;
  getAddonBreakdown: () => AddonBreakdownItem[];
  getAddonTotal: () => number;
  getTotalPrice: () => number;
  toPaymentMetadata: () => PaymentMetadata;
  reset: () => void;
  resetConfiguration: () => void;
}

const INITIAL_STATE = {
  selectedPackage: null,
  hasCoverDesign: null,
  hasFormatting: null,
  bookSize: null,
  paperColor: null,
  lamination: null,
  selectedAddons: [],
  formattingWordCount: 0,
  formattingPricePerWord: 0,
  couponCode: null,
  discountAmount: 0,
} satisfies Pick<
  PricingState,
  | "selectedPackage"
  | "hasCoverDesign"
  | "hasFormatting"
  | "bookSize"
  | "paperColor"
  | "lamination"
  | "selectedAddons"
  | "formattingWordCount"
  | "formattingPricePerWord"
  | "couponCode"
  | "discountAmount"
>;

export const usePricingStore = create<PricingState>((set, get) => ({
  ...INITIAL_STATE,
  setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),
  setHasCoverDesign: (value) => set({ hasCoverDesign: value }),
  setHasFormatting: (value) => set({ hasFormatting: value }),
  setBookSize: (value) => set({ bookSize: value }),
  setPaperColor: (value) => set({ paperColor: value }),
  setLamination: (value) => set({ lamination: value }),
  setSelectedAddons: (addons) =>
    set({
      selectedAddons: Array.from(new Map(addons.map((addon) => [addon.id, addon])).values()),
    }),
  toggleSelectedAddon: (addon) =>
    set((state) => {
      const exists = state.selectedAddons.some((item) => item.id === addon.id);
      if (exists) {
        return {
          selectedAddons: state.selectedAddons.filter((item) => item.id !== addon.id),
        };
      }
      return {
        selectedAddons: [...state.selectedAddons, addon],
      };
    }),
  removeSelectedAddon: (addonId) =>
    set((state) => ({
      selectedAddons: state.selectedAddons.filter((addon) => addon.id !== addonId),
    })),
  applyFormattingCost: (wordCount, pricePerWord) =>
    set({
      formattingWordCount: Math.max(0, Math.floor(wordCount)),
      formattingPricePerWord: Math.max(0, pricePerWord),
    }),
  applyCoupon: (code, discountAmount) =>
    set({
      couponCode: code.trim() || null,
      discountAmount: toCurrency(Math.max(0, discountAmount)),
    }),
  clearCoupon: () => set({ couponCode: null, discountAmount: 0 }),
  getBasePrice: () => getBasePriceValue(get()),
  getAddonBreakdown: () => getAddonBreakdownValue(get()),
  getAddonTotal: () => getAddonTotalValue(get()),
  getTotalPrice: () => getTotalPriceValue(get()),
  toPaymentMetadata: () => {
    const state = get();
    const chargeLines = getChargeLines(state);

    return {
      hasCover: state.hasCoverDesign ?? false,
      hasFormatting: state.hasFormatting ?? false,
      tier: state.selectedPackage?.slug ?? null,
      packageId: state.selectedPackage?.id ?? null,
      packageSlug: state.selectedPackage?.slug ?? null,
      packageName: state.selectedPackage?.name ?? null,
      includesISBN: state.selectedPackage?.includesISBN ?? false,
      bookSize: state.bookSize,
      paperColor: state.paperColor,
      lamination: state.lamination,
      formattingWordCount: state.formattingWordCount,
      couponCode: state.couponCode,
      discountAmount: state.discountAmount,
      basePrice: getBasePriceValue(state),
      addonTotal: getAddonTotalValue(state),
      totalPrice: getTotalPriceValue(state),
      addons: chargeLines.map((line) => ({
        id: line.id,
        slug: line.slug,
        name: line.name,
        price: line.price,
        source: line.source,
      })),
      addonBreakdown: getAddonBreakdownValue(state),
    };
  },
  reset: () => set(INITIAL_STATE),
  resetConfiguration: () => set(INITIAL_STATE),
}));

export const selectBasePrice = (state: PricingState) => state.getBasePrice();
export const selectAddonBreakdown = (state: PricingState) => state.getAddonBreakdown();
export const selectAddonTotal = (state: PricingState) => state.getAddonTotal();
export const selectTotalPrice = (state: PricingState) => state.getTotalPrice();

type PricingConfigurationFields = Pick<
  PricingState,
  "hasCoverDesign" | "hasFormatting" | "bookSize" | "paperColor" | "lamination"
>;

export function isPricingConfigurationComplete(state: PricingConfigurationFields) {
  return (
    state.hasCoverDesign !== null &&
    state.hasFormatting !== null &&
    state.bookSize !== null &&
    state.paperColor !== null &&
    state.lamination !== null
  );
}
