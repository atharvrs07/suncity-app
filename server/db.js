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
  role TEXT NOT NULL CHECK (role IN ('admin','office_bearer','supervisor','resident')),
  role_detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  photo TEXT,
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
  posted_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo TEXT NOT NULL,
  caption TEXT,
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
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  resends INTEGER NOT NULL DEFAULT 0,
  last_sent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
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

module.exports = db;
module.exports.ensureSeedAdmin = ensureSeedAdmin;
