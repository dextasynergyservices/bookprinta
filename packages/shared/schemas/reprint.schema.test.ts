import { describe, expect, it } from "bun:test";
import { BookReprintConfigResponseSchema } from "./book.schema";
import { ReprintPaymentSchema } from "./payment.schema";

describe("reprint contracts", () => {
  it("validates the authenticated reprint payment payload", () => {
    expect(
      ReprintPaymentSchema.parse({
        sourceBookId: "cmbook11111111111111111111111",
        copies: 50,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        provider: "PAYSTACK",
        callbackUrl: "https://bookprinta.com/checkout/payment-return/paystack",
      })
    ).toEqual({
      sourceBookId: "cmbook11111111111111111111111",
      copies: 50,
      bookSize: "A5",
      paperColor: "white",
      lamination: "gloss",
      provider: "PAYSTACK",
      callbackUrl: "https://bookprinta.com/checkout/payment-return/paystack",
    });
  });

  it("enforces the 25-copy minimum for reprint same requests", () => {
    const result = ReprintPaymentSchema.safeParse({
      sourceBookId: "cmbook11111111111111111111111",
      copies: 24,
      bookSize: "A4",
      paperColor: "cream",
      lamination: "matt",
      provider: "STRIPE",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Minimum 25 copies required for reprints");
  });

  it("validates the narrow reprint-config response shape", () => {
    expect(
      BookReprintConfigResponseSchema.parse({
        bookId: "cmbook11111111111111111111111",
        canReprintSame: true,
        disableReason: null,
        finalPdfUrlPresent: true,
        pageCount: 192,
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
      })
    ).toEqual({
      bookId: "cmbook11111111111111111111111",
      canReprintSame: true,
      disableReason: null,
      finalPdfUrlPresent: true,
      pageCount: 192,
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
    });
  });
});
