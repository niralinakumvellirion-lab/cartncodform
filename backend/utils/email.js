const { Resend } = require('resend');

// The Resend constructor throws if the key is falsy, which would crash server
// startup when RESEND_API_KEY is unset. Fall back to a placeholder so the app
// still boots; sends then fail with an auth error that is caught and logged.
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_no_key');
const FROM = process.env.FROM_EMAIL || 'notifications@shopireachboost.com';

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
 * Build a complete, deliverable HTML email document.
 *
 * Table-based single-column layout (600 px max) so Outlook desktop
 * degrades gracefully — square corners, no border-radius, readable text.
 * MSO VML rounded buttons and <!--[if mso]--> conditional comments are
 * deliberately omitted in this T1 pass; Outlook renders the button as
 * a flat blue-background link, which is acceptable.
 *
 * @param {object} opts
 * @param {string} opts.subject        - Email subject (used in <title> + hero alt)
 * @param {string} opts.bodyHtml       - Already-formatted body (may contain <br>)
 * @param {string|null} opts.imageUrl  - Hero image URL; skipped unless https://
 * @param {string|null} opts.ctaLabel  - Button label; skipped when ctaUrl absent
 * @param {string|null} opts.ctaUrl    - CTA href; omit to suppress button
 * @param {string|null} opts.storeName - Display name in header/footer
 * @param {string|null} opts.logoUrl   - Store logo; falls back to storeName text
 * @param {string|null} opts.primaryColor - Hex brand color; falls back to DEFAULT_ACCENT
 * @returns {string} Complete <!DOCTYPE html> document
 */
function buildEmailHtml({ subject, bodyHtml, imageUrl, ctaLabel, ctaUrl, storeName, logoUrl, primaryColor }) {
  const accent = primaryColor || DEFAULT_ACCENT;
  const safe = escapeHtml;

  const headerContent = logoUrl
    ? `<img src="${safe(logoUrl)}" alt="${safe(storeName || '')}" width="160" ` +
      `style="display:block;max-width:160px;height:auto;border:0;margin:0 auto;">`
    : `<span style="font-size:18px;font-weight:700;color:#111827;` +
      `font-family:Arial,Helvetica,sans-serif;">${safe(storeName || '')}</span>`;

  // Hero image: https only — skip http, data: and relative URLs.
  const heroRow =
    imageUrl && imageUrl.startsWith('https://')
      ? `\n        <tr>\n          <td style="background:#ffffff;padding:0;" align="center">` +
        `\n            <img src="${safe(imageUrl)}" alt="${safe(subject || '')}" width="600"` +
        ` style="display:block;width:100%;max-width:600px;height:auto;border:0;">` +
        `\n          </td>\n        </tr>`
      : '';

  // Bulletproof button: bgcolor on <td> works in Outlook even without MSO VML.
  const ctaRow = ctaUrl
    ? `\n        <tr>\n          <td style="background:#ffffff;padding:8px 32px 32px;" align="center">` +
      `\n            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">` +
      `\n              <tr>\n                <td align="center" bgcolor="${safe(accent)}"` +
      ` style="border-radius:6px;background:${safe(accent)};">` +
      `\n                  <a href="${safe(ctaUrl)}"` +
      ` style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;` +
      `font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;"` +
      ` target="_blank">${safe(ctaLabel || 'Shop Now')}</a>` +
      `\n                </td>\n              </tr>\n            </table>` +
      `\n          </td>\n        </tr>`
    : '';

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>${safe(subject || '')}</title>\n` +
    `<style>\n` +
    `@media (max-width:600px){\n` +
    `  .email-wrapper{width:100%!important;}\n` +
    `  .email-body{padding:16px!important;}\n` +
    `}\n` +
    `</style>\n` +
    `</head>\n<body style="margin:0;padding:0;background:#f3f4f6;">\n` +
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6"` +
    ` style="background:#f3f4f6;">\n  <tr>\n    <td align="center" valign="top" style="padding:32px 16px;">\n` +
    `      <table class="email-wrapper" width="600" cellpadding="0" cellspacing="0" border="0"` +
    ` style="max-width:600px;width:600px;">\n` +
    `        <!-- header -->\n        <tr>\n          <td style="background:#ffffff;padding:24px 32px;` +
    `text-align:center;border-bottom:1px solid #e5e7eb;">\n            ${headerContent}\n          </td>\n        </tr>` +
    heroRow +
    `\n        <!-- body -->\n        <tr>\n          <td class="email-body"` +
    ` style="background:#ffffff;padding:32px;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;` +
    `font-size:15px;color:#111827;line-height:1.7;">\n            ${bodyHtml || ''}` +
    `\n          </td>\n        </tr>` +
    ctaRow +
    `\n        <!-- footer -->\n        <tr>\n          <td style="background:#f9fafb;padding:20px 32px;` +
    `text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;` +
    `border-top:1px solid #e5e7eb;">\n            ${safe(storeName || '')} &middot; ` +
    `<a href="#" style="color:#6b7280;">Unsubscribe</a>\n          </td>\n        </tr>\n      </table>` +
    `\n    </td>\n  </tr>\n</table>\n</body>\n</html>`;
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
  buildEmailHtml,
  sendAbandonedCartEmail,
  sendNewCodOrderEmail,
  sendCodOrderConfirmationEmail,
  sendMarketingEmail,
};
