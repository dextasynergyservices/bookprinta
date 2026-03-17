import type {
  PayQuoteByTokenInput,
  PayQuoteByTokenResponse,
  ResolveQuotePaymentTokenResponse,
} from "@bookprinta/shared";

type HttpError = Error & { status?: number };

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

function createHttpError(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

export async function resolveQuotePaymentToken(
  token: string,
  signal?: AbortSignal
): Promise<ResolveQuotePaymentTokenResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/pay/${encodeURIComponent(token)}`, {
    method: "GET",
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw createHttpError("Failed to resolve payment token", response.status);
  }

  return (await response.json()) as ResolveQuotePaymentTokenResponse;
}

export async function payQuoteByToken(
  token: string,
  payload: PayQuoteByTokenInput
): Promise<PayQuoteByTokenResponse> {
  const response = await fetch(`${API_V1_BASE_URL}/pay/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : typeof body?.message === "string"
        ? body.message
        : "Failed to initialize quote payment";
    throw createHttpError(message, response.status);
  }

  return (await response.json()) as PayQuoteByTokenResponse;
}

export type QuotePaymentVerifyResponse = {
  status: string;
  reference: string;
  amount: number | null;
  currency: string | null;
  verified: boolean;
  signupUrl?: string | null;
  awaitingWebhook?: boolean;
};

export async function verifyQuotePaymentReference(
  reference: string,
  provider?: "PAYSTACK" | "STRIPE" | "PAYPAL" | null
): Promise<QuotePaymentVerifyResponse> {
  const query = new URLSearchParams();
  if (provider) {
    query.set("provider", provider);
  }

  const response = await fetch(
    `${API_V1_BASE_URL}/payments/verify/${encodeURIComponent(reference)}${
      query.size > 0 ? `?${query.toString()}` : ""
    }`,
    {
      method: "POST",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : typeof body?.message === "string"
        ? body.message
        : "Failed to verify payment";
    throw createHttpError(message, response.status);
  }

  return (await response.json()) as QuotePaymentVerifyResponse;
}
