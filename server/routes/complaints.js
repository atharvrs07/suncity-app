const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requireRoles } = require('../middleware/auth');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

const MANAGER_ROLES = ['admin', 'office_bearer', 'supervisor'];
const cleaningPlaceholders = cfg.CLEANING_CATEGORIES.map(() => '?').join(',');

// Category visibility per role: cleaning supervisor sees ONLY cleaning
// categories; maintenance supervisor sees everything EXCEPT them.
function scopeFor(user) {
  if (user.role === 'admin' || user.role === 'office_bearer') return { sql: '1=1', params: [] };
  if (user.role === 'supervisor') {
    return user.role_detail === 'cleaning'
      ? { sql: `c.category IN (${cleaningPlaceholders})`, params: cfg.CLEANING_CATEGORIES }
      : { sql: `c.category NOT IN (${cleaningPlaceholders})`, params: cfg.CLEANING_CATEGORIES };
  }
  return { sql: 'c.user_id = ?', params: [user.id] };
}

router.get('/', (req, res) => {
  const scope = scopeFor(req.user);
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS resident_name, u.flat_no AS resident_flat, u.phone AS resident_phone
       FROM complaints c JOIN users u ON u.id = c.user_id
       WHERE ${scope.sql}
       ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END, c.created_at DESC`
    )
    .all(...scope.params);
  res.json({ complaints: rows, can_manage: MANAGER_ROLES.includes(req.user.role) });
});

router.post('/', upload.single('photo'), (req, res) => {
  const { category, title, description } = req.body || {};
  if (!cfg.COMPLAINT_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Pick a valid category' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const info = db
    .prepare('INSERT INTO complaints (user_id, category, title, description, photo) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, category, title.trim(), description.trim(), photo);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Complaint submitted' });
});

router.patch('/:id/status', requireRoles(...MANAGER_ROLES), (req, res) => {
  const { status } = req.body || {};
  if (!cfg.COMPLAINT_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
  if (req.user.role === 'supervisor') {
    const isCleaning = cfg.CLEANING_CATEGORIES.includes(complaint.category);
    const allowed = req.user.role_detail === 'cleaning' ? isCleaning : !isCleaning;
    if (!allowed) return res.status(403).json({ error: 'This complaint is outside your category' });
  }
  db.prepare("UPDATE complaints SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, complaint.id);
  res.json({ message: 'Status updated' });
});

module.exports = router;
