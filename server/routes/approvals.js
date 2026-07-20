const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

const router = express.Router();
router.use(authRequired, requireRoles('admin'));

// Keep only the recognised office-bearer permission keys from a client-supplied
// list (deduped). Returns a JSON string ready for the users.permissions column.
function sanitizePermissions(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  const kept = cfg.OFFICE_BEARER_PERMISSIONS.filter((p) => set.has(p));
  return JSON.stringify(kept);
}

router.get('/', (req, res) => {
  const pending = db
    .prepare(
      "SELECT id, name, phone, flat_no, role, role_detail, created_at FROM users WHERE status = 'pending' ORDER BY created_at ASC"
    )
    .all();

  // Which office-bearer / supervisor slots are already held by an approved
  // account, so admins can spot duplicate role claims before approving.
  const filled = db
    .prepare(
      "SELECT role, role_detail, name FROM users WHERE status = 'approved' AND role IN ('office_bearer','supervisor') AND role_detail IS NOT NULL"
    )
    .all();
  const slots = {
    office_bearer: Object.fromEntries(cfg.OFFICE_BEARER_ROLES.map((r) => [r, null])),
    supervisor: Object.fromEntries(cfg.SUPERVISOR_ROLES.map((r) => [r, null])),
  };
  for (const row of filled) {
    if (slots[row.role] && row.role_detail in slots[row.role]) slots[row.role][row.role_detail] = row.name;
  }

  res.json({ pending, slots });
});

router.post('/:id/approve', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot approve your own account' });
  if (target.status !== 'pending') return res.status(400).json({ error: 'This account is not pending' });

  // For office bearers, the admin picks the granted permissions at approval time
  // (checkbox list on the client). Other roles carry no per-user permissions.
  if (target.role === 'office_bearer') {
    const perms = sanitizePermissions(req.body && req.body.permissions);
    db.prepare("UPDATE users SET status = 'approved', approved_by = ?, permissions = ? WHERE id = ?").run(req.user.id, perms, target.id);
    logAudit({
      actor: req.user,
      action: 'approve',
      targetType: 'user',
      targetId: target.id,
      detail: `${target.name} (Office Bearer — ${target.role_detail}) · permissions: ${JSON.parse(perms).join(', ') || 'none'}`,
    });
  } else {
    db.prepare("UPDATE users SET status = 'approved', approved_by = ? WHERE id = ?").run(req.user.id, target.id);
    logAudit({ actor: req.user, action: 'approve', targetType: 'user', targetId: target.id, detail: `${target.name} (${target.role})` });
  }
  res.json({ message: `${target.name} approved` });
});

router.post('/:id/reject', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot reject your own account' });
  if (target.status !== 'pending') return res.status(400).json({ error: 'This account is not pending' });
  db.prepare("UPDATE users SET status = 'rejected', approved_by = ? WHERE id = ?").run(req.user.id, target.id);
  logAudit({ actor: req.user, action: 'reject', targetType: 'user', targetId: target.id, detail: `${target.name} (${target.role})` });
  res.json({ message: `${target.name} rejected` });
});

module.exports = router;
