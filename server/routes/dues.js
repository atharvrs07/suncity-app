const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requirePermission } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const { localDateStr } = require('../lib/dates');

const router = express.Router();
router.use(authRequired);

// Dues administration is grantable to office bearers via the manage_dues
// permission (admins and the super admin always pass).
const canManageDues = requirePermission('manage_dues');

const LATEST_PAYMENT = `(
  SELECT json_object('id', p.id, 'utr_reference', p.utr_reference, 'status', p.status, 'created_at', p.created_at)
  FROM payments p WHERE p.due_id = d.id ORDER BY p.created_at DESC, p.id DESC LIMIT 1
)`;

const EXTENSION_DAYS_USED = `(
  SELECT COALESCE(SUM(e.days_requested), 0) FROM due_extensions e
  WHERE e.due_id = d.id AND e.status IN ('pending', 'approved')
)`;

router.get('/upi-config', (req, res) => {
  res.json({ vpa: cfg.UPI_VPA, payee_name: cfg.UPI_PAYEE });
});

router.get('/mine', (req, res) => {
  const dues = db
    .prepare(
      `SELECT d.*, ${LATEST_PAYMENT} AS latest_payment, ${EXTENSION_DAYS_USED} AS extension_days_used
       FROM dues d WHERE d.user_id = ?
       ORDER BY CASE d.status WHEN 'overdue' THEN 0 WHEN 'pending' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END, d.due_date DESC`
    )
    .all(req.user.id)
    .map((d) => ({ ...d, latest_payment: d.latest_payment ? JSON.parse(d.latest_payment) : null }));
  res.json({ dues });
});

router.post('/:id/payment', (req, res) => {
  const { utr_reference } = req.body || {};
  const utr = String(utr_reference || '').trim();
  if (utr.length < 6) return res.status(400).json({ error: 'Enter the UTR / transaction reference from your UPI app' });
  const due = db.prepare('SELECT * FROM dues WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!due) return res.status(404).json({ error: 'Due not found' });
  if (due.status === 'paid') return res.status(400).json({ error: 'This due is already paid' });
  const pendingPayment = db
    .prepare("SELECT id FROM payments WHERE due_id = ? AND status = 'submitted'")
    .get(due.id);
  if (pendingPayment) return res.status(400).json({ error: 'A payment for this due is already awaiting verification' });
  db.prepare('INSERT INTO payments (due_id, user_id, utr_reference) VALUES (?, ?, ?)').run(due.id, req.user.id, utr);
  db.prepare("UPDATE dues SET status = 'submitted' WHERE id = ?").run(due.id);
  res.status(201).json({ message: 'Payment submitted for verification' });
});

// ---- Admin ----

router.get('/', canManageDues, (req, res) => {
  const { status } = req.query;
  const where = status ? 'd.status = ?' : '1=1';
  const dues = db
    .prepare(
      `SELECT d.*, u.name AS resident_name, u.phone AS resident_phone, u.flat_no AS resident_flat,
              ${LATEST_PAYMENT} AS latest_payment
       FROM dues d JOIN users u ON u.id = d.user_id
       WHERE ${where} ORDER BY d.due_date DESC, d.id DESC LIMIT 500`
    )
    .all(...(status ? [status] : []))
    .map((d) => ({ ...d, latest_payment: d.latest_payment ? JSON.parse(d.latest_payment) : null }));
  res.json({ dues });
});

router.post('/', canManageDues, (req, res) => {
  const { user_id, all_residents, amount, period_label, due_date } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  if (!period_label || !period_label.trim()) return res.status(400).json({ error: 'Period label is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date || '')) return res.status(400).json({ error: 'Pick a due date' });

  const insert = db.prepare('INSERT INTO dues (user_id, amount, period_label, due_date) VALUES (?, ?, ?, ?)');
  if (all_residents) {
    const residents = db.prepare("SELECT id FROM users WHERE role = 'resident' AND status = 'approved'").all();
    const tx = db.transaction(() => {
      for (const r of residents) insert.run(r.id, amt, period_label.trim(), due_date);
    });
    tx();
    logAudit({ actor: req.user, action: 'due_create', detail: `${period_label.trim()} · ₹${amt} · all residents (${residents.length})` });
    return res.status(201).json({ message: `Due created for ${residents.length} resident(s)` });
  }
  const target = db.prepare("SELECT id FROM users WHERE id = ? AND status = 'approved'").get(user_id);
  if (!target) return res.status(400).json({ error: 'Pick an approved resident' });
  insert.run(target.id, amt, period_label.trim(), due_date);
  logAudit({ actor: req.user, action: 'due_create', targetType: 'user', targetId: target.id, detail: `${period_label.trim()} · ₹${amt}` });
  res.status(201).json({ message: 'Due created' });
});

router.patch('/:id/mark-paid', canManageDues, (req, res) => {
  const due = db.prepare('SELECT * FROM dues WHERE id = ?').get(req.params.id);
  if (!due) return res.status(404).json({ error: 'Due not found' });
  db.prepare("UPDATE dues SET status = 'paid' WHERE id = ?").run(due.id);
  res.json({ message: 'Marked as paid' });
});

// Auto-generated Overdue Watch list (admin only): overdue residents with a
// call CTA on the client and a mark-as-paid action.
router.get('/overdue-watch', canManageDues, (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.id AS due_id, d.amount, d.period_label, d.due_date,
              u.id AS user_id, u.name, u.phone, u.flat_no,
              CAST(julianday(?) - julianday(d.due_date) AS INTEGER) AS days_overdue
       FROM dues d JOIN users u ON u.id = d.user_id
       WHERE d.status = 'overdue'
       ORDER BY d.due_date ASC`
    )
    .all(localDateStr());
  res.json({ overdue: rows });
});

router.get('/payments/list', canManageDues, (req, res) => {
  const status = req.query.status || 'submitted';
  const payments = db
    .prepare(
      `SELECT p.*, d.amount, d.period_label, d.due_date, u.name AS resident_name, u.phone AS resident_phone, u.flat_no AS resident_flat
       FROM payments p JOIN dues d ON d.id = p.due_id JOIN users u ON u.id = p.user_id
       WHERE p.status = ? ORDER BY p.created_at ASC LIMIT 500`
    )
    .all(status);
  res.json({ payments });
});

router.post('/payments/:pid/verify', canManageDues, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.pid);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'submitted') return res.status(400).json({ error: 'Payment already reviewed' });
  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'verified', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(
      req.user.id,
      payment.id
    );
    db.prepare("UPDATE dues SET status = 'paid' WHERE id = ?").run(payment.due_id);
  });
  tx();
  logAudit({ actor: req.user, action: 'payment_verify', targetType: 'payment', targetId: payment.id, detail: `UTR ${payment.utr_reference}` });
  res.json({ message: 'Payment verified — due marked paid' });
});

router.post('/payments/:pid/reject', canManageDues, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.pid);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'submitted') return res.status(400).json({ error: 'Payment already reviewed' });
  const due = db.prepare('SELECT * FROM dues WHERE id = ?').get(payment.due_id);
  const backTo = due.due_date < localDateStr() ? 'overdue' : 'pending';
  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(
      req.user.id,
      payment.id
    );
    db.prepare('UPDATE dues SET status = ? WHERE id = ?').run(backTo, payment.due_id);
  });
  tx();
  logAudit({ actor: req.user, action: 'payment_reject', targetType: 'payment', targetId: payment.id, detail: `UTR ${payment.utr_reference}` });
  res.json({ message: 'Payment rejected — resident can resubmit' });
});

module.exports = router;
