import { describe, expect, it } from "bun:test";
import { BookReprintConfigResponseSchema } from "./book.schema";
import { ReprintPaymentSchema } from "./payment.schema";

describe("reprint contracts", () => {
  it("validates the authenticated reprint payment payload", () => {
    expect(
      ReprintPaymentSchema.parse({
        sourceBookId: "cmbook11111111111111111111111",
        copies: 50,
        provider: "PAYSTACK",
        callbackUrl: "https://bookprinta.com/checkout/payment-return/paystack",
      })
    ).toEqual({
      sourceBookId: "cmbook11111111111111111111111",
      copies: 50,
      provider: "PAYSTACK",
      callbackUrl: "https://bookprinta.com/checkout/payment-return/paystack",
    });
  });

  it("allows a single copy for reprint requests", () => {
    const result = ReprintPaymentSchema.safeParse({
      sourceBookId: "cmbook11111111111111111111111",
      copies: 1,
      provider: "STRIPE",
    });

    expect(result.success).toBe(true);
  });

  it("rejects zero copies for reprint requests", () => {
    const result = ReprintPaymentSchema.safeParse({
      sourceBookId: "cmbook11111111111111111111111",
      copies: 0,
      provider: "STRIPE",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("At least 1 copy is required");
  });

  it("accepts BANK_TRANSFER as a reprint payment provider", () => {
    const result = ReprintPaymentSchema.safeParse({
      sourceBookId: "cmbook11111111111111111111111",
      copies: 10,
      provider: "BANK_TRANSFER",
    });

    expect(result.success).toBe(true);
  });

  it("validates the narrow reprint-config response shape", () => {
    expect(
      BookReprintConfigResponseSchema.parse({
        bookId: "cmbook11111111111111111111111",
        canReprintSame: true,
        disableReason: null,
        hasActiveReprint: false,
        finalPdfUrlPresent: true,
        pageCount: 192,
        costPerCopy: 3180,
        bookTitle: "My Novel",
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      })
    ).toEqual({
      bookId: "cmbook11111111111111111111111",
      canReprintSame: true,
      disableReason: null,
      hasActiveReprint: false,
      finalPdfUrlPresent: true,
      pageCount: 192,
      costPerCopy: 3180,
      bookTitle: "My Novel",
      bookSize: "A5",
      paperColor: "white",
      lamination: "gloss",
    });
  });

  it("validates costPerCopy = (pageCount × 15) + 300 convention", () => {
    // 192 pages × ₦15/page + ₦300 cover = ₦3,180 per copy
    const result = BookReprintConfigResponseSchema.safeParse({
      bookId: "cmbook11111111111111111111111",
      canReprintSame: true,
      disableReason: null,
      hasActiveReprint: false,
      finalPdfUrlPresent: true,
      pageCount: 192,
      costPerCopy: 192 * 15 + 300,
      bookTitle: "Test Book",
      bookSize: "A4",
      paperColor: "cream",
      lamination: "matt",
    });

    expect(result.success).toBe(true);
    expect(result.data?.costPerCopy).toBe(3180);
  });
});
