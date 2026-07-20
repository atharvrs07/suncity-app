// Central activity-log writer. Every account/security-relevant action funnels
// through logAudit so the super admin and admins have one reviewable trail.
// Actor identity is snapshotted (name + role) so the entry stays meaningful even
// after the actor is renamed or deleted. Writing to the log must never break the
// request that triggered it, so failures are swallowed (and mirrored to console).
const db = require('../db');

const insert = db.prepare(
  `INSERT INTO audit_log (actor_id, actor_name, actor_role, action, target_type, target_id, detail)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// actor may be a full req.user, a { id, name, role } shape, or null (system).
function logAudit({ actor, action, targetType = null, targetId = null, detail = null } = {}) {
  try {
    insert.run(
      actor ? actor.id : null,
      actor ? actor.name || null : 'system',
      actor ? actor.role || null : 'system',
      action,
      targetType,
      targetId != null ? Number(targetId) : null,
      detail == null ? null : String(detail)
    );
  } catch (err) {
    console.error('[audit] failed to record entry:', err.message);
  }
  // Keep a console mirror so host log viewers still show the event.
  const who = actor ? `${actor.name || 'user'} (#${actor.id}, ${actor.role})` : 'system';
  console.log(`[audit] ${who} — ${action}${detail ? ` — ${detail}` : ''}`);
}

module.exports = { logAudit };
