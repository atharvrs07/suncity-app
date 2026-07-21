const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// The bell: recent notifications (most recent first) + the unread count.
router.get('/', (req, res) => {
  const items = db
    .prepare(
      'SELECT id, type, title, body, link, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50'
    )
    .all(req.user.id);
  const { unread } = db
    .prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read = 0')
    .get(req.user.id);
  res.json({ notifications: items, unread });
});

// Lightweight poll target for just the badge count.
router.get('/unread-count', (req, res) => {
  const { unread } = db
    .prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read = 0')
    .get(req.user.id);
  res.json({ unread });
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id);
  res.json({ message: 'All marked read' });
});

router.post('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'Marked read' });
});

module.exports = router;
