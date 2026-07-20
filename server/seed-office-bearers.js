// One-time seed of the 12 known office-bearer accounts (username + password
// login, status approved — these are known onboardings, not open signups).
// Run with: node server/seed-office-bearers.js
// Prints credentials and writes them to office-bearer-credentials.txt (git-ignored).
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const db = require('./db');
const { genPassword } = require('./lib/passwords');

const CREDS_FILE = path.join(cfg.ROOT, 'office-bearer-credentials.txt');

const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const insert = db.prepare(
  `INSERT INTO users (name, username, password_hash, role, role_detail, status)
   VALUES (?, ?, ?, 'office_bearer', ?, 'approved')`
);

const created = [];
const skipped = [];
for (const title of cfg.OFFICE_BEARER_ROLES) {
  const username = slug(title);
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    skipped.push(username);
    continue;
  }
  const password = genPassword(12);
  insert.run(title, username, bcrypt.hashSync(password, 10), title);
  created.push({ title, username, password });
}

if (skipped.length > 0) {
  console.log(`Skipped (already seeded): ${skipped.join(', ')}\n`);
}

if (created.length === 0) {
  console.log('Nothing to do — all office-bearer accounts already exist.');
  process.exit(0);
}

const pad = (s, n) => s.padEnd(n);
let out = `Office bearer credentials — generated ${new Date().toISOString()}\n`;
out += `Login at /ob/login (this URL is intentionally not linked anywhere in the app)\n\n`;
out += `${pad('TITLE', 30)}${pad('USERNAME', 30)}PASSWORD\n`;
out += `${'-'.repeat(78)}\n`;
for (const c of created) {
  out += `${pad(c.title, 30)}${pad(c.username, 30)}${c.password}\n`;
}

console.log(out);
fs.appendFileSync(CREDS_FILE, out + '\n', 'utf8');
console.log(`Saved to ${CREDS_FILE} (git-ignored — do NOT commit or share).`);
console.log('Office bearers can change their password later under Settings.');
