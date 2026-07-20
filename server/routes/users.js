const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requireRoles } = require('../middleware/auth');
const { genPassword } = require('../lib/passwords');
const { isValidHouseNo } = require('../lib/houseNumbers');

const router = express.Router();
router.use(authRequired, requireRoles('admin'));

// Small normalizers mirroring auth.js (kept local so this admin-only module
// stays self-contained). Phone/email are UNIQUE, so edits re-check uniqueness.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}
function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e || null;
}
function normalizeBlock(block) {
  const b = String(block || '').trim();
  return cfg.BLOCKS.includes(b) ? b : null;
}

router.get('/', (req, res) => {
  const users = db
    .prepare('SELECT id, name, phone, username, email, flat_no, block, house_no, role, role_detail, status, created_at FROM users ORDER BY created_at DESC')
    .all();
  res.json({ users });
});

// Admin reset for any account (residents, office bearers, admins — self
// included). Generates a fresh random password, returned exactly once in the
// response for the admin to pass on; only the bcrypt hash is stored.
router.post('/:id/reset-password', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const password = genPassword(12);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), target.id);
    // Outstanding self-service reset links stop working once an admin resets.
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(target.id);
  })();
  console.log(
    `[audit] Admin ${req.user.name} (#${req.user.id}) reset the password of ${target.name} (#${target.id}, ${target.role})`
  );
  res.json({ password, message: `New password generated for ${target.name}. Share it with them securely.` });
});

// Admin edit of any account's personal details. Every field is optional — only
// the keys present in the body are touched — so the same endpoint serves partial
// updates. phone/email uniqueness and block/house validity are re-checked, and
// an optional new password can be set in the same call. Everything is validated
// up front, then applied in one transaction so a bad field never half-updates.
router.patch('/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { name, phone, email, block, house_no, password } = req.body || {};
  const updates = {};

  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) return res.status(400).json({ error: 'Name cannot be empty' });
    updates.name = clean;
  }

  if (phone !== undefined) {
    const clean = normalizePhone(phone);
    if (clean && clean.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
    // Don't strip the only login credential from a phone-login account.
    if (!clean && !target.username) return res.status(400).json({ error: 'Phone number is required for this account' });
    if (clean && db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(clean, target.id)) {
      return res.status(409).json({ error: 'An account with this phone number already exists' });
    }
    updates.phone = clean || null;
  }

  if (email !== undefined) {
    const clean = normalizeEmail(email); // may be null to clear the email
    if (clean && !EMAIL_RE.test(clean)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (clean && db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(clean, target.id)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    updates.email = clean;
  }

  // Block and house number move together and must stay a valid pair; changing
  // either one re-validates against block-house-numbers.json. flat_no mirrors
  // house_no so the app's existing flat displays keep working.
  if (block !== undefined || house_no !== undefined) {
    const nextBlock = normalizeBlock(block !== undefined ? block : target.block);
    const nextHouse = String((house_no !== undefined ? house_no : target.house_no) || '').trim();
    if (!nextBlock) return res.status(400).json({ error: 'Select a valid block' });
    if (!nextHouse) return res.status(400).json({ error: 'Select a house number' });
    if (!isValidHouseNo(nextBlock, nextHouse)) {
      return res.status(400).json({ error: 'Select a house number that belongs to the block' });
    }
    updates.block = nextBlock;
    updates.house_no = nextHouse;
    updates.flat_no = nextHouse;
  }

  let newHash = null;
  if (password !== undefined && String(password) !== '') {
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    newHash = bcrypt.hashSync(String(password), 10);
  }

  if (Object.keys(updates).length === 0 && !newHash) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  db.transaction(() => {
    if (Object.keys(updates).length > 0) {
      const cols = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${cols} WHERE id = ?`).run(...Object.values(updates), target.id);
    }
    if (newHash) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, target.id);
      // Any outstanding self-service reset links stop working once admin sets one.
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(target.id);
    }
  })();

  if (newHash) {
    console.log(`[audit] Admin ${req.user.name} (#${req.user.id}) set a new password for ${target.name} (#${target.id})`);
  }
  const user = db
    .prepare('SELECT id, name, phone, username, email, flat_no, block, house_no, role, role_detail, status, created_at FROM users WHERE id = ?')
    .get(target.id);
  res.json({ user, message: 'Account updated' });
});

// Delete a resident account and everything it owns (complaints, dues + their
// payments/extensions, lost & found posts, reset tokens) in one transaction.
// Restricted to residents on purpose: office-bearer/admin/supervisor accounts
// are provisioned outside signup and must not be removable from this screen.
router.delete('/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (target.role !== 'resident') return res.status(400).json({ error: 'Only resident accounts can be deleted here' });

  db.transaction(() => {
    // Children of the resident's dues first (FK: payments/extensions → dues).
    db.prepare('DELETE FROM payments WHERE user_id = ? OR due_id IN (SELECT id FROM dues WHERE user_id = ?)').run(target.id, target.id);
    db.prepare('DELETE FROM due_extensions WHERE user_id = ? OR due_id IN (SELECT id FROM dues WHERE user_id = ?)').run(target.id, target.id);
    db.prepare('DELETE FROM dues WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM complaints WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM lost_found WHERE posted_by = ?').run(target.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  })();

  console.log(`[audit] Admin ${req.user.name} (#${req.user.id}) deleted resident ${target.name} (#${target.id})`);
  res.json({ message: `${target.name}'s account has been deleted` });
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own status' });
  if (target.role === 'admin' && status === 'rejected') {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin' AND status='approved' AND id != ?").get(target.id);
    if (c === 0) return res.status(400).json({ error: 'Cannot disable the only approved admin' });
  }
  db.prepare('UPDATE users SET status = ?, approved_by = ? WHERE id = ?').run(status, req.user.id, target.id);
  res.json({ message: 'Updated' });
});

module.exports = router;
