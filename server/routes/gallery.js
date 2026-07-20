const express = require('express');
const db = require('../db');
const { authRequired, requirePermission, isAdmin } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const photos = db
    .prepare(
      `SELECT g.*, u.name AS uploader_name FROM gallery_photos g JOIN users u ON u.id = g.uploaded_by
       ORDER BY g.created_at DESC`
    )
    .all();
  res.json({ photos, can_post: isAdmin(req.user) || (req.user.role === 'office_bearer' && req.user.permissions.includes('manage_gallery')) });
});

router.post('/', requirePermission('manage_gallery'), upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pick a photo to upload' });
  const caption = req.body && req.body.caption ? String(req.body.caption).trim() : null;
  const info = db
    .prepare('INSERT INTO gallery_photos (photo, caption, uploaded_by) VALUES (?, ?, ?)')
    .run(`/uploads/${req.file.filename}`, caption, req.user.id);
  logAudit({ actor: req.user, action: 'gallery_upload', targetType: 'gallery_photo', targetId: info.lastInsertRowid, detail: caption || null });
  res.status(201).json({ id: info.lastInsertRowid, message: 'Photo added to gallery' });
});

router.delete('/:id', requirePermission('manage_gallery'), (req, res) => {
  const photo = db.prepare('SELECT * FROM gallery_photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  if (!isAdmin(req.user) && photo.uploaded_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own uploads' });
  }
  db.prepare('DELETE FROM gallery_photos WHERE id = ?').run(photo.id);
  logAudit({ actor: req.user, action: 'gallery_delete', targetType: 'gallery_photo', targetId: photo.id });
  res.json({ message: 'Photo removed' });
});

module.exports = router;
