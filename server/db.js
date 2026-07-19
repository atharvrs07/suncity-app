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
  phone TEXT NOT NULL UNIQUE,
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
`);

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
