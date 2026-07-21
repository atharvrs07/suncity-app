const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const { genPassword } = require('../lib/passwords');
const { isValidHouseNo } = require('../lib/houseNumbers');

const router = express.Router();
router.use(authRequired, requireRoles('admin'));

// Roles an admin may assign via the UI. 'super_admin' is deliberately excluded —
// it is the hidden, auto-seeded account and can never be granted from here.
const ASSIGNABLE_ROLES = ['admin', 'office_bearer', 'supervisor', 'resident'];

// Fetch the target account, but treat the super_admin as non-existent to anyone
// who isn't the super_admin — that account stays secret and unmanageable from
// this screen. Sends the 404 itself and returns null when it shields/misses.
function getManageableTarget(req, res) {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target || (target.role === 'super_admin' && req.user.role !== 'super_admin')) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return target;
}

function sanitizePermissions(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  return JSON.stringify(cfg.OFFICE_BEARER_PERMISSIONS.filter((p) => set.has(p)));
}

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
  // The super_admin row is hidden from everyone except the super_admin itself.
  const where = req.user.role === 'super_admin' ? '' : "WHERE role != 'super_admin' ";
  const users = db
    .prepare(
      `SELECT id, name, phone, username, email, flat_no, block, house_no, resident_status, role, role_detail, permissions, status, created_at
       FROM users ${where}ORDER BY created_at DESC`
    )
    .all()
    .map((u) => ({ ...u, permissions: u.permissions ? safeParse(u.permissions) : [] }));
  res.json({ users });
});

function safeParse(json) {
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// Admin reset for any account (residents, office bearers, admins — self
// included). Generates a fresh random password, returned exactly once in the
// response for the admin to pass on; only the bcrypt hash is stored.
router.post('/:id/reset-password', (req, res) => {
  const target = getManageableTarget(req, res);
  if (!target) return;
  const password = genPassword(12);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), target.id);
    // Outstanding self-service reset links stop working once an admin resets.
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(target.id);
  })();
  logAudit({ actor: req.user, action: 'admin_reset_password', targetType: 'user', targetId: target.id, detail: `${target.name} (${target.role})` });
  res.json({ password, message: `New password generated for ${target.name}. Share it with them securely.` });
});

// Admin edit of any account. Every field is optional — only the keys present in
// the body are touched. Personal details (name/phone/email/block+house), the
// account's role (demote/promote), an office bearer's committee post + granted
// permissions, and an optional new password can all be set in one call.
// Everything is validated up front, then applied in one transaction so a bad
// field never half-updates. The super admin is shielded (see getManageableTarget).
router.patch('/:id', (req, res) => {
  const target = getManageableTarget(req, res);
  if (!target) return;

  const { name, phone, email, block, house_no, resident_status, password, role, role_detail, permissions } = req.body || {};
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

  // Block, house number and Owner/Resident status move together for a resident
  // and must stay a valid pair; changing any one re-validates against
  // block-house-numbers.json. flat_no mirrors house_no so the app's existing flat
  // displays keep working. When the (post-edit) account is a resident and a status
  // is present, the house slot is re-checked so an admin can't put two of the same
  // status in one house (the unique index is the atomic backstop either way);
  // the account's own current slot is excluded so an unchanged re-save passes.
  if (block !== undefined || house_no !== undefined || resident_status !== undefined) {
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

    if (resident_status !== undefined) {
      const s = String(resident_status || '').trim().toLowerCase();
      if (s && !cfg.RESIDENT_STATUSES.includes(s)) return res.status(400).json({ error: 'Choose Owner or Resident' });
      updates.resident_status = s || null;
    }
    const nextStatus = updates.resident_status !== undefined ? updates.resident_status : target.resident_status;
    const willBeResident = (role !== undefined ? role : target.role) === 'resident';
    if (willBeResident && nextStatus) {
      const clash = db
        .prepare(
          "SELECT id FROM users WHERE role = 'resident' AND block = ? AND house_no = ? AND resident_status = ? AND id != ?"
        )
        .get(nextBlock, nextHouse, nextStatus, target.id);
      if (clash) {
        return res.status(409).json({
          error: `The ${nextStatus === 'owner' ? 'Owner' : 'Resident'} for ${nextBlock} ${nextHouse} is already registered.`,
        });
      }
    }
  }

  // Role change (demote / promote). super_admin can never be assigned here, and
  // an account can't change its own role. Demoting the last remaining admin is
  // blocked unless the actor is the super admin.
  let effectiveRole = target.role;
  if (role !== undefined && role !== target.role) {
    if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role' });
    if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (target.role === 'admin' && role !== 'admin' && req.user.role !== 'super_admin') {
      const { c } = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin' AND status='approved' AND id != ?").get(target.id);
      if (c === 0) return res.status(400).json({ error: 'Cannot demote the only remaining admin' });
    }
    updates.role = role;
    effectiveRole = role;
  }

  // role_detail + permissions depend on the effective (post-edit) role.
  if (effectiveRole === 'office_bearer') {
    if (role_detail !== undefined || updates.role !== undefined) {
      const detail = String(role_detail !== undefined ? role_detail : target.role_detail || '').trim();
      if (!cfg.OFFICE_BEARER_ROLES.includes(detail)) return res.status(400).json({ error: 'Choose a valid committee post' });
      updates.role_detail = detail;
    }
    if (permissions !== undefined) {
      updates.permissions = sanitizePermissions(permissions);
    } else if (updates.role !== undefined) {
      updates.permissions = target.role === 'office_bearer' ? target.permissions || '[]' : '[]';
    }
  } else if (effectiveRole === 'supervisor') {
    if (role_detail !== undefined || updates.role !== undefined) {
      const detail = String(role_detail !== undefined ? role_detail : target.role_detail || '').trim();
      if (!cfg.SUPERVISOR_ROLES.includes(detail)) return res.status(400).json({ error: 'Choose maintenance or cleaning' });
      updates.role_detail = detail;
    }
    if (updates.role !== undefined) updates.permissions = null;
  } else if (updates.role !== undefined) {
    // Demoted/promoted to admin or resident — no committee post or permissions.
    updates.role_detail = null;
    updates.permissions = null;
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

  const changed = [...Object.keys(updates), ...(newHash ? ['password'] : [])];
  logAudit({
    actor: req.user,
    action: 'user_edit',
    targetType: 'user',
    targetId: target.id,
    detail: `${target.name} — changed: ${changed.join(', ')}`,
  });
  const user = db
    .prepare('SELECT id, name, phone, username, email, flat_no, block, house_no, resident_status, role, role_detail, permissions, status, created_at FROM users WHERE id = ?')
    .get(target.id);
  user.permissions = user.permissions ? safeParse(user.permissions) : [];
  res.json({ user, message: 'Account updated' });
});

// Delete any account (except the super admin, and except your own). The account
// may be a resident, office bearer, supervisor or admin. Society-owned content
// the account posted (notices, events, gallery photos, classifieds) is reassigned
// to the acting admin so it survives, while the account's personal records
// (complaints, dues + their payments/extensions, lost & found posts, reset
// tokens) are removed. All in one transaction so foreign keys stay consistent.
router.delete('/:id', (req, res) => {
  const target = getManageableTarget(req, res);
  if (!target) return;
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  // Never delete the last remaining admin (the super admin can override this).
  if (target.role === 'admin' && req.user.role !== 'super_admin') {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin' AND status='approved' AND id != ?").get(target.id);
    if (c === 0) return res.status(400).json({ error: 'Cannot delete the only remaining admin' });
  }

  db.transaction(() => {
    // Reassign shared/society content to the acting admin so it isn't lost.
    db.prepare('UPDATE notices SET posted_by = ? WHERE posted_by = ?').run(req.user.id, target.id);
    db.prepare('UPDATE events SET posted_by = ? WHERE posted_by = ?').run(req.user.id, target.id);
    db.prepare('UPDATE gallery_photos SET uploaded_by = ? WHERE uploaded_by = ?').run(req.user.id, target.id);
    db.prepare('UPDATE classifieds SET posted_by = ? WHERE posted_by = ?').run(req.user.id, target.id);
    // Delete the account's own records (children of dues first: FK payments/extensions → dues).
    db.prepare('DELETE FROM payments WHERE user_id = ? OR due_id IN (SELECT id FROM dues WHERE user_id = ?)').run(target.id, target.id);
    db.prepare('DELETE FROM due_extensions WHERE user_id = ? OR due_id IN (SELECT id FROM dues WHERE user_id = ?)').run(target.id, target.id);
    db.prepare('DELETE FROM dues WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM complaints WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM lost_found WHERE posted_by = ?').run(target.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  })();

  logAudit({ actor: req.user, action: 'user_delete', targetType: 'user', targetId: target.id, detail: `${target.name} (${target.role})` });
  res.json({ message: `${target.name}'s account has been deleted` });
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const target = getManageableTarget(req, res);
  if (!target) return;
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own status' });
  if (target.role === 'admin' && status === 'rejected' && req.user.role !== 'super_admin') {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin' AND status='approved' AND id != ?").get(target.id);
    if (c === 0) return res.status(400).json({ error: 'Cannot disable the only approved admin' });
  }
  db.prepare('UPDATE users SET status = ?, approved_by = ? WHERE id = ?').run(status, req.user.id, target.id);
  logAudit({ actor: req.user, action: status === 'approved' ? 'user_enable' : 'user_disable', targetType: 'user', targetId: target.id, detail: `${target.name} (${target.role})` });
  res.json({ message: 'Updated' });
});

module.exports = router;
