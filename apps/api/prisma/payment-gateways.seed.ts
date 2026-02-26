export type GatewayProvider = "PAYSTACK" | "STRIPE" | "PAYPAL" | "BANK_TRANSFER";

export interface GatewaySeed {
  provider: GatewayProvider;
  name: string;
  isEnabled: boolean;
  isTestMode: boolean;
  priority: number;
  publicKey?: string | null;
  secretKey?: string | null;
  instructions?: string | null;
  bankDetails?: Record<string, unknown> | null;
}

const BANK_TRANSFER_INSTRUCTIONS =
  "After Payment, Kindly fill the form and upload your payment receipt";

const BANK_TRANSFER_DETAILS: Record<string, unknown> = {
  accounts: [
    {
      accountName: "Dexta Synergy Services",
      accountNumber: "4333291178",
      bank: "MoniePoint",
    },
    {
      accountName: "Dexta Synergy Services",
      accountNumber: "0057301083",
      bank: "Stanbic IBTC",
    },
  ],
};

export function buildGatewaySeedsFromEnv(env: NodeJS.ProcessEnv = process.env): GatewaySeed[] {
  const paystackPublicKey = env.PAYSTACK_PUBLIC_KEY ?? env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? null;
  const paystackSecretKey = env.PAYSTACK_SECRET_KEY ?? null;

  return [
    {
      provider: "PAYSTACK",
      name: "Paystack",
      isEnabled: true,
      isTestMode: true,
      priority: 1,
      publicKey: paystackPublicKey,
      secretKey: paystackSecretKey,
      instructions: null,
      bankDetails: null,
    },
    {
      provider: "STRIPE",
      name: "Stripe",
      isEnabled: false,
      isTestMode: true,
      priority: 2,
      publicKey: null,
      secretKey: null,
      instructions: null,
      bankDetails: null,
    },
    {
      provider: "PAYPAL",
      name: "PayPal",
      isEnabled: false,
      isTestMode: true,
      priority: 3,
      publicKey: null,
      secretKey: null,
      instructions: null,
      bankDetails: null,
    },
    {
      provider: "BANK_TRANSFER",
      name: "Bank Transfer",
      isEnabled: true,
      isTestMode: false,
      priority: 0,
      publicKey: null,
      secretKey: null,
      instructions: BANK_TRANSFER_INSTRUCTIONS,
      bankDetails: BANK_TRANSFER_DETAILS,
    },
  ];
}
