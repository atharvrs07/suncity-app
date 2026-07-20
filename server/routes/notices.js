const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requirePermission, isAdmin } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const where = isAdmin(req.user) ? '1=1' : 'n.admin_only = 0';
  const notices = db
    .prepare(
      `SELECT n.*, u.name AS poster_name, u.role AS poster_role, u.role_detail AS poster_role_detail
       FROM notices n JOIN users u ON u.id = n.posted_by
       WHERE ${where}
       ORDER BY n.pinned DESC, n.created_at DESC`
    )
    .all();
  res.json({ notices, can_post: isAdmin(req.user) || (req.user.role === 'office_bearer' && req.user.permissions.includes('manage_notices')) });
});

router.post('/', requirePermission('manage_notices'), (req, res) => {
  const { title, body, category, pinned, admin_only } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'Notice body is required' });
  const cat = cfg.NOTICE_CATEGORIES.includes(category) ? category : 'general';
  const adminOnly = isAdmin(req.user) && admin_only ? 1 : 0;
  const info = db
    .prepare('INSERT INTO notices (title, body, category, pinned, admin_only, posted_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(title.trim(), body.trim(), cat, pinned ? 1 : 0, adminOnly, req.user.id);
  logAudit({ actor: req.user, action: 'notice_post', targetType: 'notice', targetId: info.lastInsertRowid, detail: title.trim() });
  res.status(201).json({ id: info.lastInsertRowid, message: 'Notice posted' });
});

router.patch('/:id/pin', requirePermission('manage_notices'), (req, res) => {
  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  if (!isAdmin(req.user) && notice.posted_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only pin your own notices' });
  }
  db.prepare('UPDATE notices SET pinned = ? WHERE id = ?').run(notice.pinned ? 0 : 1, notice.id);
  res.json({ message: notice.pinned ? 'Unpinned' : 'Pinned' });
});

router.delete('/:id', requirePermission('manage_notices'), (req, res) => {
  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  if (!isAdmin(req.user) && notice.posted_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own notices' });
  }
  db.prepare('DELETE FROM notices WHERE id = ?').run(notice.id);
  logAudit({ actor: req.user, action: 'notice_delete', targetType: 'notice', targetId: notice.id, detail: notice.title });
  res.json({ message: 'Notice deleted' });
});

module.exports = router;
