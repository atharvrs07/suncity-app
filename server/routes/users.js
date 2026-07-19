const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requireRoles('admin'));

router.get('/', (req, res) => {
  const users = db
    .prepare('SELECT id, name, phone, flat_no, role, role_detail, status, created_at FROM users ORDER BY created_at DESC')
    .all();
  res.json({ users });
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
