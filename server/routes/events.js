const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const events = db
    .prepare(
      `SELECT e.*, u.name AS poster_name FROM events e JOIN users u ON u.id = e.posted_by
       ORDER BY COALESCE(e.event_date, e.created_at) DESC`
    )
    .all();
  res.json({ events, can_post: ['admin', 'office_bearer'].includes(req.user.role) });
});

router.post('/', requireRoles('admin', 'office_bearer'), upload.single('photo'), (req, res) => {
  const { heading, details, event_date } = req.body || {};
  if (!heading || !heading.trim()) return res.status(400).json({ error: 'Event heading is required' });
  if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return res.status(400).json({ error: 'Invalid event date' });
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const info = db
    .prepare('INSERT INTO events (heading, details, photo, event_date, posted_by) VALUES (?, ?, ?, ?, ?)')
    .run(heading.trim(), details ? String(details).trim() : null, photo, event_date || null, req.user.id);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Event posted' });
});

router.delete('/:id', requireRoles('admin', 'office_bearer'), (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (req.user.role !== 'admin' && event.posted_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own events' });
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
  res.json({ message: 'Event deleted' });
});

module.exports = router;
