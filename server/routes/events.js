const express = require('express');
const db = require('../db');
const { authRequired, requirePermission, isAdmin } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const { notifyAll } = require('../lib/notify');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

// HH:MM (24h) time-slot validation — lets multiple events share a date at
// different times (item 12). Empty string / null means no specific time.
function validTime(t) {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

// Mirror an event photo into the Photo Gallery (item 11) so residents can browse
// event photos there without opening each event. Tagged with source_event_id so
// the mirror is idempotent — re-saving the same event photo won't duplicate it.
function mirrorPhotoToGallery(photoUrl, caption, userId, eventId) {
  if (!photoUrl) return;
  try {
    const existing = db
      .prepare('SELECT id FROM gallery_photos WHERE source_event_id = ? AND photo = ?')
      .get(eventId, photoUrl);
    if (existing) return;
    db.prepare(
      'INSERT INTO gallery_photos (photo, caption, uploaded_by, source_event_id) VALUES (?, ?, ?, ?)'
    ).run(photoUrl, caption || null, userId, eventId);
  } catch (err) {
    console.error('[events] gallery mirror failed:', err.message);
  }
}

router.get('/', (req, res) => {
  const events = db
    .prepare(
      `SELECT e.*, u.name AS poster_name, u.avatar AS poster_avatar FROM events e JOIN users u ON u.id = e.posted_by
       ORDER BY COALESCE(e.event_date, e.created_at) DESC`
    )
    .all();
  res.json({ events, can_post: isAdmin(req.user) || (req.user.role === 'office_bearer' && req.user.permissions.includes('manage_events')) });
});

router.post('/', requirePermission('manage_events'), upload.single('photo'), (req, res) => {
  const { heading, details, event_date, event_time } = req.body || {};
  if (!heading || !heading.trim()) return res.status(400).json({ error: 'Event heading is required' });
  if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return res.status(400).json({ error: 'Invalid event date' });
  if (event_time && !validTime(event_time)) return res.status(400).json({ error: 'Invalid event time' });
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const info = db
    .prepare('INSERT INTO events (heading, details, photo, event_date, event_time, posted_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(heading.trim(), details ? String(details).trim() : null, photo, event_date || null, event_time || null, req.user.id);
  mirrorPhotoToGallery(photo, heading.trim(), req.user.id, info.lastInsertRowid);
  logAudit({ actor: req.user, action: 'event_post', targetType: 'event', targetId: info.lastInsertRowid, detail: heading.trim() });
  notifyAll({ type: 'event', title: `New event: ${heading.trim()}`, body: event_date ? `On ${event_date}${event_time ? ` at ${event_time}` : ''}` : null, link: '/events', excludeUserId: req.user.id });
  res.status(201).json({ id: info.lastInsertRowid, message: 'Event posted' });
});

// Edit an event (item 10). The creator (or any admin) can update the heading,
// details, date, and optionally replace the photo. A newly uploaded photo is
// mirrored into the gallery too.
router.patch('/:id', requirePermission('manage_events'), upload.single('photo'), (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!isAdmin(req.user) && event.posted_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own events' });
  }
  const { heading, details, event_date, event_time } = req.body || {};
  const updates = {};
  if (heading !== undefined) {
    if (!String(heading).trim()) return res.status(400).json({ error: 'Event heading is required' });
    updates.heading = String(heading).trim();
  }
  if (details !== undefined) updates.details = String(details).trim() || null;
  if (event_date !== undefined) {
    if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return res.status(400).json({ error: 'Invalid event date' });
    updates.event_date = event_date || null;
  }
  if (event_time !== undefined) {
    if (event_time && !validTime(event_time)) return res.status(400).json({ error: 'Invalid event time' });
    updates.event_time = event_time || null;
  }
  let newPhoto = null;
  if (req.file) {
    newPhoto = `/uploads/${req.file.filename}`;
    updates.photo = newPhoto;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  const cols = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE events SET ${cols} WHERE id = ?`).run(...Object.values(updates), event.id);
  if (newPhoto) mirrorPhotoToGallery(newPhoto, updates.heading || event.heading, req.user.id, event.id);
  logAudit({ actor: req.user, action: 'event_edit', targetType: 'event', targetId: event.id, detail: updates.heading || event.heading });
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
  res.json({ event: updated, message: 'Event updated' });
});

router.delete('/:id', requirePermission('manage_events'), (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!isAdmin(req.user) && event.posted_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own events' });
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
  logAudit({ actor: req.user, action: 'event_delete', targetType: 'event', targetId: event.id, detail: event.heading });
  res.json({ message: 'Event deleted' });
});

module.exports = router;
