const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const cfg = require('../config');
const oauth = require('../lib/oauth');
const { sign, authRequired } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const {
  sendPasswordResetEmail,
  sendSignupOtpEmail,
  sendNewResidentAdminEmail,
  sendPendingAccountAdminEmail,
} = require('../lib/mailer');
const { isValidHouseNo } = require('../lib/houseNumbers');
const { isDisposableEmail, hasMxRecords } = require('../lib/emailValidation');

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

// Returns the block name exactly as listed in config, or null if it isn't one
// of the allowed society blocks — signup is rejected in that case.
function normalizeBlock(block) {
  const b = String(block || '').trim();
  return cfg.BLOCKS.includes(b) ? b : null;
}

// A resident is either the flat's 'owner' or its (living-in) 'resident'. Returns
// the normalized value or null if it isn't one of the two allowed statuses.
function normalizeResidentStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return cfg.RESIDENT_STATUSES.includes(s) ? s : null;
}

// Is the Owner/Resident slot for this house already registered? A house holds at
// most one owner + one resident, so we check the specific (block, house, status)
// slot. The DB unique index (idx_users_house_slot) is the atomic backstop against
// races; this gives a friendly error before the insert. `excludeId` lets an admin
// edit re-save a resident's own unchanged slot.
function houseSlotTaken(block, houseNo, status, excludeId) {
  const row = db
    .prepare(
      `SELECT id FROM users WHERE role = 'resident' AND block = ? AND house_no = ? AND resident_status = ?${
        excludeId ? ' AND id != ?' : ''
      }`
    )
    .get(...(excludeId ? [block, houseNo, status, excludeId] : [block, houseNo, status]));
  return !!row;
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

router.post('/signup', async (req, res) => {
  if (signupLimiter.limited(req.ip)) {
    return res.status(429).json({ error: 'Too many signup attempts. Try again in a few minutes.' });
  }
  const { name, phone, email, password, block, house_no, resident_status } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = normalizeEmail(email);
  const cleanBlock = normalizeBlock(block);
  const cleanHouseNo = String(house_no || '').trim();
  const cleanStatus = normalizeResidentStatus(resident_status);
  // Every field on the resident signup form is mandatory (the staged reveal on
  // the client is presentation only — all fields are still required here).
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!cleanStatus) return res.status(400).json({ error: 'Select whether you are the Owner or a Resident' });
  if (!cleanBlock) return res.status(400).json({ error: 'Select your block' });
  if (!cleanHouseNo) return res.status(400).json({ error: 'Select your house number' });
  // The house number must belong to the chosen block (source of truth is
  // block-house-numbers.json, shared with the client).
  if (!isValidHouseNo(cleanBlock, cleanHouseNo)) {
    return res.status(400).json({ error: 'Select a house number that belongs to your block' });
  }
  // One Owner + one Resident per house — reject if this house's slot is taken.
  if (houseSlotTaken(cleanBlock, cleanHouseNo, cleanStatus)) {
    return res.status(409).json({
      error: `The ${cleanStatus === 'owner' ? 'Owner' : 'Resident'} for ${cleanBlock} ${cleanHouseNo} is already registered.`,
    });
  }
  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  // Block disposable / temp-mail domains outright — before any OTP is sent.
  if (isDisposableEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Please use a permanent email address' });
  }
  // The domain must actually be able to receive mail (publishes MX records).
  try {
    if (!(await hasMxRecords(cleanEmail))) {
      return res.status(400).json({ error: "This email domain can't receive mail — please check the address." });
    }
  } catch (err) {
    console.error('[signup] MX lookup failed:', err.message);
    return res.status(503).json({ error: 'Could not verify your email domain right now. Please try again in a moment.' });
  }

  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone)) {
    return res.status(409).json({ error: 'An account with this phone number already exists' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  // Per-email throttle: don't fire a fresh code if one was just sent to this
  // address (complements the per-IP limiter above).
  const existing = db.prepare('SELECT last_sent_at FROM signup_otps WHERE email = ?').get(cleanEmail);
  if (existing) {
    const sinceLast = Date.now() - new Date(existing.last_sent_at).getTime();
    if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000);
      return res.status(429).json({ error: `A code was just sent to that email. Please wait ${wait}s before trying again.` });
    }
  }

  const code = genOtp();
  const now = Date.now();
  db.transaction(() => {
    // A fresh signup for this email replaces any earlier in-flight one.
    db.prepare('DELETE FROM signup_otps WHERE email = ?').run(cleanEmail);
    db.prepare(
      `INSERT INTO signup_otps (email, name, phone, flat_no, block, house_no, resident_status, password_hash, code_hash, expires_at, last_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cleanEmail,
      cleanName,
      cleanPhone,
      cleanHouseNo, // flat_no mirrors the structured house number so existing displays keep working
      cleanBlock,
      cleanHouseNo,
      cleanStatus,
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
      // The house slot may have been claimed while the code sat unverified.
      if (row.resident_status && houseSlotTaken(row.block, row.house_no, row.resident_status)) {
        const e = new Error(
          `The ${row.resident_status === 'owner' ? 'Owner' : 'Resident'} for ${row.block} ${row.house_no} is already registered.`
        );
        e.status = 409;
        throw e;
      }
      const info = db
        .prepare(
          "INSERT INTO users (name, phone, email, password_hash, flat_no, block, house_no, resident_status, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'resident', 'approved')"
        )
        .run(row.name, row.phone, row.email, row.password_hash, row.flat_no, row.block, row.house_no, row.resident_status);
      db.prepare('DELETE FROM signup_otps WHERE email = ?').run(row.email);
      return db
        .prepare('SELECT id, name, phone, username, email, flat_no, block, house_no, resident_status, role, role_detail, status FROM users WHERE id = ?')
        .get(info.lastInsertRowid);
    })();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Could not create your account' });
  }

  logAudit({ actor: user, action: 'resident_signup', targetType: 'user', targetId: user.id, detail: `${user.name} joined` });
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

// ---- Higher-authority signup (office bearer / admin) ----
// Unlike residents, these roles carry real authority, so they are NOT
// email-OTP-verified and NOT auto-approved: the account is created 'pending' and
// an admin must approve it (choosing the office bearer's permissions at that
// point). Login is by phone once approved. Super admin is never creatable here.
const STAFF_ROLES = ['office_bearer', 'admin'];
const staffSignupLimiter = makeRateLimiter(10, 15 * 60 * 1000);

function notifyAdminsPendingAccount(pending) {
  const admins = db
    .prepare(
      "SELECT name, email FROM users WHERE role IN ('admin','super_admin') AND status = 'approved' AND email IS NOT NULL AND email != ''"
    )
    .all();
  if (admins.length === 0) {
    console.log(`[notify] Pending ${pending.role} ${pending.name} needs approval — no admin email on file.`);
    return Promise.resolve();
  }
  return Promise.all(
    admins.map((a) =>
      sendPendingAccountAdminEmail({ to: a.email, adminName: a.name, pending }).catch((err) =>
        console.error('[mail] Failed to notify admin of pending account:', err.message)
      )
    )
  );
}

router.post('/signup-staff', (req, res) => {
  if (staffSignupLimiter.limited(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const { name, role, role_detail, email, phone, password } = req.body || {};
  const cleanName = String(name || '').trim();
  const wantRole = STAFF_ROLES.includes(role) ? role : null;
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = normalizeEmail(email);

  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!wantRole) return res.status(400).json({ error: 'Choose a valid account type' });

  let cleanDetail = null;
  if (wantRole === 'office_bearer') {
    cleanDetail = String(role_detail || '').trim();
    if (!cfg.OFFICE_BEARER_ROLES.includes(cleanDetail)) {
      return res.status(400).json({ error: 'Choose your committee post' });
    }
  }
  if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
  if (cleanEmail && !EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone)) {
    return res.status(409).json({ error: 'An account with this phone number already exists' });
  }
  if (cleanEmail && db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const info = db
    .prepare(
      "INSERT INTO users (name, phone, email, password_hash, role, role_detail, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')"
    )
    .run(cleanName, cleanPhone, cleanEmail, bcrypt.hashSync(password, 10), wantRole, cleanDetail);

  const created = { id: info.lastInsertRowid, name: cleanName, role: wantRole, role_detail: cleanDetail, phone: cleanPhone, email: cleanEmail };
  logAudit({
    actor: null,
    action: 'staff_signup_request',
    targetType: 'user',
    targetId: created.id,
    detail: `${cleanName} requested ${wantRole === 'admin' ? 'Admin' : `Office Bearer — ${cleanDetail}`}`,
  });
  notifyAdminsPendingAccount(created).catch((err) => console.error('[notify] pending-account notification failed:', err.message));

  res.status(201).json({
    message:
      "Your account request has been submitted. An admin will review it, and you'll be able to sign in once it's approved.",
  });
});

// ---- OAuth sign-in (Google, Apple, Microsoft) ----
// Server-side Authorization Code flow (see server/lib/oauth.js). The browser is
// redirected to the provider and back to our callback; we verify the provider's
// ID token and then either sign an existing resident in, or — for a brand-new
// account — hand the browser a short-lived signed "profile" token and bounce it
// to the complete-profile step so the mandatory fields OAuth can't supply
// (phone, flat, block) are still collected before the account is created.
// Whichever way it ends, the session is the same JWT the rest of the app uses,
// so all existing RBAC middleware applies unchanged.

const OAUTH_PENDING_TTL = '20m';

// Bounce the browser back to the SPA with the outcome in the URL fragment
// (fragments aren't sent to the server, so tokens stay out of access logs).
function oauthClientRedirect(res, hashParams) {
  const frag = new URLSearchParams(hashParams).toString();
  res.redirect(`${cfg.APP_BASE_URL}/oauth/callback#${frag}`);
}

// Lets the client render only the buttons for providers that are configured.
router.get('/oauth/providers', (req, res) => {
  res.json(oauth.enabledProviders());
});

router.get('/oauth/:provider/start', (req, res) => {
  const { provider } = req.params;
  if (!oauth.SUPPORTED.includes(provider) || !oauth.isConfigured(provider)) {
    return res.status(404).json({ error: 'That sign-in method is not enabled' });
  }
  res.redirect(oauth.authorizeUrl(provider));
});

async function handleOAuthCallback(req, res) {
  const { provider } = req.params;
  try {
    if (!oauth.SUPPORTED.includes(provider) || !oauth.isConfigured(provider)) {
      throw new Error('That sign-in method is not enabled');
    }
    // Google/Microsoft return via query; Apple posts a form body (form_post).
    const params = req.method === 'POST' ? req.body || {} : req.query || {};
    if (params.error) throw new Error(params.error_description || params.error);

    const state = oauth.consumeState(params.state);
    if (!state || state.provider !== provider) {
      throw new Error('Your sign-in session expired. Please try again.');
    }
    if (!params.code) throw new Error('No authorization code was returned');

    const tokens = await oauth.exchangeCode(provider, params.code);
    const claims = await oauth.verifyIdToken(provider, tokens.id_token, state.nonce);
    const identity = oauth.extractIdentity(provider, claims, params);
    if (!identity.sub) throw new Error('Could not read your account identity');
    if (!identity.email) throw new Error('Your account did not share a verified email address');

    // Match an existing account by the provider identity first, then fall back
    // to a verified email (account linking). Record the identity on first link.
    let user = db
      .prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_sub = ?')
      .get(provider, identity.sub);
    if (!user) {
      const byEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(identity.email);
      if (byEmail) {
        if (!byEmail.oauth_provider) {
          db.prepare('UPDATE users SET oauth_provider = ?, oauth_sub = ? WHERE id = ?').run(
            provider,
            identity.sub,
            byEmail.id
          );
        }
        user = byEmail;
      }
    }

    if (user) {
      if (user.status !== 'approved') {
        return oauthClientRedirect(res, { error: 'Your account is not active. Contact the society office.' });
      }
      return oauthClientRedirect(res, { token: sign(user) });
    }

    // Brand-new account — collect the mandatory profile fields first. The signed
    // token carries the verified identity so it can't be tampered with.
    const pending = jwt.sign(
      { purpose: 'oauth_signup', provider, sub: identity.sub, email: identity.email, name: identity.name },
      cfg.JWT_SECRET,
      { expiresIn: OAUTH_PENDING_TTL }
    );
    return oauthClientRedirect(res, { pending, email: identity.email, name: identity.name });
  } catch (err) {
    console.error(`[oauth] ${provider} callback failed:`, err.message);
    return oauthClientRedirect(res, { error: err.message || 'Sign-in failed. Please try again.' });
  }
}

router.get('/oauth/:provider/callback', (req, res) => handleOAuthCallback(req, res));
// Apple posts back with response_mode=form_post; parse that body for this route
// (the global express.json() doesn't handle urlencoded).
router.post('/oauth/:provider/callback', express.urlencoded({ extended: false }), (req, res) =>
  handleOAuthCallback(req, res)
);

// Finish an OAuth signup: verify the pending profile token, enforce the same
// mandatory fields as password signup, create the approved resident, and issue
// the app session. OAuth users get an unusable random password (they sign in
// via the provider); they can set one later via "forgot password" if they want
// phone login too.
router.post('/oauth/complete', (req, res) => {
  const { pending_token, name, phone, block, house_no, resident_status } = req.body || {};
  let claims;
  try {
    claims = jwt.verify(String(pending_token || ''), cfg.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'Your sign-in session expired. Please start again.' });
  }
  if (claims.purpose !== 'oauth_signup') {
    return res.status(400).json({ error: 'Invalid sign-in session' });
  }

  const cleanName = String(name || claims.name || '').trim();
  const cleanPhone = normalizePhone(phone);
  const cleanBlock = normalizeBlock(block);
  const cleanHouseNo = String(house_no || '').trim();
  const cleanStatus = normalizeResidentStatus(resident_status);
  const cleanEmail = normalizeEmail(claims.email);
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
  if (!cleanStatus) return res.status(400).json({ error: 'Select whether you are the Owner or a Resident' });
  if (!cleanBlock) return res.status(400).json({ error: 'Select your block' });
  if (!cleanHouseNo) return res.status(400).json({ error: 'Select your house number' });
  if (!isValidHouseNo(cleanBlock, cleanHouseNo)) {
    return res.status(400).json({ error: 'Select a house number that belongs to your block' });
  }
  if (houseSlotTaken(cleanBlock, cleanHouseNo, cleanStatus)) {
    return res.status(409).json({
      error: `The ${cleanStatus === 'owner' ? 'Owner' : 'Resident'} for ${cleanBlock} ${cleanHouseNo} is already registered.`,
    });
  }
  if (!cleanEmail) return res.status(400).json({ error: 'Missing email from sign-in. Please start again.' });

  let user;
  try {
    user = db.transaction(() => {
      if (db.prepare('SELECT id FROM users WHERE oauth_provider = ? AND oauth_sub = ?').get(claims.provider, claims.sub)) {
        const e = new Error('This account has already been set up. Please sign in.');
        e.status = 409;
        throw e;
      }
      if (db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone)) {
        const e = new Error('An account with this phone number already exists');
        e.status = 409;
        throw e;
      }
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
        const e = new Error('An account with this email already exists');
        e.status = 409;
        throw e;
      }
      // The house slot may have been claimed while the profile step was open.
      if (houseSlotTaken(cleanBlock, cleanHouseNo, cleanStatus)) {
        const e = new Error(
          `The ${cleanStatus === 'owner' ? 'Owner' : 'Resident'} for ${cleanBlock} ${cleanHouseNo} is already registered.`
        );
        e.status = 409;
        throw e;
      }
      const placeholderPassword = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
      const info = db
        .prepare(
          `INSERT INTO users (name, phone, email, password_hash, flat_no, block, house_no, resident_status, role, status, oauth_provider, oauth_sub)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'resident', 'approved', ?, ?)`
        )
        .run(cleanName, cleanPhone, cleanEmail, placeholderPassword, cleanHouseNo, cleanBlock, cleanHouseNo, cleanStatus, claims.provider, claims.sub);
      return db
        .prepare('SELECT id, name, phone, username, email, flat_no, block, house_no, resident_status, role, role_detail, status FROM users WHERE id = ?')
        .get(info.lastInsertRowid);
    })();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Could not create your account' });
  }

  notifyAdminsNewResident(user).catch((e) => console.error('[notify] admin notification failed:', e.message));
  res.status(201).json({ token: sign(user), user });
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
  logAudit({ actor: user, action: 'login', detail: 'phone login' });
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
  // The hidden committee login serves username-based office-bearer and admin
  // accounts (super admin uses phone login).
  const user = uname
    ? db.prepare("SELECT * FROM users WHERE username = ? AND role IN ('office_bearer','admin')").get(uname)
    : null;
  const ok = bcrypt.compareSync(password || '', user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || user.status !== 'approved') {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  obLimiter.clear(req.ip);
  logAudit({ actor: user, action: 'login', detail: 'committee (username) login' });
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
    .prepare('SELECT id, name, phone, username, email, flat_no, block, house_no, resident_status, role, role_detail, status FROM users WHERE id = ?')
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
  logAudit({ actor: { id: row.user_id }, action: 'password_reset', targetType: 'user', targetId: row.user_id, detail: 'via reset link' });
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
  logAudit({ actor: req.user, action: 'password_change', detail: 'self-service' });
  res.json({ message: 'Password updated' });
});

module.exports = router;
