/// <reference types="jest" />

import { PAYSTACK_PRODUCT_TAG, PAYSTACK_PRODUCT_TAG_KEY } from "./constants.js";
import {
  asBoolean,
  asInteger,
  asNumber,
  extractCheckoutMetadata,
  extractCustomQuoteCheckoutMetadata,
  extractReprintMetadata,
  hasBookPrintaProductTag,
  isPrismaUniqueViolationForField,
  parseDataUrl,
  splitFullName,
  stripClientTrustedMetadata,
  toCurrency,
} from "./payment-metadata.js";
import {
  CHECKOUT_PRICING_SIGNATURE_KEY,
  CHECKOUT_PRICING_VERSION_KEY,
} from "./services/checkout-pricing.service.js";

describe("payment-metadata", () => {
  describe("value coercion", () => {
    it("reads numbers from numbers, numeric strings and Prisma Decimals", () => {
      expect(asNumber(1200)).toBe(1200);
      expect(asNumber(" 1200.5 ")).toBe(1200.5);
      expect(asNumber({ toNumber: () => 45000 })).toBe(45000);
      expect(asNumber("abc")).toBeUndefined();
      expect(asNumber(Number.NaN)).toBeUndefined();
      expect(asNumber("")).toBeUndefined();
    });

    it("floors integers and never returns a negative", () => {
      expect(asInteger("25.9")).toBe(25);
      expect(asInteger(-3)).toBe(0);
    });

    it("reads booleans only from booleans and true/false strings", () => {
      expect(asBoolean(" TRUE ")).toBe(true);
      expect(asBoolean("false")).toBe(false);
      expect(asBoolean("yes")).toBeUndefined();
      expect(asBoolean(1)).toBeUndefined();
    });

    it("rounds money to kobo and clamps negatives to zero", () => {
      expect(toCurrency("1234.567")).toBe(1234.57);
      expect(toCurrency(-500)).toBe(0);
      expect(toCurrency(undefined)).toBe(0);
    });
  });

  describe("stripClientTrustedMetadata", () => {
    it("removes every field only the server may set", () => {
      const stripped = stripClientTrustedMetadata({
        packageId: "pkg_1",
        dashboardUserId: "user_victim",
        source: "dashboard",
        checkout_state: "{}",
        [CHECKOUT_PRICING_SIGNATURE_KEY]: "forged",
        [CHECKOUT_PRICING_VERSION_KEY]: "1",
      });

      expect(stripped).toEqual({ packageId: "pkg_1" });
    });

    it("passes null through", () => {
      expect(stripClientTrustedMetadata(null)).toBeNull();
    });
  });

  describe("hasBookPrintaProductTag", () => {
    it("recognises the tag in an object or a JSON string", () => {
      const metadata = { [PAYSTACK_PRODUCT_TAG_KEY]: PAYSTACK_PRODUCT_TAG };
      expect(hasBookPrintaProductTag(metadata)).toBe(true);
      expect(hasBookPrintaProductTag(JSON.stringify(metadata))).toBe(true);
    });

    it("rejects another product's tag, missing metadata and invalid JSON", () => {
      expect(hasBookPrintaProductTag({ [PAYSTACK_PRODUCT_TAG_KEY]: "other-app" })).toBe(false);
      expect(hasBookPrintaProductTag(null)).toBe(false);
      expect(hasBookPrintaProductTag("{not json")).toBe(false);
    });
  });

  describe("extractCheckoutMetadata", () => {
    it("merges the checkout_state JSON and parses addons from a JSON string", () => {
      const checkout = extractCheckoutMetadata({
        locale: "FR",
        checkout_state: JSON.stringify({ packageId: "pkg_1", hasCover: "true" }),
        addons: JSON.stringify([{ id: "addon_1", price: "35000", wordCount: "50000" }, "bad"]),
        totalPrice: "150000",
      });

      expect(checkout).toMatchObject({
        locale: "fr",
        packageId: "pkg_1",
        hasCover: true,
        totalPrice: 150000,
        addons: [{ id: "addon_1", price: 35000, wordCount: 50000 }],
      });
    });

    it("defaults an unknown locale to English", () => {
      expect(extractCheckoutMetadata({ locale: "de" })?.locale).toBe("en");
    });
  });

  describe("extractCustomQuoteCheckoutMetadata", () => {
    const quote = {
      paymentFlow: "custom_quote",
      customQuoteId: "cq_1",
      quoteTitle: "Memoir",
      quoteQuantity: "50",
      quoteFinalPrice: "250000",
    };

    it("returns the quote details for the custom-quote flow, defaulting to A5", () => {
      expect(extractCustomQuoteCheckoutMetadata(quote)).toMatchObject({
        customQuoteId: "cq_1",
        quoteQuantity: 50,
        quoteFinalPrice: 250000,
        quotePrintSize: "A5",
      });
    });

    it("returns null for other flows or incomplete quotes", () => {
      expect(extractCustomQuoteCheckoutMetadata({ ...quote, paymentFlow: "CHECKOUT" })).toBeNull();
      expect(extractCustomQuoteCheckoutMetadata({ ...quote, quoteFinalPrice: "0" })).toBeNull();
    });
  });

  describe("extractReprintMetadata", () => {
    it("requires a source book and at least one copy", () => {
      expect(extractReprintMetadata({ sourceBookId: "book_1", copies: "10" })).toMatchObject({
        sourceBookId: "book_1",
        copies: 10,
        sourceOrderId: null,
      });
      expect(extractReprintMetadata({ sourceBookId: "book_1", copies: 0 })).toBeNull();
      expect(extractReprintMetadata({ copies: 10 })).toBeNull();
    });
  });

  describe("parseDataUrl", () => {
    it("decodes a base64 data URL", () => {
      const parsed = parseDataUrl(`data:image/png;base64,${Buffer.from("png").toString("base64")}`);
      expect(parsed?.mimeType).toBe("image/png");
      expect(parsed?.extension).toBe("png");
      expect(parsed?.buffer.toString()).toBe("png");
    });

    it("rejects anything that is not a base64 data URL", () => {
      expect(parseDataUrl("https://example.com/receipt.png")).toBeNull();
    });
  });

  describe("splitFullName", () => {
    it("splits on the first space and collapses whitespace", () => {
      expect(splitFullName("  Ada   Chioma Okafor ")).toEqual({
        firstName: "Ada",
        lastName: "Chioma Okafor",
      });
      expect(splitFullName("")).toEqual({ firstName: "Author", lastName: null });
    });
  });

  describe("isPrismaUniqueViolationForField", () => {
    it("matches P2002 on the named field, as an array or a constraint name", () => {
      expect(
        isPrismaUniqueViolationForField({ code: "P2002", meta: { target: ["email"] } }, "email")
      ).toBe(true);
      expect(
        isPrismaUniqueViolationForField(
          { code: "P2002", meta: { target: "User_email_key" } },
          "email"
        )
      ).toBe(true);
      expect(
        isPrismaUniqueViolationForField({ code: "P2002", meta: { target: ["phone"] } }, "email")
      ).toBe(false);
      expect(isPrismaUniqueViolationForField({ code: "P2025" }, "email")).toBe(false);
    });
  });
});
