// Deterministic secrets for unit tests. main.ts refuses to boot without
// JWT_SECRET; services that sign data (e.g. CheckoutPricingService) need one too.
process.env.JWT_SECRET ??= "test-jwt-secret-do-not-use-in-production-0123456789";
