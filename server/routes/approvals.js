const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requireRoles('admin'));

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
  db.prepare("UPDATE users SET status = 'approved', approved_by = ? WHERE id = ?").run(req.user.id, target.id);
  res.json({ message: `${target.name} approved` });
});

router.post('/:id/reject', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot reject your own account' });
  if (target.status !== 'pending') return res.status(400).json({ error: 'This account is not pending' });
  db.prepare("UPDATE users SET status = 'rejected', approved_by = ? WHERE id = ?").run(req.user.id, target.id);
  res.json({ message: `${target.name} rejected` });
});

module.exports = router;
