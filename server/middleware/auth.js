const jwt = require('jsonwebtoken');
const cfg = require('../config');
const db = require('../db');

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, cfg.JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  let payload;
  try {
    payload = jwt.verify(token, cfg.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  const user = db
    .prepare('SELECT id, name, phone, username, email, flat_no, role, role_detail, status FROM users WHERE id = ?')
    .get(payload.id);
  if (!user || user.status !== 'approved') {
    return res.status(401).json({ error: 'Account is not active' });
  }
  req.user = user;
  next();
}

const requireRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
  next();
};

module.exports = { sign, authRequired, requireRoles };
