import { useQuery } from "@tanstack/react-query";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

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

async function parseError(response: Response) {
  const fallback = "Request failed";
  const data = await response.json().catch(() => null);
  const message =
    (typeof data?.message === "string" && data.message) ||
    (Array.isArray(data?.message) && data.message.join(", ")) ||
    fallback;
  throw new Error(message);
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
  const response = await fetch(
    `${API_V1_BASE_URL}/admin/payments/${encodeURIComponent(paymentId)}/approve-transfer`,
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
  const response = await fetch(
    `${API_V1_BASE_URL}/admin/payments/${encodeURIComponent(paymentId)}/reject-transfer`,
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
