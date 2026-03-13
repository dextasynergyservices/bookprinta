import { normalizeBookReprintConfigPayload } from "./book-reprint-contract";

const reprintConfig = {
  bookId: "cm1111111111111111111111111",
  canReprintSame: true,
  disableReason: null,
  finalPdfUrlPresent: true,
  pageCount: 128,
  minCopies: 25,
  defaultBookSize: "A5",
  defaultPaperColor: "white",
  defaultLamination: "gloss",
  allowedBookSizes: ["A4", "A5", "A6"],
  allowedPaperColors: ["white", "cream"],
  allowedLaminations: ["matt", "gloss"],
  costPerPageBySize: {
    A4: 20,
    A5: 10,
    A6: 5,
  },
  enabledPaymentProviders: ["PAYSTACK", "STRIPE"],
} as const;

describe("book reprint contract normalization", () => {
  it("normalizes an enveloped reprint-config payload", () => {
    expect(
      normalizeBookReprintConfigPayload({
        data: reprintConfig,
      })
    ).toEqual(reprintConfig);
  });

  it("normalizes a direct reprint-config payload", () => {
    expect(normalizeBookReprintConfigPayload(reprintConfig)).toEqual(reprintConfig);
  });

  it("throws when the reprint-config payload cannot be normalized", () => {
    expect(() => normalizeBookReprintConfigPayload({ data: { bookId: "broken" } })).toThrow(
      "Unable to normalize book reprint config response"
    );
  });
});
