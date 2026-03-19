import {
  getSerwistWindowController,
  isSensitiveServiceWorkerUpdatePath,
  type SerwistWindowController,
} from "./service-worker-update";

describe("service worker update helpers", () => {
  afterEach(() => {
    delete window.serwist;
  });

  it.each([
    "/checkout",
    "/checkout/confirmation",
    "/checkout/payment-return/paystack",
    "/payment/confirmation",
    "/pay/token_123",
    "/signup/finish",
    "/dashboard/books",
  ])("treats %s as a sensitive update route", (pathname) => {
    expect(isSensitiveServiceWorkerUpdatePath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/about",
    "/pricing",
    "/dashboard/orders",
  ])("allows the prompt on non-sensitive route %s", (pathname) => {
    expect(isSensitiveServiceWorkerUpdatePath(pathname)).toBe(false);
  });

  it("returns the global Serwist controller only when the expected methods exist", () => {
    const serwist = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      messageSkipWaiting: jest.fn(),
    } satisfies SerwistWindowController;

    window.serwist = serwist;
    expect(getSerwistWindowController()).toBe(serwist);

    window.serwist = {
      addEventListener: jest.fn(),
    } as unknown as SerwistWindowController;

    expect(getSerwistWindowController()).toBeNull();
  });
});
