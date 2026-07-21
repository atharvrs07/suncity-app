// In-app notification fan-out. Every "post" or status change that residents
// should hear about funnels through here, writing one notifications row per
// recipient. The navbar bell (client) polls GET /api/notifications for the
// unread count + history. Writes never throw into the caller's request.
//
// Why in-app rather than OS-level Web Push: the app currently ships no service
// worker and no configured push service (VAPID/FCM), and it runs as an installed
// PWA across iOS/Android/desktop where reliable background push needs per-platform
// setup. In-app notifications work everywhere today with zero external config; a
// Web Push transport can be added later behind this same helper without touching
// call sites. See CONTEXT.md.
const db = require('../db');

const insert = db.prepare(
  'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)'
);

// Recipients = every approved account, optionally excluding one user (usually the
// actor who triggered the event, so people aren't notified about their own post).
function notifyAll({ type = 'general', title, body = null, link = null, excludeUserId = null } = {}) {
  try {
    const recipients = db
      .prepare("SELECT id FROM users WHERE status = 'approved'" + (excludeUserId ? ' AND id != ?' : ''))
      .all(...(excludeUserId ? [excludeUserId] : []));
    const tx = db.transaction(() => {
      for (const r of recipients) insert.run(r.id, type, title, body, link);
    });
    tx();
    return recipients.length;
  } catch (err) {
    console.error('[notify] notifyAll failed:', err.message);
    return 0;
  }
}

// Notify a specific set of user ids (deduped, skips falsy/duplicate ids).
function notifyUsers(userIds, { type = 'general', title, body = null, link = null } = {}) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    const tx = db.transaction(() => {
      for (const id of ids) insert.run(id, type, title, body, link);
    });
    tx();
    return ids.length;
  } catch (err) {
    console.error('[notify] notifyUsers failed:', err.message);
    return 0;
  }
}

// Notify everyone holding any of the given roles (approved only). `roleDetail`
// optionally narrows supervisors to 'cleaning' | 'maintenance'.
function notifyRoles(roles, opts = {}) {
  try {
    const list = Array.isArray(roles) ? roles : [roles];
    if (list.length === 0) return 0;
    const placeholders = list.map(() => '?').join(',');
    const extra = opts.roleDetail ? ' AND role_detail = ?' : '';
    const rows = db
      .prepare(`SELECT id FROM users WHERE status = 'approved' AND role IN (${placeholders})${extra}`)
      .all(...list, ...(opts.roleDetail ? [opts.roleDetail] : []));
    return notifyUsers(rows.map((r) => r.id), opts);
  } catch (err) {
    console.error('[notify] notifyRoles failed:', err.message);
    return 0;
  }
}

module.exports = { notifyAll, notifyUsers, notifyRoles };
