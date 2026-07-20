const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { genPassword } = require('../lib/passwords');

const router = express.Router();
router.use(authRequired, requireRoles('admin'));

router.get('/', (req, res) => {
  const users = db
    .prepare('SELECT id, name, phone, username, email, flat_no, block, role, role_detail, status, created_at FROM users ORDER BY created_at DESC')
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
