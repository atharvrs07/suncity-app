const jwt = require('jsonwebtoken');
const cfg = require('../config');
const db = require('../db');

// Sign a session JWT. `remember` extends the lifetime (Stay-logged-in, item 15);
// `sid` links the token to a user_sessions row so activity can be tracked (item 17).
function sign(user, { remember = false, sid = null } = {}) {
  const payload = { id: user.id, role: user.role };
  if (sid) payload.sid = sid;
  return jwt.sign(payload, cfg.JWT_SECRET, { expiresIn: remember ? '30d' : '7d' });
}

// Open a session activity row at login and return its id (to embed in the JWT).
// Best-effort — never blocks login if the write fails.
function startSession(user, req) {
  try {
    const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 300);
    const info = db.prepare('INSERT INTO user_sessions (user_id, user_agent) VALUES (?, ?)').run(user.id, ua);
    db.prepare(
      "UPDATE users SET last_login_at = datetime('now'), last_active_at = datetime('now'), login_count = login_count + 1 WHERE id = ?"
    ).run(user.id);
    return info.lastInsertRowid;
  } catch (err) {
    console.error('[session] startSession failed:', err.message);
    return null;
  }
}

// Bump last-seen for the user + their session, throttled to once a minute so a
// busy client doesn't hammer the DB on every request.
const bumpActive = db.prepare(
  "UPDATE users SET last_active_at = datetime('now') WHERE id = ? AND (last_active_at IS NULL OR last_active_at < datetime('now','-60 seconds'))"
);
const bumpSession = db.prepare(
  "UPDATE user_sessions SET last_seen_at = datetime('now') WHERE id = ? AND user_id = ? AND last_seen_at < datetime('now','-60 seconds')"
);
function touchActivity(userId, sid) {
  try {
    bumpActive.run(userId);
    if (sid) bumpSession.run(sid, userId);
  } catch {
    /* activity tracking must never break a request */
  }
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
      'SELECT id, name, phone, username, email, flat_no, block, house_no, resident_status, role, role_detail, permissions, avatar, last_active_at, last_login_at, status FROM users WHERE id = ?'
    )
    .get(payload.id);
  if (!user || user.status !== 'approved') {
    return res.status(401).json({ error: 'Account is not active' });
  }
  // Re-fetching + re-parsing on every request means permission/role changes take
  // effect immediately (same guarantee as status-based revocation).
  user.permissions = parsePermissions(user.permissions);
  touchActivity(user.id, payload.sid);
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

module.exports = { sign, startSession, authRequired, requireRoles, requirePermission, hasPermission, isAdmin };
