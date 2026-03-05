type InvoicePaymentHistoryItem = {
  id: string;
  provider: string;
  status: string;
  type: string;
  amount: string;
  currency: string;
  reference: string | null;
  createdAt: string;
};

type RenderOrderInvoiceTemplateInput = {
  locale: string;
  invoiceNumber: string;
  issuedAt: string;
  orderNumber: string;
  packageName: string;
  paymentReference: string | null;
  paymentProvider: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  legalName: string;
  legalAddress: string;
  legalEmail: string;
  legalPhone: string;
  legalTaxId: string | null;
  packageAmount: string;
  addonsSubtotal: string;
  discountAmount: string;
  taxAmount: string;
  shippingFee: string;
  grandTotal: string;
  currency: string;
  addonLines: Array<{
    name: string;
    amount: string;
  }>;
  paymentHistory: InvoicePaymentHistoryItem[];
  supportSla: string;
  refundPolicy: string;
  termsNotice: string;
  complianceNote: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toLang(locale: string): string {
  if (locale === "fr") return "fr";
  if (locale === "es") return "es";
  return "en";
}

export function renderOrderInvoiceHtml(input: RenderOrderInvoiceTemplateInput): string {
  const addonRows =
    input.addonLines.length > 0
      ? input.addonLines
          .map(
            (addon) => `
              <tr>
                <td>${escapeHtml(addon.name)}</td>
                <td class="amount">${escapeHtml(addon.amount)}</td>
              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td class="muted">No add-ons selected</td>
          <td class="amount muted">-</td>
        </tr>
      `;

  const paymentHistoryRows =
    input.paymentHistory.length > 0
      ? input.paymentHistory
          .map(
            (payment) => `
              <tr>
                <td>${escapeHtml(payment.createdAt)}</td>
                <td>${escapeHtml(payment.provider)}</td>
                <td>${escapeHtml(payment.status)}</td>
                <td>${escapeHtml(payment.type)}</td>
                <td class="amount">${escapeHtml(payment.amount)} ${escapeHtml(payment.currency)}</td>
                <td>${escapeHtml(payment.reference ?? "-")}</td>
              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td colspan="6" class="muted">No payment history available</td>
        </tr>
      `;

  return `<!doctype html>
<html lang="${escapeHtml(toLang(input.locale))}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BookPrinta Invoice ${escapeHtml(input.invoiceNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f5f5f5;
        color: #111111;
        font-family: "Poppins", "Segoe UI", Arial, sans-serif;
      }
      .sheet {
        max-width: 860px;
        margin: 24px auto;
        background: #ffffff;
        border: 1px solid #e5e5e5;
        border-radius: 16px;
        overflow: hidden;
      }
      .header {
        padding: 24px 28px;
        border-bottom: 1px solid #ececec;
        display: flex;
        justify-content: space-between;
        gap: 20px;
      }
      .brand-title {
        margin: 0;
        font-family: "Space Grotesk", "Segoe UI", Arial, sans-serif;
        font-size: 27px;
        letter-spacing: -0.02em;
        color: #007eff;
      }
      .brand-meta {
        margin: 6px 0 0;
        font-size: 12px;
        color: #6b6b6b;
        line-height: 1.5;
      }
      .meta-grid {
        padding: 24px 28px 8px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .meta-item {
        border: 1px solid #ececec;
        border-radius: 12px;
        padding: 10px 12px;
      }
      .meta-label {
        margin: 0;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #6f6f6f;
      }
      .meta-value {
        margin: 6px 0 0;
        font-size: 14px;
        color: #111111;
      }
      .section {
        padding: 14px 28px 12px;
      }
      h2 {
        margin: 0 0 10px;
        font-family: "Space Grotesk", "Segoe UI", Arial, sans-serif;
        font-size: 18px;
        color: #111111;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 10px 0;
        border-bottom: 1px solid #efefef;
        text-align: left;
        font-size: 13px;
      }
      th {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #707070;
      }
      .amount {
        text-align: right;
        white-space: nowrap;
      }
      .muted {
        color: #8a8a8a;
      }
      .totals td {
        font-weight: 700;
        border-top: 2px solid #dadada;
        border-bottom: none;
        padding-top: 14px;
      }
      .footer {
        padding: 18px 28px 24px;
        border-top: 1px solid #ececec;
        font-size: 12px;
        color: #666666;
        line-height: 1.6;
      }
      .footer p {
        margin: 6px 0;
      }
      @media print {
        body { background: #ffffff; }
        .sheet {
          margin: 0;
          border: none;
          border-radius: 0;
          max-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <article class="sheet">
      <header class="header">
        <div>
          <h1 class="brand-title">BookPrinta</h1>
          <p class="brand-meta">
            ${escapeHtml(input.legalName)}<br />
            ${escapeHtml(input.legalAddress)}<br />
            ${escapeHtml(input.legalEmail)} | ${escapeHtml(input.legalPhone)}${input.legalTaxId ? `<br />Tax ID: ${escapeHtml(input.legalTaxId)}` : ""}
          </p>
        </div>
        <div>
          <h2>Invoice</h2>
          <p class="brand-meta">
            Invoice No: ${escapeHtml(input.invoiceNumber)}<br />
            Issued At: ${escapeHtml(input.issuedAt)}<br />
            Order Ref: ${escapeHtml(input.orderNumber)}
          </p>
        </div>
      </header>

      <section class="meta-grid">
        <div class="meta-item">
          <p class="meta-label">Package</p>
          <p class="meta-value">${escapeHtml(input.packageName)}</p>
        </div>
        <div class="meta-item">
          <p class="meta-label">Payment Provider</p>
          <p class="meta-value">${escapeHtml(input.paymentProvider ?? "Unavailable")}</p>
        </div>
        <div class="meta-item">
          <p class="meta-label">Payment Status</p>
          <p class="meta-value">${escapeHtml(input.paymentStatus ?? "Unavailable")}</p>
        </div>
        <div class="meta-item">
          <p class="meta-label">Payment Reference</p>
          <p class="meta-value">${escapeHtml(input.paymentReference ?? "Unavailable")}</p>
        </div>
        <div class="meta-item">
          <p class="meta-label">Paid At</p>
          <p class="meta-value">${escapeHtml(input.paidAt ?? "Unavailable")}</p>
        </div>
      </section>

      <section class="section">
        <h2>Charge Breakdown (${escapeHtml(input.currency)})</h2>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Package Amount</td>
              <td class="amount">${escapeHtml(input.packageAmount)}</td>
            </tr>
            <tr>
              <td>Add-ons Subtotal</td>
              <td class="amount">${escapeHtml(input.addonsSubtotal)}</td>
            </tr>
            ${addonRows}
            <tr>
              <td>Discount</td>
              <td class="amount">${escapeHtml(input.discountAmount)}</td>
            </tr>
            <tr>
              <td>Tax / VAT</td>
              <td class="amount">${escapeHtml(input.taxAmount)}</td>
            </tr>
            <tr>
              <td>Shipping Fee</td>
              <td class="amount">${escapeHtml(input.shippingFee)}</td>
            </tr>
            <tr class="totals">
              <td>Total</td>
              <td class="amount">${escapeHtml(input.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Payment History</h2>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Type</th>
              <th class="amount">Amount</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>${paymentHistoryRows}</tbody>
        </table>
      </section>

      <footer class="footer">
        <p><strong>Support SLA:</strong> ${escapeHtml(input.supportSla)}</p>
        <p><strong>Refund Policy:</strong> ${escapeHtml(input.refundPolicy)}</p>
        <p>${escapeHtml(input.termsNotice)}</p>
        <p>${escapeHtml(input.complianceNote)}</p>
      </footer>
    </article>
  </body>
</html>`;
}
