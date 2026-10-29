import type { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** reCAPTCHA v3 score (0.0–1.0) at or above which a request is treated as human. */
const MIN_HUMAN_SCORE = 0.5;

/**
 * Verify a reCAPTCHA v3 token with Google. Shared by every public form (login,
 * password reset, contact, checkout, custom quote).
 *
 * Fails CLOSED in production: a missing secret key, a missing token, a network
 * error or a low score all reject the request. A missing key is reported to
 * Sentry, because it silently disables bot protection on every public form.
 *
 * Outside production verification is skipped — localhost is not a registered
 * reCAPTCHA domain.
 */
export async function verifyRecaptchaToken(
  token: string | null | undefined,
  logger: Logger
): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") {
    logger.warn("Development mode — skipping reCAPTCHA verification");
    return true;
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secretKey) {
    logger.error("RECAPTCHA_SECRET_KEY not set — rejecting request");
    Sentry.captureMessage("RECAPTCHA_SECRET_KEY is not set; public forms are rejecting requests", {
      level: "error",
      tags: { area: "recaptcha" },
    });
    return false;
  }

  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    logger.warn("reCAPTCHA token missing — rejecting request");
    return false;
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: normalizedToken }),
      signal: AbortSignal.timeout(5000),
    });

    const data = (await response.json()) as {
      success?: boolean;
      score?: number;
      "error-codes"?: string[];
    };

    const isHuman =
      data.success === true && (data.score === undefined || data.score >= MIN_HUMAN_SCORE);
    if (!isHuman) {
      logger.warn(
        `reCAPTCHA rejected — success: ${data.success}, score: ${data.score}, errors: ${JSON.stringify(data["error-codes"])}`
      );
    }
    return isHuman;
  } catch (error) {
    logger.error("reCAPTCHA verification network error", error);
    return false;
  }
}
