const express = require('express');
const db = require('../db');
const { authRequired, hasPermission } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

// Moderators (admin/super_admin, or an office bearer granted manage_lostfound)
// may resolve or delete anyone's post; otherwise only the original poster can.
const canModerate = (user) => hasPermission(user, 'manage_lostfound');

router.get('/', (req, res) => {
  const items = db
    .prepare(
      `SELECT l.*, u.name AS poster_name, u.flat_no AS poster_flat
       FROM lost_found l JOIN users u ON u.id = l.posted_by
       ORDER BY CASE l.status WHEN 'active' THEN 0 ELSE 1 END, l.created_at DESC`
    )
    .all();
  res.json({ items });
});

router.post('/', upload.single('photo'), (req, res) => {
  const { type, title, description, location, contact_phone } = req.body || {};
  if (!['lost', 'found'].includes(type)) return res.status(400).json({ error: 'Choose Lost or Found' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Item name is required' });
  if (!description || !String(description).trim()) return res.status(400).json({ error: 'Description is required' });
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const info = db
    .prepare(
      'INSERT INTO lost_found (type, title, description, location, photo, contact_phone, posted_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      type,
      title.trim(),
      description ? String(description).trim() : null,
      location ? String(location).trim() : null,
      photo,
      contact_phone ? String(contact_phone).trim() : req.user.phone,
      req.user.id
    );
  res.status(201).json({ id: info.lastInsertRowid, message: 'Posted to Lost & Found' });
});

router.patch('/:id/resolve', (req, res) => {
  const item = db.prepare('SELECT * FROM lost_found WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!canModerate(req.user) && item.posted_by !== req.user.id) {
    return res.status(403).json({ error: 'Only the poster or a moderator can resolve this' });
  }
  db.prepare("UPDATE lost_found SET status = 'resolved' WHERE id = ?").run(item.id);
  res.json({ message: 'Marked as resolved' });
});

router.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM lost_found WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const moderating = canModerate(req.user) && item.posted_by !== req.user.id;
  if (!canModerate(req.user) && item.posted_by !== req.user.id) {
    return res.status(403).json({ error: 'Only the poster or a moderator can delete this' });
  }
  db.prepare('DELETE FROM lost_found WHERE id = ?').run(item.id);
  if (moderating) {
    logAudit({ actor: req.user, action: 'lostfound_moderate_delete', targetType: 'lost_found', targetId: item.id, detail: item.title });
  }
  res.json({ message: 'Deleted' });
});

module.exports = router;
