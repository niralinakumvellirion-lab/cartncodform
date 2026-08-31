const { Resend } = require('resend');

// The Resend constructor throws if the key is falsy, which would crash server
// startup when RESEND_API_KEY is unset. Fall back to a placeholder so the app
// still boots; sends then fail with an auth error that is caught and logged.
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_no_key');
const FROM = process.env.FROM_EMAIL || 'onboarding@resend.dev';

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

// ---------------------------------------------------------------------------
// 1. Abandoned cart reminder -> the customer
// ---------------------------------------------------------------------------

async function sendAbandonedCartEmail(customer) {
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

    const cta = process.env.FRONTEND_URL || '#';

    const html = shell(
      `<h1 style="font-size:22px;margin:0 0 12px;">You forgot something!</h1>` +
        `<p style="margin:0 0 16px;color:#4b5563;">Here's what's still waiting in your cart:</p>` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px;">` +
        `${rows || '<tr><td style="padding:6px 0;color:#6b7280;">Your saved items</td></tr>'}` +
        `<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:700;">Total</td>` +
        `<td style="padding:10px 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;">` +
        `${money(customer.cartValue)}</td></tr>` +
        `</table>` +
        `<p style="margin:24px 0;">${button(cta, 'Complete Your Order')}</p>` +
        `<p style="margin:32px 0 0;font-size:12px;color:#9ca3af;">` +
        `This reminder was sent by CartnCodForm</p>`
    );

    const { error } = await resend.emails.send({
      from: FROM,
      to: customer.email,
      subject: 'You left something behind! 🛒',
      html,
    });

    if (error) throw new Error(error.message || JSON.stringify(error));

    console.log(`Email sent: abandoned_cart to ${customer.email}`);
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
        `<p style="margin:32px 0 0;font-size:12px;color:#9ca3af;">Powered by CartnCodForm</p>`
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
// 3. COD order confirmation -> the customer (not wired up yet)
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
  sendAbandonedCartEmail,
  sendNewCodOrderEmail,
  sendCodOrderConfirmationEmail,
};
