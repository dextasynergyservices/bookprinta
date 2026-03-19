import { PaymentsService } from "./payments.service.js";

/**
 * Expose the private verifyRecaptcha method for direct unit testing.
 */
type PaymentsServicePrivate = {
  verifyRecaptcha: (token: string) => Promise<boolean>;
};

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const prisma = {
    paymentGateway: { findUnique: jest.fn() },
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertBillingGateAccess: jest.fn() } as never
  );

  return { service, prisma };
}

function getPrivate(service: PaymentsService): PaymentsServicePrivate {
  return service as unknown as PaymentsServicePrivate;
}

describe("PaymentsService verifyRecaptcha", () => {
  const originalSecretKey = process.env.RECAPTCHA_SECRET_KEY;
  const originalNodeEnv = process.env.NODE_ENV;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = originalSecretKey;
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it("returns true when RECAPTCHA_SECRET_KEY is not set (skips verification)", async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    const { service } = createService();

    const result = await getPrivate(service).verifyRecaptcha("any-token");

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns true in non-production environments (skips verification)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    process.env.NODE_ENV = "development";
    const { service } = createService();

    const result = await getPrivate(service).verifyRecaptcha("any-token");

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns true when Google API returns success with score >= 0.5", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "real-secret";
    process.env.NODE_ENV = "production";
    const { service } = createService();

    fetchSpy.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({ success: true, score: 0.9 }),
    } as unknown as Response);

    const result = await getPrivate(service).verifyRecaptcha("valid-token");

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://www.google.com/recaptcha/api/siteverify",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("returns false when Google API returns success with score < 0.5", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "real-secret";
    process.env.NODE_ENV = "production";
    const { service } = createService();

    fetchSpy.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({ success: true, score: 0.2 }),
    } as unknown as Response);

    const result = await getPrivate(service).verifyRecaptcha("suspicious-token");

    expect(result).toBe(false);
  });

  it("returns false when Google API returns success: false", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "real-secret";
    process.env.NODE_ENV = "production";
    const { service } = createService();

    fetchSpy.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({ success: false }),
    } as unknown as Response);

    const result = await getPrivate(service).verifyRecaptcha("invalid-token");

    expect(result).toBe(false);
  });

  it("returns true when score is undefined (v2 reCAPTCHA without score)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "real-secret";
    process.env.NODE_ENV = "production";
    const { service } = createService();

    fetchSpy.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);

    const result = await getPrivate(service).verifyRecaptcha("v2-token");

    expect(result).toBe(true);
  });

  it("returns false when the fetch call throws (network error)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "real-secret";
    process.env.NODE_ENV = "production";
    const { service } = createService();

    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const result = await getPrivate(service).verifyRecaptcha("token");

    expect(result).toBe(false);
  });
});
