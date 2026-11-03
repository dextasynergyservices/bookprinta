import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { resolvePackageFromCheckoutMetadata } from "../checkout-package.js";
import {
  asRecord,
  asString,
  extractCheckoutMetadata,
  extractCustomQuoteCheckoutMetadata,
  hasBookPrintaProductTag,
  parseJsonRecord,
} from "../payment-metadata.js";
import { PaystackService, type PaystackTransactionListItem } from "./paystack.service.js";

/**
 * How far back payment reconciliation looks for unfinalised successful charges.
 * Comfortably wider than the cron interval so a skipped run self-heals, and wide
 * enough to absorb a multi-hour webhook/redirect outage.
 */
const PAYMENT_RECONCILE_LOOKBACK_HOURS = 24;

/** Transactions fetched per Paystack list call during reconciliation. */
const PAYMENT_RECONCILE_PAGE_SIZE = 100;

/**
 * How long reconciliation remembers a reference it has already settled (ours and
 * processed, or the other product's). Longer than the widest manual lookback.
 */
const PAYMENT_RECONCILE_MEMO_TTL_MS = 31 * 24 * 60 * 60 * 1000;

/** Finalises one charge; PaymentsService passes its verify() path. */
export type FinalizePaystackCharge = (reference: string) => Promise<unknown>;

export type ReconciliationSummary = {
  scanned: number;
  ours: number;
  alreadyProcessed: number;
  finalised: number;
  failed: number;
  skippedForeign: number;
};

/**
 * Paystack charge ownership and reconciliation.
 *
 * The Paystack account is shared with another product and BookPrinta has no
 * webhook, so a charge whose browser never returned is finalised here. Every
 * decision first establishes the charge is ours (product tag, an existing
 * Payment row, or checkout metadata that resolves to one of our packages or
 * custom quotes) so the other product's charges are never touched.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  /**
   * References reconciliation has already settled, so a 10-minute tick with no
   * new charges makes no database query and Neon can scale to zero. Outcomes are
   * final (an order exists, or the charge is not ours); a restart only costs one
   * query per reference. Values: classification and expiry (ms epoch).
   */
  private readonly reconciledReferences = new Map<
    string,
    { kind: "processed" | "foreign"; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService
  ) {}

  /**
   * Finalise successful Paystack charges that never became local Orders.
   *
   * WHY THIS EXISTS
   * Our Paystack integration is shared with another product, and Paystack allows
   * only one webhook URL per integration — so BookPrinta cannot rely on receiving
   * webhooks. Without a webhook, finalisation happens when the browser returns to
   * /payments/verify/:reference. That covers most cases but NOT: the customer
   * closing the tab on Paystack's success page, losing connectivity mid-redirect,
   * or switching apps on mobile. In those cases money is taken and no Order,
   * account, or signup email is ever created — and nothing surfaces it.
   *
   * This job asks Paystack directly "what did you charge successfully?" and
   * finalises anything we missed, which also covers webhook/redirect outages
   * generally. Run it on a schedule (external cron).
   *
   * SAFETY
   * - Only transactions carrying BookPrinta checkout metadata are touched. The
   *   shared integration means the list also contains the other product's
   *   charges; those are skipped (see `looksLikeBookPrintaCheckout`).
   * - Finalisation delegates to `verify()`, the exact path the redirect uses, so
   *   there is no duplicated order-creation logic. `verify()` is idempotent (it
   *   claims `processedAt` atomically), so overlapping runs or a late webhook
   *   cannot double-create.
   */
  async reconcilePaystackPayments(
    options: { lookbackHours?: number },
    finalize: FinalizePaystackCharge
  ): Promise<ReconciliationSummary> {
    const lookbackHours = Math.max(1, options.lookbackHours ?? PAYMENT_RECONCILE_LOOKBACK_HOURS);
    const to = new Date();
    const from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1000);

    const summary = {
      scanned: 0,
      ours: 0,
      alreadyProcessed: 0,
      finalised: 0,
      failed: 0,
      skippedForeign: 0,
    };

    if (!this.paystackService.isAvailable) {
      this.logger.warn("Payment reconciliation skipped — Paystack is not configured");
      return summary;
    }

    let transactions: PaystackTransactionListItem[];
    try {
      transactions = await this.paystackService.listTransactions({
        from,
        to,
        status: "success",
        perPage: PAYMENT_RECONCILE_PAGE_SIZE,
      });
    } catch (error) {
      this.logger.error(
        `Payment reconciliation could not list Paystack transactions: ${error instanceof Error ? error.message : error}`
      );
      return summary;
    }

    summary.scanned = transactions.length;

    const now = Date.now();
    for (const [reference, memo] of this.reconciledReferences) {
      if (memo.expiresAt <= now) this.reconciledReferences.delete(reference);
    }
    const remember = (reference: string, kind: "processed" | "foreign") => {
      this.reconciledReferences.set(reference, {
        kind,
        expiresAt: now + PAYMENT_RECONCILE_MEMO_TTL_MS,
      });
    };

    for (const transaction of transactions) {
      const reference = transaction.reference?.trim();
      if (!reference) continue;

      const memo = this.reconciledReferences.get(reference);
      if (memo) {
        if (memo.kind === "foreign") {
          summary.skippedForeign += 1;
        } else {
          summary.ours += 1;
          summary.alreadyProcessed += 1;
        }
        continue;
      }

      // One indexed lookup per row. A Payment row with this reference means we
      // created the charge (extra pages and reprints are pre-created PENDING),
      // so it is ours regardless of what its metadata looks like.
      const existing = await this.prisma.payment.findUnique({
        where: { providerRef: reference },
        select: { processedAt: true, orderId: true },
      });

      // Shared integration: ignore the other product's charges entirely.
      const ours =
        existing !== null ||
        hasBookPrintaProductTag(transaction.metadata) ||
        (await this.isBookPrintaCharge(transaction.metadata));
      if (!ours) {
        summary.skippedForeign += 1;
        remember(reference, "foreign");
        continue;
      }
      summary.ours += 1;

      if (existing?.processedAt && existing.orderId) {
        summary.alreadyProcessed += 1;
        remember(reference, "processed");
        continue;
      }

      try {
        // Same finalisation path as the browser redirect — idempotent.
        await finalize(reference);
        summary.finalised += 1;
        remember(reference, "processed");
        this.logger.warn(
          `Payment reconciliation finalised orphaned Paystack charge ${reference} ` +
            "(no webhook and the browser never returned)"
        );
      } catch (error) {
        summary.failed += 1;
        this.logger.error(
          `Payment reconciliation failed for ${reference}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    this.logger.log(
      `Payment reconciliation complete — scanned ${summary.scanned}, ours ${summary.ours}, ` +
        `already processed ${summary.alreadyProcessed}, finalised ${summary.finalised}, ` +
        `failed ${summary.failed}, foreign skipped ${summary.skippedForeign}`
    );

    return summary;
  }

  /**
   * True when a Paystack transaction was created by BookPrinta's checkout.
   *
   * This is a PRODUCT check, not a user check — it asks "did our checkout create
   * this charge?", never "does this payer have an account". That distinction
   * matters because BookPrinta is pay-first-then-signup: at charge time there is
   * deliberately no user yet.
   *
   * IMPORTANT: do NOT use `extractCheckoutMetadata() !== null` as the signal — it
   * returns a populated object for ANY non-empty metadata (every field is
   * optional), so it matches the other product's charges too. The authoritative
   * signal is the one finalisation itself depends on:
   *   - a `customQuoteId` that exists in our DB (custom-quote flow), or
   *   - a package identifier that resolves to an active BookPrinta package.
   * Both are DB-verified, so a foreign charge cannot be mistaken for ours even if
   * it happens to carry a similarly-named metadata field.
   *
   * Paystack may return metadata as a JSON string rather than an object.
   */
  private async isBookPrintaCharge(
    metadata: Record<string, unknown> | string | null | undefined
  ): Promise<boolean> {
    const record = typeof metadata === "string" ? parseJsonRecord(metadata) : asRecord(metadata);
    if (!record) return false;

    // Custom-quote flow: verify the quote is one of ours.
    const quoteCheckout = extractCustomQuoteCheckoutMetadata(record);
    const customQuoteId = quoteCheckout
      ? asString(quoteCheckout.customQuoteId)
      : asString(record.customQuoteId);
    if (customQuoteId) {
      const quote = await this.prisma.customQuote.findUnique({
        where: { id: customQuoteId },
        select: { id: true },
      });
      if (quote) return true;
    }

    // Standard checkout: the package must resolve to an active BookPrinta package.
    const checkout = extractCheckoutMetadata(record);
    if (!checkout) return false;
    if (!checkout.packageId && !checkout.packageSlug && !checkout.tier) return false;

    const pkg = await resolvePackageFromCheckoutMetadata(this.prisma, checkout);
    return pkg !== null;
  }

  /**
   * Classify a charge, distinguishing "not ours" from "ours but unresolvable".
   *
   * `isBookPrintaCharge` collapses these two into `false`, which is wrong for
   * the second case. `resolvePackageFromCheckoutMetadata` requires
   * `isActive: true` on both the package AND its category, so if an admin
   * deactivates a package (or category) while a customer is mid-checkout, that
   * customer's charge stops resolving — and a plain boolean makes it
   * indistinguishable from another product's charge.
   *
   * Treating that as "foreign" would mean silently ignoring a charge we took
   * money for, leaving no Payment row and therefore nothing for
   * listOrphanedPayments() to surface. The money is gone and we have no record.
   *
   * So:
   *   - "foreign"      → no BookPrinta checkout shape at all. Safe to ignore.
   *   - "unresolvable" → carries our checkout shape (packageId/slug/tier, or a
   *                      customQuoteId) but nothing resolves. Record it and let
   *                      it surface for a human.
   *   - "ours"         → resolves normally.
   */
  async classifyCharge(
    metadata: Record<string, unknown> | string | null | undefined
  ): Promise<"ours" | "unresolvable" | "foreign"> {
    // Tagged at creation (constants.ts) — covers extra-page and reprint
    // charges, whose metadata has no checkout shape. Whether they resolve is
    // decided downstream (an unresolvable one is recorded as an orphan).
    if (hasBookPrintaProductTag(metadata) || (await this.isBookPrintaCharge(metadata))) {
      return "ours";
    }

    const record = typeof metadata === "string" ? parseJsonRecord(metadata) : asRecord(metadata);
    if (!record) return "foreign";

    // A customQuoteId that does not resolve is still a claim to be one of ours.
    const quoteCheckout = extractCustomQuoteCheckoutMetadata(record);
    const customQuoteId = quoteCheckout
      ? asString(quoteCheckout.customQuoteId)
      : asString(record.customQuoteId);
    if (customQuoteId) return "unresolvable";

    const checkout = extractCheckoutMetadata(record);
    if (!checkout) return "foreign";
    if (checkout.packageId || checkout.packageSlug || checkout.tier) {
      return "unresolvable";
    }

    return "foreign";
  }
}
