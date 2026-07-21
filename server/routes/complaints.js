const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { authRequired, isAdmin, hasPermission } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const { notifyRoles, notifyUsers } = require('../lib/notify');
const { catLabel } = require('../lib/complaintLabels');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

const cleaningPlaceholders = cfg.CLEANING_CATEGORIES.map(() => '?').join(',');

// Which supervisor a complaint routes to (item 8): park/drainage/road-garbage →
// the cleaning supervisor, everything else → maintenance. This mirrors the
// category-visibility scope so the complaint lands in the right queue, and is
// stored on the row (assigned_role) for clarity + notification.
function routeFor(category) {
  return cfg.CLEANING_CATEGORIES.includes(category) ? 'cleaning' : 'maintenance';
}

// Who can view/action every complaint (subject to a supervisor's category
// scope): admins, the super admin, and office bearers granted manage_complaints.
function canManage(user) {
  return isAdmin(user) || user.role === 'supervisor' || hasPermission(user, 'manage_complaints');
}

// Category visibility per role: admin/super_admin and office bearers with
// manage_complaints see everything; cleaning supervisor sees ONLY cleaning
// categories; maintenance supervisor sees everything EXCEPT them; everyone else
// (residents, and office bearers without the permission) sees only their own.
function scopeFor(user) {
  if (isAdmin(user) || hasPermission(user, 'manage_complaints')) return { sql: '1=1', params: [] };
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
      `SELECT c.*, u.name AS resident_name, u.flat_no AS resident_flat, u.phone AS resident_phone, u.avatar AS resident_avatar
       FROM complaints c JOIN users u ON u.id = c.user_id
       WHERE ${scope.sql}
       ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END, c.created_at DESC`
    )
    .all(...scope.params);
  res.json({ complaints: rows, can_manage: canManage(req.user) });
});

router.post('/', upload.single('photo'), (req, res) => {
  const { category, title, description } = req.body || {};
  // New complaints may only use the current (non-retired) categories — item 1.
  if (!cfg.COMPLAINT_CATEGORY_OPTIONS.includes(category)) return res.status(400).json({ error: 'Pick a valid category' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const assignedRole = routeFor(category); // 'cleaning' | 'maintenance' (item 8)
  const info = db
    .prepare('INSERT INTO complaints (user_id, category, title, description, photo, assigned_role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, category, title.trim(), description.trim(), photo, assignedRole);

  // Route to the correct supervisor's queue (they already see it via category
  // scope) and ping them + the admins so it surfaces immediately (item 4/8).
  const label = catLabel(category);
  notifyRoles(['supervisor'], {
    roleDetail: assignedRole,
    type: 'complaint',
    title: `New ${assignedRole} complaint: ${title.trim()}`,
    body: `${label} — from ${req.user.name}${req.user.flat_no ? ` (${req.user.flat_no})` : ''}`,
    link: '/complaints',
  });
  const admins = db
    .prepare("SELECT id FROM users WHERE status = 'approved' AND role IN ('admin','super_admin')")
    .all()
    .map((u) => u.id);
  notifyUsers(admins, {
    type: 'complaint',
    title: `New complaint: ${title.trim()}`,
    body: `${label} — routed to the ${assignedRole} supervisor`,
    link: '/complaints',
  });

  res.status(201).json({ id: info.lastInsertRowid, message: 'Complaint submitted' });
});

router.patch('/:id/status', (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Not allowed' });
  let { status } = req.body || {};
  if (!cfg.COMPLAINT_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
  if (req.user.role === 'supervisor') {
    const isCleaning = cfg.CLEANING_CATEGORIES.includes(complaint.category);
    const allowed = req.user.role_detail === 'cleaning' ? isCleaning : !isCleaning;
    if (!allowed) return res.status(403).json({ error: 'This complaint is outside your category' });
  }
  // Auto-close on resolve (item 9): marking a complaint "Resolved" transitions it
  // straight to "Closed" — no separate manual close step.
  const autoClosed = status === 'resolved';
  if (autoClosed) status = 'closed';
  db.prepare("UPDATE complaints SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, complaint.id);
  logAudit({
    actor: req.user,
    action: 'complaint_status',
    targetType: 'complaint',
    targetId: complaint.id,
    detail: autoClosed ? '→ resolved (auto-closed)' : `→ ${status}`,
  });
  // Keep the resident who filed it informed (item 4).
  const statusText = autoClosed ? 'resolved & closed' : status.replace('_', ' ');
  notifyUsers([complaint.user_id], {
    type: 'complaint',
    title: `Your complaint is now ${statusText}`,
    body: complaint.title,
    link: '/complaints',
  });
  res.json({ message: autoClosed ? 'Marked resolved — complaint closed' : 'Status updated' });
});

module.exports = router;
