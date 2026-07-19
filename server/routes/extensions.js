const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { localDateStr, addDays } = require('../lib/dates');

const router = express.Router();
router.use(authRequired);

const MAX_EXTENSION_DAYS = 5;

function daysUsed(dueId) {
  return db
    .prepare("SELECT COALESCE(SUM(days_requested), 0) AS total FROM due_extensions WHERE due_id = ? AND status IN ('pending','approved')")
    .get(dueId).total;
}

router.post('/', (req, res) => {
  const { due_id, days, reason } = req.body || {};
  const nDays = Number(days);
  if (!Number.isInteger(nDays) || nDays < 1 || nDays > MAX_EXTENSION_DAYS) {
    return res.status(400).json({ error: `Extension must be between 1 and ${MAX_EXTENSION_DAYS} days` });
  }
  const due = db.prepare('SELECT * FROM dues WHERE id = ? AND user_id = ?').get(due_id, req.user.id);
  if (!due) return res.status(404).json({ error: 'Due not found' });
  if (!['pending', 'overdue'].includes(due.status)) {
    return res.status(400).json({ error: 'Extensions can only be requested on pending or overdue dues' });
  }
  const used = daysUsed(due.id);
  if (used + nDays > MAX_EXTENSION_DAYS) {
    return res.status(400).json({
      error: `Only ${MAX_EXTENSION_DAYS - used} extension day(s) left for this due (max ${MAX_EXTENSION_DAYS} total)`,
    });
  }
  db.prepare('INSERT INTO due_extensions (due_id, user_id, days_requested, reason) VALUES (?, ?, ?, ?)').run(
    due.id,
    req.user.id,
    nDays,
    reason ? String(reason).trim() : null
  );
  res.status(201).json({ message: 'Extension requested — waiting for admin approval' });
});

router.get('/mine', (req, res) => {
  const requests = db
    .prepare(
      `SELECT e.*, d.period_label, d.amount, d.due_date FROM due_extensions e
       JOIN dues d ON d.id = e.due_id WHERE e.user_id = ? ORDER BY e.created_at DESC`
    )
    .all(req.user.id);
  res.json({ requests });
});

router.get('/', requireRoles('admin'), (req, res) => {
  const status = req.query.status || 'pending';
  const requests = db
    .prepare(
      `SELECT e.*, d.period_label, d.amount, d.due_date, u.name AS resident_name, u.phone AS resident_phone, u.flat_no AS resident_flat
       FROM due_extensions e JOIN dues d ON d.id = e.due_id JOIN users u ON u.id = e.user_id
       WHERE e.status = ? ORDER BY e.created_at ASC`
    )
    .all(status);
  res.json({ requests });
});

router.post('/:id/approve', requireRoles('admin'), (req, res) => {
  const ext = db.prepare('SELECT * FROM due_extensions WHERE id = ?').get(req.params.id);
  if (!ext) return res.status(404).json({ error: 'Request not found' });
  if (ext.status !== 'pending') return res.status(400).json({ error: 'Request already reviewed' });
  const due = db.prepare('SELECT * FROM dues WHERE id = ?').get(ext.due_id);
  const newDueDate = addDays(due.due_date, ext.days_requested);
  const newStatus = due.status === 'overdue' && newDueDate >= localDateStr() ? 'pending' : due.status;
  const tx = db.transaction(() => {
    db.prepare("UPDATE due_extensions SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(
      req.user.id,
      ext.id
    );
    db.prepare('UPDATE dues SET due_date = ?, status = ? WHERE id = ?').run(newDueDate, newStatus, due.id);
  });
  tx();
  res.json({ message: `Approved — due date moved to ${newDueDate}` });
});

router.post('/:id/reject', requireRoles('admin'), (req, res) => {
  const ext = db.prepare('SELECT * FROM due_extensions WHERE id = ?').get(req.params.id);
  if (!ext) return res.status(404).json({ error: 'Request not found' });
  if (ext.status !== 'pending') return res.status(400).json({ error: 'Request already reviewed' });
  db.prepare("UPDATE due_extensions SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(
    req.user.id,
    ext.id
  );
  res.json({ message: 'Extension rejected' });
});

module.exports = router;
