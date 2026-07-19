const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();
// Classifieds are visible to admins and office bearers only.
router.use(authRequired, requireRoles('admin', 'office_bearer'));

router.get('/', (req, res) => {
  const classifieds = db
    .prepare(
      `SELECT c.*, u.name AS poster_name, u.role AS poster_role, u.role_detail AS poster_role_detail
       FROM classifieds c JOIN users u ON u.id = c.posted_by
       ORDER BY c.active DESC, c.created_at DESC`
    )
    .all();
  res.json({ classifieds });
});

router.post('/', (req, res) => {
  const { title, description, category, contact_info } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
  const info = db
    .prepare('INSERT INTO classifieds (title, description, category, contact_info, posted_by) VALUES (?, ?, ?, ?, ?)')
    .run(
      title.trim(),
      description.trim(),
      category ? String(category).trim() : null,
      contact_info ? String(contact_info).trim() : null,
      req.user.id
    );
  res.status(201).json({ id: info.lastInsertRowid, message: 'Listing posted' });
});

function ownedOr403(req, res) {
  const listing = db.prepare('SELECT * FROM classifieds WHERE id = ?').get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return null;
  }
  if (req.user.role !== 'admin' && listing.posted_by !== req.user.id) {
    res.status(403).json({ error: 'You can only manage your own listings' });
    return null;
  }
  return listing;
}

router.patch('/:id/toggle', (req, res) => {
  const listing = ownedOr403(req, res);
  if (!listing) return;
  db.prepare('UPDATE classifieds SET active = ? WHERE id = ?').run(listing.active ? 0 : 1, listing.id);
  res.json({ message: listing.active ? 'Listing deactivated' : 'Listing reactivated' });
});

router.delete('/:id', (req, res) => {
  const listing = ownedOr403(req, res);
  if (!listing) return;
  db.prepare('DELETE FROM classifieds WHERE id = ?').run(listing.id);
  res.json({ message: 'Listing deleted' });
});

module.exports = router;
