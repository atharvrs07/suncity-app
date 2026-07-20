const nodemailer = require('nodemailer');
const cfg = require('../config');

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

async function sendMail({ to, subject, text, html }) {
  if (!transport) {
    console.log(`[mail] SMTP not configured (GMAIL_APP_PASSWORD empty) — would have sent:`);
    console.log(`[mail] To: ${to}\n[mail] Subject: ${subject}\n[mail] ${text}`);
    return;
  }
  await transport.sendMail({ from: `"My Suncity Vistaar" <${cfg.MAIL.user}>`, to, subject, text, html });
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

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  sendSignupOtpEmail,
  sendNewResidentAdminEmail,
  sendPendingAccountAdminEmail,
};
