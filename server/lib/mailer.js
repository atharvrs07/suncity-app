const nodemailer = require('nodemailer');
const cfg = require('../config');
const { buildReceiptPdf } = require('./receiptPdf');

// Gmail SMTP via App Password (Google requires app passwords for SMTP with 2FA).
// When GMAIL_APP_PASSWORD is not set (local dev), emails are logged to the
// console instead of sent, so the reset flow stays testable end-to-end.
const transport = cfg.MAIL.appPassword
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: cfg.MAIL.user, pass: cfg.MAIL.appPassword },
    })
  : null;

async function sendMail({ to, subject, text, html, attachments }) {
  if (!transport) {
    console.log(`[mail] SMTP not configured (GMAIL_APP_PASSWORD empty) — would have sent:`);
    const attachNote = attachments && attachments.length ? ` (+${attachments.length} attachment: ${attachments.map((a) => a.filename).join(', ')})` : '';
    console.log(`[mail] To: ${to}\n[mail] Subject: ${subject}${attachNote}\n[mail] ${text}`);
    return;
  }
  await transport.sendMail({ from: `"My Suncity Vistaar" <${cfg.MAIL.user}>`, to, subject, text, html, attachments });
}

function sendPasswordResetEmail({ to, name, resetUrl }) {
  const subject = 'Reset your My Suncity Vistaar password';
  const text =
    `Hi ${name},\n\n` +
    `We received a request to reset the password for your My Suncity Vistaar account.\n` +
    `Open this link to choose a new password (valid for 30 minutes, single use):\n\n` +
    `${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password stays unchanged.\n\n` +
    `— Sun City Vistaar society office`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#232634;">
    <h2 style="margin:0 0 4px;">🏙️ My Suncity Vistaar</h2>
    <p style="margin:0 0 20px;color:#5d6175;font-size:13px;">Sun City Vistaar society</p>
    <p>Hi ${name},</p>
    <p>We received a request to reset the password for your My Suncity Vistaar account.</p>
    <p style="text-align:center;margin:26px 0;">
      <a href="${resetUrl}" style="background:#2f6bff;color:#fff;text-decoration:none;padding:12px 26px;border-radius:12px;font-weight:bold;display:inline-block;">
        Reset Password
      </a>
    </p>
    <p style="color:#5d6175;font-size:13px;">The link is valid for 30 minutes and can be used once.
      If the button doesn't work, copy this link into your browser:<br>
      <a href="${resetUrl}">${resetUrl}</a></p>
    <p style="color:#5d6175;font-size:13px;">If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>
  </div>`;
  return sendMail({ to, subject, text, html });
}

function sendSignupOtpEmail({ to, name, otp, expiryMinutes = 10 }) {
  const subject = 'Your My Suncity Vistaar verification code';
  const text =
    `Hi ${name},\n\n` +
    `Welcome to My Suncity Vistaar! Use this code to verify your email and finish creating your account:\n\n` +
    `${otp}\n\n` +
    `The code is valid for ${expiryMinutes} minutes and can be used once.\n` +
    `If you didn't try to sign up, you can safely ignore this email.\n\n` +
    `— Sun City Vistaar society office`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#232634;">
    <h2 style="margin:0 0 4px;">🏙️ My Suncity Vistaar</h2>
    <p style="margin:0 0 20px;color:#5d6175;font-size:13px;">Sun City Vistaar society</p>
    <p>Hi ${name},</p>
    <p>Welcome! Use this code to verify your email and finish creating your account:</p>
    <p style="text-align:center;margin:26px 0;">
      <span style="display:inline-block;background:#f0f4ff;color:#2f6bff;font-size:34px;font-weight:bold;letter-spacing:10px;padding:14px 26px;border-radius:14px;">
        ${otp}
      </span>
    </p>
    <p style="color:#5d6175;font-size:13px;">The code is valid for ${expiryMinutes} minutes and can be used once.</p>
    <p style="color:#5d6175;font-size:13px;">If you didn't try to sign up, you can safely ignore this email.</p>
  </div>`;
  return sendMail({ to, subject, text, html });
}

function sendNewResidentAdminEmail({ to, adminName, resident }) {
  const subject = 'New resident joined — My Suncity Vistaar';
  const block = resident.block ? `\nBlock: ${resident.block}` : '';
  const flat = resident.flat_no ? `\nFlat: ${resident.flat_no}` : '';
  const text =
    `Hi ${adminName || 'Admin'},\n\n` +
    `A new resident just verified their email and joined My Suncity Vistaar.\n\n` +
    `Name: ${resident.name}\n` +
    `Email: ${resident.email}\n` +
    `Phone: ${resident.phone}${block}${flat}\n\n` +
    `Their account is already active — no approval is required for resident signups.\n\n` +
    `— My Suncity Vistaar`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#232634;">
    <h2 style="margin:0 0 4px;">🏙️ My Suncity Vistaar</h2>
    <p style="margin:0 0 20px;color:#5d6175;font-size:13px;">Sun City Vistaar society</p>
    <p>Hi ${adminName || 'Admin'},</p>
    <p>A new resident just verified their email and joined My Suncity Vistaar.</p>
    <table style="border-collapse:collapse;font-size:14px;margin:14px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Name</td><td style="padding:4px 0;font-weight:600;">${resident.name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Email</td><td style="padding:4px 0;font-weight:600;">${resident.email}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Phone</td><td style="padding:4px 0;font-weight:600;">${resident.phone}</td></tr>
      ${resident.block ? `<tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Block</td><td style="padding:4px 0;font-weight:600;">${resident.block}</td></tr>` : ''}
      ${resident.flat_no ? `<tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Flat</td><td style="padding:4px 0;font-weight:600;">${resident.flat_no}</td></tr>` : ''}
    </table>
    <p style="color:#5d6175;font-size:13px;">Their account is already active — no approval is required for resident signups.</p>
  </div>`;
  return sendMail({ to, subject, text, html });
}

function sendPendingAccountAdminEmail({ to, adminName, pending }) {
  const roleLabel = pending.role === 'admin' ? 'Admin' : `Office Bearer — ${pending.role_detail}`;
  const subject = 'Account awaiting approval — My Suncity Vistaar';
  const contact = [pending.phone ? `Phone: ${pending.phone}` : '', pending.email ? `Email: ${pending.email}` : '']
    .filter(Boolean)
    .join('\n');
  const text =
    `Hi ${adminName || 'Admin'},\n\n` +
    `A new higher-authority account is waiting for your approval.\n\n` +
    `Name: ${pending.name}\n` +
    `Requested role: ${roleLabel}\n` +
    `${contact}\n\n` +
    `Open the Approvals screen to review it. For office bearers you can also choose their permissions when approving.\n\n` +
    `— My Suncity Vistaar`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#232634;">
    <h2 style="margin:0 0 4px;">🏙️ My Suncity Vistaar</h2>
    <p style="margin:0 0 20px;color:#5d6175;font-size:13px;">Sun City Vistaar society</p>
    <p>Hi ${adminName || 'Admin'},</p>
    <p>A new higher-authority account is waiting for your approval.</p>
    <table style="border-collapse:collapse;font-size:14px;margin:14px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Name</td><td style="padding:4px 0;font-weight:600;">${pending.name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Role</td><td style="padding:4px 0;font-weight:600;">${roleLabel}</td></tr>
      ${pending.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Phone</td><td style="padding:4px 0;font-weight:600;">${pending.phone}</td></tr>` : ''}
      ${pending.email ? `<tr><td style="padding:4px 12px 4px 0;color:#5d6175;">Email</td><td style="padding:4px 0;font-weight:600;">${pending.email}</td></tr>` : ''}
    </table>
    <p style="color:#5d6175;font-size:13px;">Open the Approvals screen to review it. For office bearers you can also choose their permissions when approving.</p>
  </div>`;
  return sendMail({ to, subject, text, html });
}

// Payment receipt (item 22). `provisional` decides the watermark + wording:
//  - provisional=true  → sent automatically once Gemini's check passes; clearly
//    marked "Provisional Receipt — Subject to Payment Verification by Society".
//  - provisional=false → the final/permanent receipt, sent when an admin/office
//    bearer manually verifies the payment.
// `items` is the itemized month/due breakdown ([{ periodLabel, amount }]) the
// payment was applied to (oldest-first mapping). The receipt lists each and a
// total, and the same breakdown is rendered into an attached PDF. Falls back to
// a single line from `receipt.periodLabel`/`receipt.amountValue` if no items.
async function sendPaymentReceiptEmail({ to, name, receipt, items = [], provisional }) {
  const {
    receiptNo,
    txnId,
    txnDateTime,
    paidOn,
    society = 'SunCity Vistaar - Jan Kalyan Samiti',
  } = receipt;
  const lineItems =
    items && items.length
      ? items
      : receipt.periodLabel
        ? [{ periodLabel: receipt.periodLabel, amount: Number(receipt.amountValue || 0) }]
        : [];
  const total = lineItems.reduce((s, it) => s + Number(it.amount || 0), 0);
  const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  const heading = provisional ? 'Provisional Payment Receipt' : 'Payment Receipt';
  const subject = provisional
    ? `Provisional receipt for your payment — ${society}`
    : `Payment receipt (verified) — ${society}`;
  const watermark = provisional
    ? 'PROVISIONAL RECEIPT — SUBJECT TO PAYMENT VERIFICATION BY SOCIETY'
    : 'VERIFIED BY SOCIETY';
  const rows = [
    ['Receipt No.', receiptNo],
    ['Resident', name],
    ['Transaction ID', txnId || '—'],
    ['Payment date/time', txnDateTime || '—'],
    ['Recorded on', paidOn],
  ];
  const itemsText = lineItems.length
    ? lineItems.map((it) => `  • ${it.periodLabel}: ${inr(it.amount)}`).join('\n')
    : '  • —';
  const text =
    `${heading}\n${society}\n\n` +
    `*** ${watermark} ***\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nPayment applied to:\n${itemsText}\nTotal paid: ${inr(total)}\n\n` +
    (provisional
      ? 'This is a provisional acknowledgement generated after an automated check of your payment screenshot. It is subject to final verification by the society office. A permanent receipt will follow once verified.\n'
      : 'This payment has been verified by the society office. This is your final receipt.\n') +
    `\nA PDF copy of this receipt is attached.\n\n— ${society}`;
  const bannerColor = provisional ? '#e0851a' : '#1fa060';
  const itemRowsHtml = (lineItems.length ? lineItems : [{ periodLabel: '—', amount: 0 }])
    .map(
      (it) =>
        `<tr><td style="padding:7px 12px 7px 0;">${it.periodLabel}</td><td style="padding:7px 0;font-weight:600;text-align:right;">${inr(it.amount)}</td></tr>`
    )
    .join('');
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:0;color:#232634;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden;">
    <div style="background:${bannerColor};color:#fff;padding:10px 20px;font-size:12px;font-weight:bold;letter-spacing:0.04em;text-align:center;">
      ${watermark}
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 2px;">${heading}</h2>
      <p style="margin:0 0 18px;color:#5d6175;font-size:13px;">${society}</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:7px 12px 7px 0;color:#5d6175;white-space:nowrap;">${k}</td><td style="padding:7px 0;font-weight:600;text-align:right;">${v}</td></tr>`
          )
          .join('')}
      </table>
      <p style="margin:20px 0 6px;color:#5d6175;font-size:12px;font-weight:bold;letter-spacing:0.03em;text-transform:uppercase;">Payment applied to</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;">
        <tr style="color:#5d6175;font-size:12px;"><td style="padding:4px 0;">Month / Due</td><td style="padding:4px 0;text-align:right;">Amount</td></tr>
        ${itemRowsHtml}
        <tr style="border-top:1px solid #e6e8f0;"><td style="padding:9px 0 0;font-weight:bold;">Total paid</td><td style="padding:9px 0 0;font-weight:bold;text-align:right;">${inr(total)}</td></tr>
      </table>
      <p style="color:#5d6175;font-size:12.5px;margin-top:20px;line-height:1.5;">
        ${
          provisional
            ? 'This is a provisional acknowledgement generated after an automated check of your payment screenshot. It is <b>subject to final verification by the society</b>. A permanent receipt will follow once the office verifies it.'
            : 'This payment has been <b>verified by the society office</b>. This is your final receipt.'
        }
        A PDF copy is attached.
      </p>
    </div>
  </div>`;

  // Generate the PDF; if it fails for any reason, still send the email (the HTML
  // body carries the same itemized detail) rather than dropping the receipt.
  let attachments;
  try {
    const pdf = await buildReceiptPdf({ receipt: { ...receipt, resident: name }, items: lineItems, provisional });
    attachments = [{ filename: `receipt-${receiptNo}.pdf`, content: pdf, contentType: 'application/pdf' }];
  } catch (err) {
    console.error('[receipt] PDF generation failed:', err.message);
  }
  return sendMail({ to, subject, text, html, attachments });
}

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  sendSignupOtpEmail,
  sendNewResidentAdminEmail,
  sendPendingAccountAdminEmail,
  sendPaymentReceiptEmail,
};
