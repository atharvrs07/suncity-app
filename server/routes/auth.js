const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const cfg = require('../config');
const { sign, authRequired } = require('../middleware/auth');

const router = express.Router();

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

router.post('/signup', (req, res) => {
  const { name, phone, password, flat_no, role, role_detail } = req.body || {};
  const cleanPhone = normalizePhone(phone);
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!cfg.ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  let detail = null;
  if (role === 'office_bearer') {
    if (!cfg.OFFICE_BEARER_ROLES.includes(role_detail)) {
      return res.status(400).json({ error: 'Select which office bearer role you are signing up for' });
    }
    detail = role_detail;
  } else if (role === 'supervisor') {
    if (!cfg.SUPERVISOR_ROLES.includes(role_detail)) {
      return res.status(400).json({ error: 'Select Maintenance or Cleaning supervisor' });
    }
    detail = role_detail;
  }

  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone)) {
    return res.status(409).json({ error: 'An account with this phone number already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (name, phone, password_hash, flat_no, role, role_detail, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')"
  ).run(name.trim(), cleanPhone, hash, flat_no ? String(flat_no).trim() : null, role, detail);

  res.status(201).json({ message: 'Signup received. You can log in once an admin approves your account.' });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normalizePhone(phone));
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect phone number or password' });
  }
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Your account is still awaiting admin approval' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Your signup was rejected. Contact the society office.' });
  }
  const { password_hash, ...safe } = user;
  res.json({ token: sign(user), user: safe });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', authRequired, (req, res) => {
  const { name, flat_no } = req.body || {};
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
  db.prepare('UPDATE users SET name = COALESCE(?, name), flat_no = COALESCE(?, flat_no) WHERE id = ?').run(
    name !== undefined ? String(name).trim() : null,
    flat_no !== undefined ? String(flat_no).trim() : null,
    req.user.id
  );
  const user = db
    .prepare('SELECT id, name, phone, flat_no, role, role_detail, status FROM users WHERE id = ?')
    .get(req.user.id);
  res.json({ user });
});

router.post('/change-password', authRequired, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password || '', row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ message: 'Password updated' });
});

module.exports = router;
