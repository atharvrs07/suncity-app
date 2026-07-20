const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();
// The activity log is visible to admins and (via the super_admin bypass in
// requireRoles) the super admin.
router.use(authRequired, requireRoles('admin'));

router.get('/', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10) || 200, 1), 500);
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db
        .prepare(
          `SELECT * FROM audit_log
           WHERE actor_name LIKE ? OR actor_role LIKE ? OR action LIKE ? OR detail LIKE ?
           ORDER BY id DESC LIMIT ?`
        )
        .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit)
    : db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ entries: rows });
});

module.exports = router;
