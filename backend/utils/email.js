const { Resend } = require('resend');

// The Resend constructor throws if the key is falsy, which would crash server
// startup when RESEND_API_KEY is unset. Fall back to a placeholder so the app
// still boots; sends then fail with an auth error that is caught and logged.
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_no_key');
const FROM = process.env.FROM_EMAIL || 'notifications@shopireachboost.com';

// RFC 8058 one-click unsubscribe headers. Resend v6+ accepts these via the
// `headers` option. No functional unsubscribe flow yet — the mailto gives
// recipients a valid target and satisfies Gmail/Yahoo bulk-sender requirements.
const UNSUBSCRIBE_HEADERS = {
  'List-Unsubscribe': '<mailto:unsubscribe@shopireachboost.com>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
};

// Default accent used when store has no brand color set.
const DEFAULT_ACCENT = '#4f46e5';

// --- small HTML helpers -------------------------------------------------------

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function button(href, label) {
  return (
    `<a href="${escapeHtml(href)}" ` +
    `style="display:inline-block;background:#4f46e5;color:#ffffff;` +
    `text-decoration:none;padding:12px 20px;border-radius:8px;` +
    `font-weight:600;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(label)}</a>`
  );
}

function shell(innerHtml) {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;` +
    `max-width:560px;margin:0 auto;padding:24px;">${innerHtml}</div>`
  );
}

/**
 * Build a complete, deliverable HTML email document — "Bold Commerce" design.
 *
 * Table-based, 600px, inline styles. Outlook degrades acceptably (no VML):
 * brand-color header bar, optional hero, optional offer ribbon, subject
 * headline, body copy, bulletproof CTA button, optional trust line, footer.
 *
 * Ribbon pale tint uses a fixed #f5f3ff (light lavender) regardless of
 * primaryColor — avoids fragile hex math while still looking good with
 * any accent color.
 *
 * @param {object} opts
 * @param {string}      opts.subject       - Subject line (used in <title> + headline)
 * @param {string}      opts.bodyHtml      - Already-formatted body (may contain <br>)
 * @param {string|null} opts.imageUrl      - Hero image; skipped unless https://
 * @param {string|null} opts.ctaLabel      - Button label; defaults to "Shop Now"
 * @param {string|null} opts.ctaUrl        - CTA href (https/mailto); omit to hide
 * @param {string|null} opts.storeName     - Display name in header/footer
 * @param {string|null} opts.logoUrl       - Logo URL; falls back to storeName text
 * @param {string|null} opts.primaryColor  - Hex brand color; falls back to #4f46e5
 * @param {string|null} opts.offerText     - Ribbon line (e.g. "Navratri · 15% Off")
 * @param {string|null} opts.trustText     - Small trust note below CTA; omit to hide
 * @returns {string} Complete <!DOCTYPE html> document
 */
function buildEmailHtml({ subject, bodyHtml, imageUrl, ctaLabel, ctaUrl, storeName, logoUrl, primaryColor, offerText, trustText }) {
  const accent = primaryColor || DEFAULT_ACCENT;
  const safe = escapeHtml;

  // Validate URLs: only https (and mailto for CTA) are rendered.
  const safeLogoUrl = logoUrl && /^https?:\/\//i.test(logoUrl) ? logoUrl : null;
  const safeImageUrl = imageUrl && imageUrl.startsWith('https://') ? imageUrl : null;
  const safeCtaUrl = ctaUrl && /^(https:\/\/|mailto:)/i.test(ctaUrl) ? ctaUrl : null;

  // 2. Brand header bar — primaryColor bg, logo or storeName in white.
  const headerInner = safeLogoUrl
    ? `<img src="${safe(safeLogoUrl)}" alt="${safe(storeName || '')}" height="40"` +
      ` style="display:block;max-height:40px;height:auto;border:0;margin:0 auto;">`
    : `<span style="font-size:17px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${safe(storeName || '')}</span>`;

  // 3. Hero image row.
  const heroRow = safeImageUrl
    ? `\n        <tr><td style="padding:0;" align="center">` +
      `<img src="${safe(safeImageUrl)}" alt="${safe(subject || '')}" width="600"` +
      ` style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>`
    : '';

  // 4. Offer ribbon — fixed pale-lavender bg, accent text, uppercase.
  const ribbonRow = offerText
    ? `\n        <tr><td style="background:#f5f3ff;padding:10px 28px;text-align:center;">` +
      `<span style="color:${safe(accent)};font-size:13px;font-weight:700;` +
      `font-family:Arial,sans-serif;letter-spacing:0.06em;text-transform:uppercase;">${safe(offerText)}</span>` +
      `</td></tr>`
    : '';

  // 6. CTA button — bulletproof table-based anchor, radius 10, padding 15×44.
  const ctaRow = safeCtaUrl
    ? `\n        <tr><td class="ecta" style="background:#ffffff;padding:8px 40px 28px;" align="center">` +
      `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">` +
      `<tr><td align="center" bgcolor="${safe(accent)}" style="border-radius:10px;background:${safe(accent)};">` +
      `<a href="${safe(safeCtaUrl)}" target="_blank"` +
      ` style="display:inline-block;padding:15px 44px;font-family:Arial,sans-serif;` +
      `font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${safe(ctaLabel || 'Shop Now')}</a>` +
      `</td></tr></table></td></tr>`
    : '';

  // 7. Trust line — small muted note, optional.
  const trustRow = trustText
    ? `\n        <tr><td style="background:#ffffff;padding:0 40px 24px;text-align:center;">` +
      `<span style="font-size:13px;color:#6b7280;font-family:Arial,sans-serif;">${safe(trustText)}</span></td></tr>`
    : '';

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>${safe(subject || '')}</title>\n` +
    `<style>\n` +
    `@media (max-width:600px){\n` +
    `  .ew{width:100%!important;}\n` +
    `  .ep{padding:16px 20px!important;}\n` +
    `  .eh{font-size:22px!important;}\n` +
    `  .ecta a{display:block!important;padding:15px 20px!important;}\n` +
    `}\n` +
    `</style>\n` +
    `</head>\n<body style="margin:0;padding:0;background:#f4f4f6;">\n` +
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f6" style="background:#f4f4f6;">\n` +
    `  <tr>\n    <td align="center" valign="top" style="padding:32px 16px;">\n` +
    `      <table class="ew" width="600" cellpadding="0" cellspacing="0" border="0"` +
    ` style="max-width:600px;width:600px;border-radius:14px;overflow:hidden;background:#ffffff;">\n` +
    // 2. Brand header bar
    `        <tr><td bgcolor="${safe(accent)}" style="background:${safe(accent)};padding:18px 28px;text-align:center;">${headerInner}</td></tr>` +
    heroRow +
    ribbonRow +
    // 5. Content: headline + bodyHtml
    `\n        <tr><td class="ep" style="background:#ffffff;padding:34px 40px;">` +
    `<h1 class="eh" style="margin:0 0 16px;font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#1a1a1a;font-family:Arial,sans-serif;">${safe(subject || '')}</h1>` +
    `<div style="font-size:15px;line-height:1.6;color:#4a4a4a;font-family:Arial,sans-serif;">${bodyHtml || ''}</div>` +
    `</td></tr>` +
    ctaRow +
    trustRow +
    // 8. Footer
    `\n        <tr><td style="background:#faf9fb;padding:20px 32px;text-align:center;` +
    `font-family:Arial,sans-serif;font-size:12px;color:#6b7280;border-top:1px solid #ebebeb;">` +
    `<strong>${safe(storeName || '')}</strong><br>` +
    `You received this because you opted in to notifications from this store.<br>` +
    `<a href="mailto:unsubscribe@shopireachboost.com" style="color:#6b7280;">Unsubscribe</a>` +
    `</td></tr>` +
    `\n      </table>\n    </td>\n  </tr>\n</table>\n</body>\n</html>`;
}

// ---------------------------------------------------------------------------
// 1. Abandoned cart reminder -> the customer
// ---------------------------------------------------------------------------

async function sendAbandonedCartEmail(customer, options = {}) {
  try {
    if (!customer || !customer.email) {
      // No email on file — nothing to send.
      return { success: false, error: 'no customer email' };
    }

    const items = Array.isArray(customer.cartItems) ? customer.cartItems : [];
    const rows = items
      .map((i) => {
        const qty = i.quantity || 1;
        const line = (Number(i.price) || 0) * qty;
        return (
          `<tr>` +
          `<td style="padding:6px 0;">${escapeHtml(i.title || 'Item')} &times; ${qty}</td>` +
          `<td style="padding:6px 0;text-align:right;">${money(line)}</td>` +
          `</tr>`
        );
      })
      .join('');

    // Optional overrides (per automation step / test send).
    const subject = options.subject || 'You left something behind! 🛒';
    const introHtml = options.body
      ? `<p style="margin:0 0 16px;color:#111827;">${escapeHtml(options.body)}</p>`
      : '';
    const cta = options.cartUrl || process.env.FRONTEND_URL || '#';

    const html = shell(
      `<h1 style="font-size:22px;margin:0 0 12px;">You forgot something!</h1>` +
        `<p style="margin:0 0 16px;color:#4b5563;">Here's what's still waiting in your cart:</p>` +
        `${introHtml}` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px;">` +
        `${rows || '<tr><td style="padding:6px 0;color:#6b7280;">Your saved items</td></tr>'}` +
        `<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:700;">Total</td>` +
        `<td style="padding:10px 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;">` +
        `${money(customer.cartValue)}</td></tr>` +
        `</table>` +
        `<p style="margin:24px 0;">${button(cta, 'Complete Your Order')}</p>` +
        `<p style="margin:32px 0 0;font-size:12px;color:#9ca3af;">` +
        `This reminder was sent by ShopiReachBoost AI</p>`
    );

    const { error } = await resend.emails.send({
      from: FROM,
      to: customer.email,
      subject: subject,
      html,
    });

    if (error) throw new Error(error.message || JSON.stringify(error));

    console.log(`[email] abandoned_cart sent (profileId: ${customer._id})`);
    return { success: true };
  } catch (err) {
    console.error(`Email failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// 2. New COD order alert -> the store owner
// ---------------------------------------------------------------------------

async function sendNewCodOrderEmail(order, ownerEmail) {
  try {
    if (!ownerEmail) {
      return { success: false, error: 'no owner email' };
    }
    if (!order) {
      return { success: false, error: 'no order' };
    }

    const qty = Number(order.quantity) || 1;
    const price = Number(order.productPrice) || 0;
    const total = price * qty;

    const html = shell(
      `<h1 style="font-size:22px;margin:0 0 12px;">New COD Order!</h1>` +
        `<h2 style="font-size:15px;margin:20px 0 6px;color:#374151;">Customer details</h2>` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px;">` +
        `<tr><td style="padding:4px 0;color:#6b7280;">Name</td><td style="padding:4px 0;">${escapeHtml(order.name)}</td></tr>` +
        `<tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td style="padding:4px 0;">${escapeHtml(order.phone)}</td></tr>` +
        `<tr><td style="padding:4px 0;color:#6b7280;">Address</td><td style="padding:4px 0;">${escapeHtml(order.address)}</td></tr>` +
        `<tr><td style="padding:4px 0;color:#6b7280;">City</td><td style="padding:4px 0;">${escapeHtml(order.city)}</td></tr>` +
        `<tr><td style="padding:4px 0;color:#6b7280;">Pincode</td><td style="padding:4px 0;">${escapeHtml(order.pincode)}</td></tr>` +
        `</table>` +
        `<h2 style="font-size:15px;margin:20px 0 6px;color:#374151;">Product</h2>` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px;">` +
        `<tr><td style="padding:4px 0;color:#6b7280;">Item</td><td style="padding:4px 0;">${escapeHtml(order.productName)}</td></tr>` +
        `<tr><td style="padding:4px 0;color:#6b7280;">Price</td><td style="padding:4px 0;">₹${money(price)}</td></tr>` +
        `<tr><td style="padding:4px 0;color:#6b7280;">Quantity</td><td style="padding:4px 0;">${qty}</td></tr>` +
        `<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:700;">Total</td>` +
        `<td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:700;">₹${money(total)}</td></tr>` +
        `</table>` +
        `<p style="margin:32px 0 0;font-size:12px;color:#9ca3af;">Powered by ShopiReachBoost AI</p>`
    );

    const { error } = await resend.emails.send({
      from: FROM,
      to: ownerEmail,
      subject: 'New COD Order Received! 📦',
      html,
    });

    if (error) throw new Error(error.message || JSON.stringify(error));

    console.log(`Email sent: new_cod_order to ${ownerEmail}`);
    return { success: true };
  } catch (err) {
    console.error(`Email failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// 3. Automation marketing email -> a customer (brain-scheduled, arbitrary
//    subject/body — see backend/services/aiService.js generateEmailCopy())
// ---------------------------------------------------------------------------

async function sendMarketingEmail(to, subject, htmlBody, shopDomain) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping');
    return { skipped: true };
  }
  if (!to || !to.includes('@')) {
    console.warn('[email] Invalid email address — skipping');
    return { skipped: true };
  }

  // Reuse the shared client above (already guarded against a missing key)
  // rather than constructing a second Resend SDK instance per call.
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,
        sans-serif;max-width:600px;margin:0 auto;
        padding:32px 24px;background:#f9fafb">
        <div style="background:#fff;border-radius:16px;
          border:1px solid #e5e7eb;padding:32px">
          <div style="font-size:16px;color:#111827;
            line-height:1.6">
            ${htmlBody}
          </div>
          <hr style="margin:24px 0;border:none;
            border-top:1px solid #f3f4f6">
          <p style="font-size:12px;color:#9ca3af;margin:0">
            You received this because you subscribed to
            notifications from ${shopDomain || 'this store'}.
            <br>To unsubscribe, reply with "unsubscribe".
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error('[email] Resend error:', error.message);
    throw new Error(error.message);
  }

  // Never log the recipient address (CLAUDE.md: no PII in console.log).
  console.log('[email] Marketing email sent for shop', shopDomain);
  return { success: true, id: data?.id };
}

// ---------------------------------------------------------------------------
// 4. COD order confirmation -> the customer (not wired up yet)
// ---------------------------------------------------------------------------

async function sendCodOrderConfirmationEmail(order) {
  try {
    // TODO: integrate customer email later. COD customers may not provide an
    // email address on the form, so there is nothing to send to right now.
    // When the COD form collects an email, send a confirmation here.
    return { success: true };
  } catch (err) {
    console.error(`Email failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  FROM,
  UNSUBSCRIBE_HEADERS,
  buildEmailHtml,
  sendAbandonedCartEmail,
  sendNewCodOrderEmail,
  sendCodOrderConfirmationEmail,
  sendMarketingEmail,
};
