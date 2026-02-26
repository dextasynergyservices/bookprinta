import { type PricingAddon, type PricingPackage, usePricingStore } from "@/stores/usePricingStore";

const PACKAGE_WITHOUT_ISBN: PricingPackage = {
  id: "pkg_1",
  name: "First Draft",
  slug: "first-draft",
  basePrice: 100_000,
  includesISBN: false,
};

const PACKAGE_WITH_ISBN: PricingPackage = {
  id: "pkg_2",
  name: "Legacy",
  slug: "legacy",
  basePrice: 100_000,
  includesISBN: true,
};

const COVER_ADDON: PricingAddon = {
  id: "addon_cover",
  slug: "cover-design",
  name: "Cover Design",
  type: "cover",
  price: 45_000,
  pricingType: "fixed",
};

const FORMATTING_ADDON_PER_WORD: PricingAddon = {
  id: "addon_formatting",
  slug: "content-formatting",
  name: "Formatting",
  type: "formatting",
  price: 0,
  pricingType: "per_word",
  pricePerWord: 0.5,
};

const ISBN_ADDON: PricingAddon = {
  id: "addon_isbn",
  slug: "isbn-barcode",
  name: "ISBN + Barcode",
  type: "isbn",
  price: 15_000,
  pricingType: "fixed",
};

const EXPRESS_ADDON: PricingAddon = {
  id: "addon_express",
  slug: "express-delivery",
  name: "Express Delivery",
  type: "other",
  price: 5_000,
  pricingType: "fixed",
};

describe("usePricingStore scenario pricing", () => {
  beforeEach(() => {
    usePricingStore.getState().reset();
  });

  it("calculates The Pro: base + selected addons", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(true);
    store.setHasFormatting(true);
    store.setSelectedAddons([EXPRESS_ADDON]);

    expect(store.getBasePrice()).toBe(100_000);
    expect(store.getTotalPrice()).toBe(105_000);
    expect(store.getAddonBreakdown()).toEqual([{ name: "Express Delivery", price: 5_000 }]);
  });

  it("calculates The Writer: base + cover fee + selected addons", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(false);
    store.setHasFormatting(true);
    store.setSelectedAddons([COVER_ADDON, EXPRESS_ADDON]);

    expect(store.getTotalPrice()).toBe(150_000);
    expect(store.getAddonBreakdown()).toEqual([
      { name: "Express Delivery", price: 5_000 },
      { name: "Cover Design", price: 45_000 },
    ]);
  });

  it("calculates The Designer: base + formatting cost + selected addons", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(true);
    store.setHasFormatting(false);
    store.setSelectedAddons([FORMATTING_ADDON_PER_WORD, EXPRESS_ADDON]);
    store.applyFormattingCost(12_000, 0.5);

    expect(store.getTotalPrice()).toBe(111_000);
    expect(store.getAddonBreakdown()).toEqual([
      { name: "Express Delivery", price: 5_000 },
      { name: "Formatting", price: 6_000 },
    ]);
  });

  it("calculates The Newbie: base + cover + formatting + selected addons", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(false);
    store.setHasFormatting(false);
    store.setSelectedAddons([COVER_ADDON, FORMATTING_ADDON_PER_WORD, EXPRESS_ADDON]);
    store.applyFormattingCost(10_000, 0.5);

    expect(store.getTotalPrice()).toBe(155_000);
    expect(store.getAddonBreakdown()).toEqual([
      { name: "Express Delivery", price: 5_000 },
      { name: "Cover Design", price: 45_000 },
      { name: "Formatting", price: 5_000 },
    ]);
  });

  it("excludes ISBN from total when package includes ISBN", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITH_ISBN);
    store.setHasCoverDesign(true);
    store.setHasFormatting(true);
    store.setSelectedAddons([ISBN_ADDON, EXPRESS_ADDON]);

    expect(store.getTotalPrice()).toBe(105_000);
    expect(store.getAddonBreakdown()).toEqual([{ name: "Express Delivery", price: 5_000 }]);
  });

  it("applies coupon discount and clamps total at zero", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(true);
    store.setHasFormatting(true);
    store.setSelectedAddons([EXPRESS_ADDON]);
    store.applyCoupon("SAVE15", 15_000);

    expect(store.getTotalPrice()).toBe(90_000);

    store.applyCoupon("OVER", 999_999);
    expect(store.getTotalPrice()).toBe(0);
  });

  it("reset() fully clears state", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(false);
    store.setHasFormatting(false);
    store.setSelectedAddons([COVER_ADDON, EXPRESS_ADDON]);
    store.applyFormattingCost(4_000, 0.5);
    store.applyCoupon("SAVE", 2_000);

    store.reset();

    const next = usePricingStore.getState();
    expect(next.selectedPackage).toBeNull();
    expect(next.hasCoverDesign).toBeNull();
    expect(next.hasFormatting).toBeNull();
    expect(next.selectedAddons).toEqual([]);
    expect(next.formattingWordCount).toBe(0);
    expect(next.couponCode).toBeNull();
    expect(next.discountAmount).toBe(0);
    expect(next.getTotalPrice()).toBe(0);
  });

  it("serializes payment metadata with required fields", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(false);
    store.setHasFormatting(true);
    store.setBookSize("A5");
    store.setPaperColor("cream");
    store.setLamination("matt");
    store.setSelectedAddons([COVER_ADDON, EXPRESS_ADDON]);

    const metadata = store.toPaymentMetadata();

    expect(metadata.hasCover).toBe(false);
    expect(metadata.hasFormatting).toBe(true);
    expect(metadata.tier).toBe("first-draft");
    expect(metadata.basePrice).toBe(100_000);
    expect(metadata.totalPrice).toBe(150_000);
    expect(metadata.addons).toEqual([
      {
        id: "addon_express",
        slug: "express-delivery",
        name: "Express Delivery",
        price: 5_000,
        source: "selected",
      },
      {
        id: "addon_cover",
        slug: "cover-design",
        name: "Cover Design",
        price: 45_000,
        source: "scenario",
      },
    ]);
  });

  it("uses formatting wordCount × pricePerWord (not flat fee)", () => {
    const store = usePricingStore.getState();
    store.setSelectedPackage(PACKAGE_WITHOUT_ISBN);
    store.setHasCoverDesign(true);
    store.setHasFormatting(false);
    store.setSelectedAddons([FORMATTING_ADDON_PER_WORD]);
    store.applyFormattingCost(1_500, 2);

    expect(store.getTotalPrice()).toBe(103_000);
    expect(store.getAddonBreakdown()).toEqual([{ name: "Formatting", price: 3_000 }]);
  });
});
