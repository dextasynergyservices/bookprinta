import { useQuery } from "@tanstack/react-query";
import { throwApiError } from "@/lib/api-error";
import { fetchApiV1WithRefresh, getApiV1BaseUrl } from "@/lib/fetch-with-refresh";

const API_V1_BASE_URL = getApiV1BaseUrl();

export type PaymentProvider = "PAYSTACK" | "STRIPE" | "PAYPAL" | "BANK_TRANSFER";
export type OnlinePaymentProvider = "PAYSTACK" | "STRIPE" | "PAYPAL";

export interface PaymentGateway {
  id: string;
  provider: PaymentProvider;
  name: string;
  isEnabled: boolean;
  isTestMode: boolean;
  bankDetails: Record<string, unknown> | null;
  instructions: string | null;
  priority: number;
}

export interface InitializePaymentInput {
  provider: OnlinePaymentProvider;
  email: string;
  amount: number;
  currency?: string;
  orderId?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResponse {
  authorizationUrl: string;
  accessCode?: string;
  reference: string;
  provider: string;
}

export interface VerifyPaymentResponse {
  status: string;
  reference: string;
  amount: number | null;
  currency: string | null;
  verified: boolean;
  signupUrl?: string | null;
  awaitingWebhook: boolean;
  email: string | null;
  orderNumber: string | null;
  packageName: string | null;
  amountPaid: string | null;
  addons: string[];
}

export interface ExtraPagesPaymentInput {
  bookId: string;
  provider: Extract<OnlinePaymentProvider, "PAYSTACK" | "STRIPE">;
  extraPages: number;
  callbackUrl?: string;
}

export interface ReprintPaymentInput {
  sourceBookId: string;
  copies: number;
  provider: "PAYSTACK" | "STRIPE" | "BANK_TRANSFER";
  callbackUrl?: string;
}

export interface ReprintBankTransferResponse {
  provider: "BANK_TRANSFER";
  paymentId: string;
  reference: string;
  amount: number;
  status: string;
  bankTransfer: true;
  message: string;
}

export type ReprintPaymentResponse = InitializePaymentResponse | ReprintBankTransferResponse;

export function isReprintBankTransferResponse(
  response: ReprintPaymentResponse
): response is ReprintBankTransferResponse {
  return "bankTransfer" in response && response.bankTransfer === true;
}

export interface BankTransferInput {
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  amount: number;
  currency?: string;
  receiptUrl?: string;
  receiptFile?: File;
  orderId?: string;
  metadata?: Record<string, unknown>;
  recaptchaToken?: string;
}

export interface BankTransferResponse {
  id: string;
  status: string;
  message: string;
}

export interface AdminBankTransferDecisionResponse {
  id: string;
  status: string;
  message: string;
}

export type CouponValidationErrorCode =
  | "INVALID_CODE"
  | "CODE_EXPIRED"
  | "CODE_INACTIVE"
  | "CODE_MAXED_OUT"
  | "CODE_NOT_APPLICABLE";

export interface ValidateCouponInput {
  code: string;
  amount: number;
  packageId?: string;
  packageSlug?: string;
}

export interface ValidateCouponResponse {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses: number | null;
  currentUses: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  discountAmount: number;
}

export class CouponValidationError extends Error {
  code: CouponValidationErrorCode;

  constructor(code: CouponValidationErrorCode, message: string) {
    super(message);
    this.name = "CouponValidationError";
    this.code = code;
  }
}

async function parseError(response: Response) {
  await throwApiError(response, "Request failed");
}

export async function fetchPaymentGateways() {
  const response = await fetch(`${API_V1_BASE_URL}/payments/gateways`);
  if (!response.ok) {
    await parseError(response);
  }

  const gateways = (await response.json()) as PaymentGateway[];
  return gateways.sort((a, b) => a.priority - b.priority);
}

export async function initializePayment(payload: InitializePaymentInput) {
  const response = await fetch(`${API_V1_BASE_URL}/payments/initialize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as InitializePaymentResponse;
}

export async function payExtraPages(payload: ExtraPagesPaymentInput) {
  const response = await fetchApiV1WithRefresh("/payments/extra-pages", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as InitializePaymentResponse;
}

export async function payReprint(payload: ReprintPaymentInput): Promise<ReprintPaymentResponse> {
  const response = await fetchApiV1WithRefresh("/payments/reprint", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as ReprintPaymentResponse;
}

export async function uploadReprintBankTransferReceipt(params: {
  paymentId: string;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  receiptFile: File;
}): Promise<BankTransferResponse> {
  const formData = new FormData();
  formData.append("payerName", params.payerName);
  formData.append("payerEmail", params.payerEmail);
  formData.append("payerPhone", params.payerPhone);
  formData.append("receiptFile", params.receiptFile);

  const response = await fetchApiV1WithRefresh(
    `/payments/reprint/${encodeURIComponent(params.paymentId)}/receipt`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    }
  );

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as BankTransferResponse;
}

export async function verifyPayment(reference: string, provider?: string | null) {
  const query = new URLSearchParams();
  if (provider) {
    query.set("provider", provider);
  }

  const response = await fetchApiV1WithRefresh(
    `/payments/verify/${encodeURIComponent(reference)}${
      query.size > 0 ? `?${query.toString()}` : ""
    }`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as VerifyPaymentResponse;
}

export async function validateCouponCode(payload: ValidateCouponInput) {
  const response = await fetch(`${API_V1_BASE_URL}/coupons/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 429) {
      await parseError(response);
    }

    const data = await response.json().catch(() => null);
    const code =
      typeof data?.code === "string" &&
      (data.code === "INVALID_CODE" ||
        data.code === "CODE_EXPIRED" ||
        data.code === "CODE_INACTIVE" ||
        data.code === "CODE_MAXED_OUT" ||
        data.code === "CODE_NOT_APPLICABLE")
        ? (data.code as CouponValidationErrorCode)
        : "INVALID_CODE";
    const message =
      (typeof data?.message === "string" && data.message) ||
      (Array.isArray(data?.message) && data.message.join(", ")) ||
      "Invalid code";

    throw new CouponValidationError(code, message);
  }

  return (await response.json()) as ValidateCouponResponse;
}

export async function submitBankTransfer(payload: BankTransferInput) {
  const hasReceiptFile = payload.receiptFile instanceof File;
  const response = await fetch(`${API_V1_BASE_URL}/payments/bank-transfer`, {
    method: "POST",
    ...(hasReceiptFile
      ? {
          body: (() => {
            const formData = new FormData();
            formData.append("payerName", payload.payerName);
            formData.append("payerEmail", payload.payerEmail);
            formData.append("payerPhone", payload.payerPhone);
            formData.append("amount", String(payload.amount));
            formData.append("currency", payload.currency ?? "NGN");
            if (payload.orderId) formData.append("orderId", payload.orderId);
            if (payload.receiptUrl) formData.append("receiptUrl", payload.receiptUrl);
            if (payload.metadata) formData.append("metadata", JSON.stringify(payload.metadata));
            if (payload.recaptchaToken) formData.append("recaptchaToken", payload.recaptchaToken);
            formData.append("receipt", payload.receiptFile as File);
            return formData;
          })(),
        }
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as BankTransferResponse;
}

export async function approveBankTransferByAdmin(paymentId: string, adminNote?: string) {
  const response = await fetchApiV1WithRefresh(
    `/admin/payments/${encodeURIComponent(paymentId)}/approve-transfer`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(adminNote ? { adminNote } : {}),
      }),
    }
  );

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as AdminBankTransferDecisionResponse;
}

export async function rejectBankTransferByAdmin(paymentId: string, adminNote: string) {
  const response = await fetchApiV1WithRefresh(
    `/admin/payments/${encodeURIComponent(paymentId)}/reject-transfer`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNote }),
    }
  );

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as AdminBankTransferDecisionResponse;
}

export function usePaymentGateways(enabled = true) {
  return useQuery({
    queryKey: ["payment-gateways"],
    queryFn: fetchPaymentGateways,
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}
