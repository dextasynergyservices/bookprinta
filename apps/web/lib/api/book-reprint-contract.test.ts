import { normalizeBookReprintConfigPayload } from "./book-reprint-contract";

const reprintConfig = {
  bookId: "cm1111111111111111111111111",
  canReprintSame: true,
  disableReason: null,
  finalPdfUrlPresent: true,
  pageCount: 128,
  costPerCopy: 128 * 15 + 300,
  bookTitle: "My Novel",
  bookSize: "A5",
  paperColor: "white",
  lamination: "gloss",
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
