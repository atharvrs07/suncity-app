// Idempotent seeding of the 12 known office-bearer accounts (username + password
// login, status approved — these are known onboardings, not open signups).
//
// This runs automatically at boot (see server/index.js) so a fresh database is
// never left without the office-bearer logins — important on hosts where there
// is no shell to run the seed script by hand. It only ever CREATES missing
// accounts (matched by username); existing ones, including any whose password
// was later changed, are left untouched.
//
// Newly-generated credentials are written to a file inside DATA_DIR, which is a
// persistent directory that survives redeploys, so an operator without shell
// access can still retrieve them via the host's File Manager.
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const db = require('../db');
const { genPassword } = require('./passwords');

const CREDS_FILE = path.join(cfg.DATA_DIR, 'office-bearer-credentials.txt');

const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Create any missing office-bearer accounts. Returns the list of newly created
// { title, username, password } (password is the plaintext, shown once).
function ensureOfficeBearers() {
  const insert = db.prepare(
    `INSERT INTO users (name, username, password_hash, role, role_detail, status)
     VALUES (?, ?, ?, 'office_bearer', ?, 'approved')`
  );
  const created = [];
  for (const title of cfg.OFFICE_BEARER_ROLES) {
    const username = slug(title);
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) continue;
    const password = genPassword(12);
    insert.run(title, username, bcrypt.hashSync(password, 10), title);
    created.push({ title, username, password });
  }
  return created;
}

// Human-readable credentials block for the console / creds file.
function formatCreds(created) {
  const pad = (s, n) => s.padEnd(n);
  let out = `Office bearer credentials — generated ${new Date().toISOString()}\n`;
  out += `Login at /ob/login (this URL is intentionally not linked anywhere in the app)\n\n`;
  out += `${pad('TITLE', 30)}${pad('USERNAME', 30)}PASSWORD\n`;
  out += `${'-'.repeat(78)}\n`;
  for (const c of created) out += `${pad(c.title, 30)}${pad(c.username, 30)}${c.password}\n`;
  return out;
}

// Append the credentials block to the persistent creds file. Returns its path.
function writeCredsFile(text) {
  fs.appendFileSync(CREDS_FILE, text + '\n', 'utf8');
  return CREDS_FILE;
}

module.exports = { ensureOfficeBearers, formatCreds, writeCredsFile, CREDS_FILE, slug };
