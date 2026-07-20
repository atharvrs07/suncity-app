const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const cfg = require('../config');
const { sign, authRequired } = require('../middleware/auth');
const { sendPasswordResetEmail, sendSignupOtpEmail, sendNewResidentAdminEmail } = require('../lib/mailer');

const router = express.Router();

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e || null;
}

// Simple in-memory per-IP rate limiter (resets on server restart) — shared by
// the OB login and forgot-password endpoints.
function makeRateLimiter(maxAttempts, windowMs) {
  const attempts = new Map(); // ip -> { count, resetAt }
  return {
    limited(ip) {
      const now = Date.now();
      for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
      const entry = attempts.get(ip) || { count: 0, resetAt: now + windowMs };
      entry.count += 1;
      attempts.set(ip, entry);
      return entry.count > maxAttempts;
    },
    clear(ip) {
      attempts.delete(ip);
    },
  };
}

// ---- Resident signup with email OTP verification ----
// Signup is exclusively for residents. Instead of parking the account in a
// 'pending' state for admin approval, we email a single-use numeric code and
// only create the (already approved) account once it's verified — see
// /verify-signup below. Other roles (office bearers, admins) are provisioned
// outside this flow (seed scripts + hidden OB login), not here.

const OTP_TTL_MS = 10 * 60 * 1000; // codes valid for 10 minutes
const OTP_TTL_MIN = OTP_TTL_MS / 60000;
const OTP_MAX_ATTEMPTS = 5; // wrong entries before a code is burned
const OTP_MAX_RESENDS = 5; // resends allowed per signup session
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // min gap between sends

const signupLimiter = makeRateLimiter(10, 15 * 60 * 1000); // initiate signup / IP
const otpVerifyLimiter = makeRateLimiter(20, 15 * 60 * 1000); // verify attempts / IP
const otpResendLimiter = makeRateLimiter(10, 15 * 60 * 1000); // resend requests / IP

const genOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// Email every approved admin who has an email on file that a new resident
// joined. No in-app notification system exists, so email is the channel.
function notifyAdminsNewResident(resident) {
  const admins = db
    .prepare("SELECT name, email FROM users WHERE role = 'admin' AND status = 'approved' AND email IS NOT NULL AND email != ''")
    .all();
  if (admins.length === 0) {
    console.log(`[notify] New resident ${resident.name} <${resident.email}> joined — no admin email on file to notify.`);
    return Promise.resolve();
  }
  return Promise.all(
    admins.map((a) =>
      sendNewResidentAdminEmail({ to: a.email, adminName: a.name, resident }).catch((err) =>
        console.error('[mail] Failed to notify admin of new resident:', err.message)
      )
    )
  );
}

router.post('/signup', (req, res) => {
  if (signupLimiter.limited(req.ip)) {
    return res.status(429).json({ error: 'Too many signup attempts. Try again in a few minutes.' });
  }
  const { name, phone, email, password, flat_no } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = normalizeEmail(email);
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone)) {
    return res.status(409).json({ error: 'An account with this phone number already exists' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const code = genOtp();
  const now = Date.now();
  db.transaction(() => {
    // A fresh signup for this email replaces any earlier in-flight one.
    db.prepare('DELETE FROM signup_otps WHERE email = ?').run(cleanEmail);
    db.prepare(
      `INSERT INTO signup_otps (email, name, phone, flat_no, password_hash, code_hash, expires_at, last_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cleanEmail,
      cleanName,
      cleanPhone,
      flat_no ? String(flat_no).trim() : null,
      bcrypt.hashSync(password, 10),
      hashOtp(code),
      new Date(now + OTP_TTL_MS).toISOString(),
      new Date(now).toISOString()
    );
  })();

  sendSignupOtpEmail({ to: cleanEmail, name: cleanName, otp: code, expiryMinutes: OTP_TTL_MIN }).catch((err) =>
    console.error('[mail] Failed to send signup OTP email:', err.message)
  );

  res.status(200).json({
    email: cleanEmail,
    message: `We've emailed a 6-digit verification code to ${cleanEmail}. Enter it to finish creating your account.`,
  });
});

router.post('/verify-signup', (req, res) => {
  if (otpVerifyLimiter.limited(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const cleanEmail = normalizeEmail(req.body && req.body.email);
  const code = String((req.body && req.body.otp) || '').trim();
  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit code from your email' });
  }

  const row = db.prepare('SELECT * FROM signup_otps WHERE email = ?').get(cleanEmail);
  if (!row) {
    return res.status(400).json({ error: 'No pending verification for this email. Please sign up again.' });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM signup_otps WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'This code has expired. Please request a new one.' });
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM signup_otps WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'Too many incorrect attempts. Please sign up again.' });
  }
  if (hashOtp(code) !== row.code_hash) {
    db.prepare('UPDATE signup_otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const left = OTP_MAX_ATTEMPTS - (row.attempts + 1);
    return res.status(400).json({
      error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code.',
    });
  }

  // Correct code — create the approved resident account, guarding against a
  // phone/email that got claimed since signup began (unique constraints back
  // this up too). The signup_otps row is consumed inside the same transaction.
  let user;
  try {
    user = db.transaction(() => {
      if (db.prepare('SELECT id FROM users WHERE phone = ?').get(row.phone)) {
        const e = new Error('An account with this phone number already exists');
        e.status = 409;
        throw e;
      }
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(row.email)) {
        const e = new Error('An account with this email already exists');
        e.status = 409;
        throw e;
      }
      const info = db
        .prepare(
          "INSERT INTO users (name, phone, email, password_hash, flat_no, role, status) VALUES (?, ?, ?, ?, ?, 'resident', 'approved')"
        )
        .run(row.name, row.phone, row.email, row.password_hash, row.flat_no);
      db.prepare('DELETE FROM signup_otps WHERE email = ?').run(row.email);
      return db
        .prepare('SELECT id, name, phone, username, email, flat_no, role, role_detail, status FROM users WHERE id = ?')
        .get(info.lastInsertRowid);
    })();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Could not create your account' });
  }

  notifyAdminsNewResident(user).catch((err) => console.error('[notify] admin notification failed:', err.message));

  res.status(201).json({ token: sign(user), user });
});

router.post('/resend-otp', (req, res) => {
  if (otpResendLimiter.limited(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const cleanEmail = normalizeEmail(req.body && req.body.email);
  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  const row = db.prepare('SELECT * FROM signup_otps WHERE email = ?').get(cleanEmail);
  if (row) {
    const sinceLast = Date.now() - new Date(row.last_sent_at).getTime();
    if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
    }
    if (row.resends >= OTP_MAX_RESENDS) {
      return res.status(429).json({ error: 'Too many codes requested. Please sign up again in a little while.' });
    }
    const code = genOtp();
    const now = Date.now();
    db.prepare(
      'UPDATE signup_otps SET code_hash = ?, expires_at = ?, attempts = 0, resends = resends + 1, last_sent_at = ? WHERE id = ?'
    ).run(hashOtp(code), new Date(now + OTP_TTL_MS).toISOString(), new Date(now).toISOString(), row.id);
    sendSignupOtpEmail({ to: row.email, name: row.name, otp: code, expiryMinutes: OTP_TTL_MIN }).catch((err) =>
      console.error('[mail] Failed to resend signup OTP email:', err.message)
    );
  }
  // Generic response either way so a completed/absent signup can't be probed.
  res.json({ message: 'If a signup is in progress for that email, a new code has been sent.' });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normalizePhone(phone));
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect phone number or password' });
  }
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Your account is still awaiting admin approval' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Your signup was rejected. Contact the society office.' });
  }
  const { password_hash, ...safe } = user;
  res.json({ token: sign(user), user: safe });
});

// ---- Office-bearer login (username + password) ----
// Deliberately unlinked from the UI; reachable only by direct URL (/ob/login).
// Every failure returns the same generic 401 so usernames can't be enumerated,
// and a dummy bcrypt compare keeps unknown-username timing in line.

const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
const obLimiter = makeRateLimiter(10, 15 * 60 * 1000);

router.post('/ob-login', (req, res) => {
  if (obLimiter.limited(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const { username, password } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  const user = uname
    ? db.prepare("SELECT * FROM users WHERE username = ? AND role = 'office_bearer'").get(uname)
    : null;
  const ok = bcrypt.compareSync(password || '', user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || user.status !== 'approved') {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  obLimiter.clear(req.ip);
  const { password_hash, ...safe } = user;
  res.json({ token: sign(user), user: safe });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', authRequired, (req, res) => {
  const { name, flat_no, email } = req.body || {};
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
  if (email !== undefined) {
    const cleanEmail = normalizeEmail(email);
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (cleanEmail && db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, req.user.id)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(cleanEmail, req.user.id);
  }
  db.prepare('UPDATE users SET name = COALESCE(?, name), flat_no = COALESCE(?, flat_no) WHERE id = ?').run(
    name !== undefined ? String(name).trim() : null,
    flat_no !== undefined ? String(flat_no).trim() : null,
    req.user.id
  );
  const user = db
    .prepare('SELECT id, name, phone, username, email, flat_no, role, role_detail, status FROM users WHERE id = ?')
    .get(req.user.id);
  res.json({ user });
});

// ---- Self-service forgot / reset password ----
// Token is random, stored only as a SHA-256 hash, valid 30 minutes, single
// use. The forgot endpoint always answers with the same generic message so
// account emails can't be enumerated.

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const forgotLimiter = makeRateLimiter(5, 15 * 60 * 1000);
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

router.post('/forgot-password', (req, res) => {
  if (forgotLimiter.limited(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const cleanEmail = normalizeEmail(req.body && req.body.email);
  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND status = 'approved'").get(cleanEmail);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(user.id);
    db.prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
      user.id,
      hashToken(token),
      expiresAt
    );
    const resetUrl = `${cfg.APP_BASE_URL}/reset-password?token=${token}`;
    sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl }).catch((err) =>
      console.error('[mail] Failed to send password reset email:', err.message)
    );
  }
  res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Reset link is invalid' });
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const row = db
    .prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL')
    .get(hashToken(String(token)));
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), row.user_id);
    db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(row.user_id);
  })();
  res.json({ message: 'Password updated. You can now sign in with your new password.' });
});

router.post('/change-password', authRequired, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password || '', row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ message: 'Password updated' });
});

module.exports = router;
