const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { runAutomation } = require('../cron');

const router = express.Router();
router.use(authRequired, requireRoles('admin'));

router.get('/', (req, res) => {
  const automations = db.prepare('SELECT * FROM due_automations ORDER BY created_at DESC').all();
  res.json({ automations });
});

function validateBody(body) {
  const { name, amount, trigger_day, window_days } = body || {};
  const amt = Number(amount);
  const day = Number(trigger_day);
  const win = Number(window_days);
  if (!name || !name.trim()) return 'Name is required';
  if (!Number.isFinite(amt) || amt <= 0) return 'Enter a valid amount';
  if (!Number.isInteger(day) || day < 1 || day > 31) return 'Trigger day must be 1-31';
  if (!Number.isInteger(win) || win < 1 || win > 90) return 'Payment window must be 1-90 days';
  return null;
}

router.post('/', (req, res) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, amount, trigger_day, window_days, active } = req.body;
  const info = db
    .prepare('INSERT INTO due_automations (name, amount, trigger_day, window_days, active) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), Number(amount), Number(trigger_day), Number(window_days), active === false ? 0 : 1);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Automation created' });
});

router.patch('/:id', (req, res) => {
  const automation = db.prepare('SELECT * FROM due_automations WHERE id = ?').get(req.params.id);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });
  const merged = { ...automation, ...req.body };
  const err = validateBody(merged);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE due_automations SET name = ?, amount = ?, trigger_day = ?, window_days = ?, active = ? WHERE id = ?').run(
    String(merged.name).trim(),
    Number(merged.amount),
    Number(merged.trigger_day),
    Number(merged.window_days),
    merged.active ? 1 : 0,
    automation.id
  );
  res.json({ message: 'Automation updated' });
});

router.delete('/:id', (req, res) => {
  const automation = db.prepare('SELECT * FROM due_automations WHERE id = ?').get(req.params.id);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });
  db.prepare('DELETE FROM due_automations WHERE id = ?').run(automation.id);
  res.json({ message: 'Automation deleted' });
});

router.post('/:id/run', (req, res) => {
  const automation = db.prepare('SELECT * FROM due_automations WHERE id = ?').get(req.params.id);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });
  const created = runAutomation(automation);
  res.json({ message: created > 0 ? `Created ${created} due(s)` : 'No new dues created (already generated for this period)' });
});

module.exports = router;
