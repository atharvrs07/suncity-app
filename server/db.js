const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const cfg = require('./config');

const db = new Database(path.join(cfg.DATA_DIR, 'suncity.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  flat_no TEXT,
  block TEXT,
  house_no TEXT,
  resident_status TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin','admin','office_bearer','supervisor','resident')),
  role_detail TEXT,
  permissions TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by INTEGER,
  oauth_provider TEXT,
  oauth_sub TEXT,
  avatar TEXT,
  last_active_at TEXT,
  last_login_at TEXT,
  login_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  photo TEXT,
  assigned_role TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','maintenance','event','emergency')),
  pinned INTEGER NOT NULL DEFAULT 0,
  admin_only INTEGER NOT NULL DEFAULT 0,
  posted_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS due_automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  block_amounts TEXT,
  trigger_day INTEGER NOT NULL CHECK (trigger_day BETWEEN 1 AND 31),
  window_days INTEGER NOT NULL DEFAULT 10 CHECK (window_days BETWEEN 1 AND 90),
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  period_label TEXT NOT NULL,
  period_key TEXT,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','paid','overdue')),
  automation_id INTEGER REFERENCES due_automations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dues_automation_period
  ON dues (automation_id, user_id, period_key) WHERE automation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  due_id INTEGER NOT NULL REFERENCES dues(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  utr_reference TEXT NOT NULL,
  screenshot TEXT,
  txn_id TEXT,
  txn_datetime TEXT,
  amount_detected TEXT,
  ai_verdict TEXT,
  ai_reason TEXT,
  ai_checked_at TEXT,
  provisional_receipt_at TEXT,
  receipt_at TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','verified','rejected')),
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS due_extensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  due_id INTEGER NOT NULL REFERENCES dues(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  days_requested INTEGER NOT NULL CHECK (days_requested BETWEEN 1 AND 5),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classifieds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  contact_info TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  posted_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lost_found (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('lost','found')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  photo TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  posted_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  heading TEXT NOT NULL,
  details TEXT,
  photo TEXT,
  event_date TEXT,
  event_time TEXT,
  posted_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo TEXT NOT NULL,
  caption TEXT,
  source_event_id INTEGER,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pending resident signups awaiting email OTP verification. The user row is
-- only created once the OTP is confirmed, so this table holds the entered
-- details (password already bcrypt-hashed) plus the SHA-256-hashed code,
-- expiry, and abuse counters. One in-flight signup per email (UNIQUE); a
-- re-signup replaces the previous pending record.
CREATE TABLE IF NOT EXISTS signup_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  flat_no TEXT,
  block TEXT,
  house_no TEXT,
  resident_status TEXT,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  resends INTEGER NOT NULL DEFAULT 0,
  last_sent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only activity log. Records account/security-relevant actions (logins,
-- signups, approvals, edits, deletes, permission changes, payment reviews,
-- content posts/removals) so admins and the super admin can review who did what.
-- actor_* are snapshotted at write time so the row survives the actor's deletion.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);

-- In-app notifications. Every "post" in the app (notice, complaint update,
-- lost & found, event, payment status, etc.) fans out one row per recipient so
-- the navbar bell can show an unread count and a per-user history. (True OS-level
-- Web Push can be layered on later — see server/lib/notify.js.)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read, created_at DESC);

-- Simple admin-settable key/value store (payment VPA, QR image, payee name, …).
-- Seeded from env defaults on boot; the Control Panel can override any value.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lightweight session activity (item 17). One row per login; last_seen_at is
-- bumped (throttled) on each authenticated request whose JWT carries this row's
-- id, giving a "recent sessions + duration" view without a full analytics stack.
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_agent TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions (user_id, last_seen_at DESC);
`);

// Migration for DBs created before office-bearer username login existed:
// phone must become nullable and username added, which SQLite only allows
// via a table rebuild (new table, copy, drop, rename — per SQLite docs).
function migrateUsersUsername() {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  if (cols.some((c) => c.name === 'username')) return;
  console.log('[migrate] Rebuilding users table to add username login support…');
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE,
        username TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        flat_no TEXT,
        role TEXT NOT NULL CHECK (role IN ('admin','office_bearer','supervisor','resident')),
        role_detail TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        approved_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id, name, phone, password_hash, flat_no, role, role_detail, status, approved_by, created_at)
        SELECT id, name, phone, password_hash, flat_no, role, role_detail, status, approved_by, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  })();
  db.pragma('foreign_keys = ON');
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    throw new Error(`users migration left ${violations.length} foreign key violation(s)`);
  }
  console.log('[migrate] users table rebuilt.');
}
migrateUsersUsername();

// Migration for DBs created before the forgot-password flow existed: email is
// a plain nullable column, so a simple ADD COLUMN + unique index suffices
// (SQLite disallows UNIQUE in ADD COLUMN; fresh DBs get it from CREATE TABLE).
function migrateUsersEmail() {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  if (!cols.some((c) => c.name === 'email')) {
    console.log('[migrate] Adding users.email column…');
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL');
}
migrateUsersEmail();

// Migration for DBs created before the resident-block field and OAuth sign-in
// existed. All new columns are plain nullable, so guarded ADD COLUMNs suffice;
// OAuth-identity uniqueness is a partial index (SQLite disallows UNIQUE in
// ADD COLUMN). A user is matched by (oauth_provider, oauth_sub) on return
// visits, so that pair must be unique.
function migrateBlockAndOAuth() {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('block')) {
    console.log('[migrate] Adding users.block column…');
    db.exec('ALTER TABLE users ADD COLUMN block TEXT');
  }
  if (!userCols.includes('oauth_provider')) {
    console.log('[migrate] Adding users.oauth_provider column…');
    db.exec('ALTER TABLE users ADD COLUMN oauth_provider TEXT');
  }
  if (!userCols.includes('oauth_sub')) {
    console.log('[migrate] Adding users.oauth_sub column…');
    db.exec('ALTER TABLE users ADD COLUMN oauth_sub TEXT');
  }
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users (oauth_provider, oauth_sub) WHERE oauth_sub IS NOT NULL'
  );

  const otpCols = db.prepare('PRAGMA table_info(signup_otps)').all().map((c) => c.name);
  if (!otpCols.includes('block')) {
    console.log('[migrate] Adding signup_otps.block column…');
    db.exec('ALTER TABLE signup_otps ADD COLUMN block TEXT');
  }
}
migrateBlockAndOAuth();

// Migration for DBs created before the dependent House No. dropdown existed.
// house_no is a plain nullable column on both the users table and the pending
// signup table, so guarded ADD COLUMNs suffice.
function migrateHouseNo() {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('house_no')) {
    console.log('[migrate] Adding users.house_no column…');
    db.exec('ALTER TABLE users ADD COLUMN house_no TEXT');
  }
  const otpCols = db.prepare('PRAGMA table_info(signup_otps)').all().map((c) => c.name);
  if (!otpCols.includes('house_no')) {
    console.log('[migrate] Adding signup_otps.house_no column…');
    db.exec('ALTER TABLE signup_otps ADD COLUMN house_no TEXT');
  }
}
migrateHouseNo();

// Migration for DBs created before the super_admin role + per-office-bearer
// permissions existed. The role list is baked into a CHECK constraint, which
// SQLite can only change via a table rebuild (new table, copy, drop, rename).
// The rebuild also introduces the nullable `permissions` column. It is guarded
// on the stored CREATE TABLE text so it runs at most once (and not at all on a
// fresh DB, whose base schema already includes both).
function migrateSuperAdminAndPermissions() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (row && row.sql && row.sql.includes('super_admin')) return;
  console.log('[migrate] Rebuilding users table to add super_admin role + permissions…');
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const hasPermissions = cols.includes('permissions');
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        flat_no TEXT,
        block TEXT,
        house_no TEXT,
        role TEXT NOT NULL CHECK (role IN ('super_admin','admin','office_bearer','supervisor','resident')),
        role_detail TEXT,
        permissions TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        approved_by INTEGER,
        oauth_provider TEXT,
        oauth_sub TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id, name, phone, username, email, password_hash, flat_no, block, house_no, role, role_detail, permissions, status, approved_by, oauth_provider, oauth_sub, created_at)
        SELECT id, name, phone, username, email, password_hash, flat_no, block, house_no, role, role_detail,
               ${hasPermissions ? 'permissions' : 'NULL'}, status, approved_by, oauth_provider, oauth_sub, created_at
        FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  })();
  db.pragma('foreign_keys = ON');
  // Recreate the partial unique indexes that lived on the old users table.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users (oauth_provider, oauth_sub) WHERE oauth_sub IS NOT NULL');
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    throw new Error(`users super_admin migration left ${violations.length} foreign key violation(s)`);
  }
  console.log('[migrate] users table rebuilt with super_admin role + permissions.');
}
migrateSuperAdminAndPermissions();

// Migration for DBs created before the Owner/Resident status + one-account-per-
// house-slot lock existed. resident_status is a plain nullable column on both
// the users table and the pending-signup table, so guarded ADD COLUMNs suffice.
// The partial unique index enforces the lock: a given (block, house_no) can hold
// at most one 'owner' resident and one 'resident' resident. NULLs are distinct in
// SQLite indexes, so legacy residents without a status never collide, and the
// index only applies to role='resident' rows (promoting a resident away frees the
// slot automatically). Must run AFTER the super_admin rebuild above, which copies
// an explicit column list that predates resident_status.
function migrateResidentStatus() {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('resident_status')) {
    console.log('[migrate] Adding users.resident_status column…');
    db.exec('ALTER TABLE users ADD COLUMN resident_status TEXT');
  }
  const otpCols = db.prepare('PRAGMA table_info(signup_otps)').all().map((c) => c.name);
  if (!otpCols.includes('resident_status')) {
    console.log('[migrate] Adding signup_otps.resident_status column…');
    db.exec('ALTER TABLE signup_otps ADD COLUMN resident_status TEXT');
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_house_slot
       ON users (block, house_no, resident_status)
       WHERE role = 'resident' AND resident_status IS NOT NULL AND block IS NOT NULL AND house_no IS NOT NULL`
  );
}
migrateResidentStatus();

// Migration for DBs created before the 2026-07 feature batch: profile pictures +
// session-activity columns on users, complaint routing, per-block due amounts,
// and the AI payment-verification columns on payments. All plain nullable
// columns, so guarded ADD COLUMNs suffice (the new tables — notifications,
// app_settings, user_sessions — come from CREATE TABLE IF NOT EXISTS above).
function migrateFeatureBatch2026() {
  const add = (table, col, decl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) {
      console.log(`[migrate] Adding ${table}.${col} column…`);
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${decl}`);
    }
  };
  add('users', 'avatar', 'avatar TEXT');
  add('users', 'last_active_at', 'last_active_at TEXT');
  add('users', 'last_login_at', 'last_login_at TEXT');
  add('users', 'login_count', 'login_count INTEGER NOT NULL DEFAULT 0');
  add('events', 'event_time', 'event_time TEXT'); // optional HH:MM slot (multiple events per date)
  add('complaints', 'assigned_role', 'assigned_role TEXT');
  add('gallery_photos', 'source_event_id', 'source_event_id INTEGER');
  add('due_automations', 'block_amounts', 'block_amounts TEXT');
  add('payments', 'screenshot', 'screenshot TEXT');
  add('payments', 'txn_id', 'txn_id TEXT');
  add('payments', 'txn_datetime', 'txn_datetime TEXT');
  add('payments', 'amount_detected', 'amount_detected TEXT');
  add('payments', 'ai_verdict', 'ai_verdict TEXT');
  add('payments', 'ai_reason', 'ai_reason TEXT');
  add('payments', 'ai_checked_at', 'ai_checked_at TEXT');
  add('payments', 'provisional_receipt_at', 'provisional_receipt_at TEXT');
  add('payments', 'receipt_at', 'receipt_at TEXT');
}
migrateFeatureBatch2026();

// Seed default app settings from env (idempotent — never overwrites a value the
// Control Panel later changed). Payment VPA/payee default from the UPI env vars.
function seedSettings() {
  const upsert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
  upsert.run('upi_vpa', cfg.UPI_VPA);
  upsert.run('upi_payee', cfg.UPI_PAYEE);
  upsert.run('payment_qr_image', cfg.UPI_QR_IMAGE); // bundled signed merchant QR; admin can override in Control Panel
}
seedSettings();

// One-time upgrade of the old placeholder payment settings to the real society
// UPI details. Only touches values still holding a known placeholder / blank, so
// anything an admin deliberately set in the Control Panel is left untouched.
function migratePaymentDefaults() {
  const get = db.prepare('SELECT value FROM app_settings WHERE key = ?');
  const set = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  const upgrade = (key, placeholders, real) => {
    const row = get.get(key);
    const cur = row ? row.value : null;
    if (cur == null || placeholders.includes(cur.trim())) set.run(key, real);
  };
  upgrade('upi_vpa', ['', 'society@upi'], cfg.UPI_VPA);
  upgrade('upi_payee', ['', 'My Suncity Vistaar'], cfg.UPI_PAYEE);
  upgrade('payment_qr_image', [''], cfg.UPI_QR_IMAGE);
}
migratePaymentDefaults();

// The approval chain must never get stuck with zero admins: whenever no
// approved admin exists, create (or promote) the fallback admin from env.
function ensureSeedAdmin() {
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin' AND status='approved'").get();
  if (c > 0) return;
  const seed = cfg.ADMIN_SEED;
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(seed.phone);
  if (existing) {
    db.prepare("UPDATE users SET role='admin', role_detail=NULL, status='approved' WHERE id=?").run(existing.id);
    console.log(`[seed] Promoted ${seed.phone} to approved admin (no approved admin existed).`);
  } else {
    const hash = bcrypt.hashSync(seed.password, 10);
    db.prepare("INSERT INTO users (name, phone, password_hash, role, status) VALUES (?, ?, ?, 'admin', 'approved')")
      .run(seed.name, seed.phone, hash);
    console.log(`[seed] Created fallback admin (phone ${seed.phone}).`);
  }
}
ensureSeedAdmin();

// The hidden super-admin account. Auto-seeded once, idempotently: if a
// super_admin already exists it is left completely untouched (so an owner's
// later password change persists across deploys). Otherwise, an existing
// account matching the seed phone/email is promoted, or a fresh one is created.
// This is the ONLY auto-generated account — everything else is signup + approval.
function ensureSuperAdmin() {
  const seed = cfg.SUPER_ADMIN_SEED;
  const existingSuper = db.prepare("SELECT id FROM users WHERE role = 'super_admin'").get();
  if (existingSuper) return;
  const phone = String(seed.phone || '').replace(/\D/g, '').slice(-10);
  const email = (seed.email || '').trim().toLowerCase() || null;
  const byContact = db.prepare('SELECT id FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?)').get(phone, email);
  if (byContact) {
    db.prepare("UPDATE users SET role = 'super_admin', role_detail = NULL, permissions = NULL, status = 'approved' WHERE id = ?").run(
      byContact.id
    );
    console.log('[seed] Promoted an existing account to the hidden super_admin.');
    return;
  }
  const hash = bcrypt.hashSync(seed.password, 10);
  db.prepare(
    "INSERT INTO users (name, phone, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'super_admin', 'approved')"
  ).run(seed.name, phone, email, hash);
  console.log('[seed] Created the hidden super_admin account (phone login).');
}
ensureSuperAdmin();

module.exports = db;
module.exports.ensureSeedAdmin = ensureSeedAdmin;
module.exports.ensureSuperAdmin = ensureSuperAdmin;
