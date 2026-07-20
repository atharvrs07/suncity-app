const jwt = require('jsonwebtoken');
const cfg = require('../config');
const db = require('../db');

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, cfg.JWT_SECRET, { expiresIn: '7d' });
}

// Parse the JSON permissions column into a string array (tolerant of null/garbage).
function parsePermissions(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

// admin and super_admin are the "full authority" roles — everything an admin can
// do, the super admin can too.
function isAdmin(user) {
  return !!user && (user.role === 'admin' || user.role === 'super_admin');
}

// Does this user hold a given office-bearer permission? admins/super_admin
// implicitly hold every permission; office bearers hold only what was granted.
function hasPermission(user, perm) {
  if (isAdmin(user)) return true;
  if (user && user.role === 'office_bearer') {
    return Array.isArray(user.permissions) && user.permissions.includes(perm);
  }
  return false;
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
    .prepare(
      'SELECT id, name, phone, username, email, flat_no, block, house_no, role, role_detail, permissions, status FROM users WHERE id = ?'
    )
    .get(payload.id);
  if (!user || user.status !== 'approved') {
    return res.status(401).json({ error: 'Account is not active' });
  }
  // Re-fetching + re-parsing on every request means permission/role changes take
  // effect immediately (same guarantee as status-based revocation).
  user.permissions = parsePermissions(user.permissions);
  req.user = user;
  next();
}

// Role gate. The super_admin is allowed through every role gate unconditionally
// (it has full authority), so individual routes don't need to name it.
const requireRoles = (...roles) => (req, res, next) => {
  if (req.user.role === 'super_admin') return next();
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
  next();
};

// Permission gate for office-bearer-grantable capabilities. Allows admins,
// the super_admin, and office bearers who hold the named permission.
const requirePermission = (perm) => (req, res, next) => {
  if (hasPermission(req.user, perm)) return next();
  return res.status(403).json({ error: 'Not allowed' });
};

module.exports = { sign, authRequired, requireRoles, requirePermission, hasPermission, isAdmin };
