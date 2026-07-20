// One-time data reset — use to start the app from a clean slate (e.g. before
// launch, to clear test complaints / demo accounts). It operates on whichever
// database DATA_DIR points at, so on the server run it with the SAME DATA_DIR
// the app uses (that's the whole point — see DEPLOYMENT.md).
//
// SAFETY: this is destructive and cannot be undone. It does nothing unless you
// pass --yes; without it you get a dry-run that only prints current row counts.
//
//   node server/reset-data.js                   # dry run: show what exists
//   node server/reset-data.js --yes --complaints-only  # delete ONLY complaints
//   node server/reset-data.js --yes             # wipe all CONTENT, keep accounts
//   node server/reset-data.js --yes --wipe-users       # also delete every account
//
// Keeping accounts (the default) preserves the admin + the 12 office-bearer
// logins and any real residents, and only clears complaints, notices, dues,
// payments, extensions, classifieds, lost & found, events, gallery, and any
// in-flight signup OTPs / password-reset tokens — plus their uploaded images.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const db = require('./db'); // opens the DB at cfg.DATA_DIR and runs migrations

const args = process.argv.slice(2);
const CONFIRM = args.includes('--yes');
const WIPE_USERS = args.includes('--wipe-users');
const COMPLAINTS_ONLY = args.includes('--complaints-only');

// Content tables in FK-safe delete order (children before parents).
const CONTENT_TABLES = [
  'payments',
  'due_extensions',
  'dues',
  'complaints',
  'notices',
  'classifieds',
  'lost_found',
  'events',
  'gallery_photos',
  'signup_otps',
  'password_reset_tokens',
];

function count(table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  } catch {
    return 0;
  }
}

console.log(`\nDatabase: ${path.join(cfg.DATA_DIR, 'suncity.db')}`);
console.log('Current row counts:');
for (const t of CONTENT_TABLES) console.log(`  ${t.padEnd(22)} ${count(t)}`);
console.log(`  ${'users'.padEnd(22)} ${count('users')}`);

if (!CONFIRM) {
  console.log('\nDry run — nothing deleted. Re-run with --yes to actually reset.');
  if (COMPLAINTS_ONLY) console.log('(--complaints-only is set: ONLY complaints would be removed.)');
  else console.log(WIPE_USERS ? '(--wipe-users is set: accounts WOULD be deleted too.)' : '(accounts would be kept.)');
  process.exit(0);
}

// Delete a set of uploaded photos by their stored `/uploads/<file>` paths.
function deletePhotos(photoPaths) {
  let removed = 0;
  for (const rel of photoPaths) {
    if (!rel) continue;
    try {
      const p = path.join(cfg.UPLOADS_DIR, path.basename(rel));
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        fs.unlinkSync(p);
        removed += 1;
      }
    } catch {
      /* ignore individual file errors */
    }
  }
  return removed;
}

// Surgical mode: remove only complaints (and just their own photos), leaving
// every account and all other module data completely untouched.
if (COMPLAINTS_ONLY) {
  const photos = db.prepare("SELECT photo FROM complaints WHERE photo IS NOT NULL AND photo != ''").all().map((r) => r.photo);
  const info = db.prepare('DELETE FROM complaints').run();
  const removed = deletePhotos(photos);
  console.log(`\nRemoved ${info.changes} complaint(s) and ${removed} attached photo(s). Everything else was left untouched.`);
  process.exit(0);
}

db.transaction(() => {
  for (const t of CONTENT_TABLES) db.prepare(`DELETE FROM ${t}`).run();
  if (WIPE_USERS) db.prepare('DELETE FROM users').run();
})();

// Clear orphaned uploaded images (they belonged to the content just removed).
try {
  const files = fs.readdirSync(cfg.UPLOADS_DIR);
  let removed = 0;
  for (const f of files) {
    const p = path.join(cfg.UPLOADS_DIR, f);
    if (fs.statSync(p).isFile()) {
      fs.unlinkSync(p);
      removed += 1;
    }
  }
  console.log(`\nCleared ${removed} uploaded file(s).`);
} catch (err) {
  console.warn(`\nCould not clear uploads dir: ${err.message}`);
}

// If accounts were wiped, immediately restore the fallback admin so the app is
// never left without a way to log in (mirrors normal boot behaviour).
if (WIPE_USERS) {
  db.ensureSeedAdmin();
  console.log('Re-seeded the fallback admin (no approved admin existed after wipe).');
  console.log('Run `node server/seed-office-bearers.js` to recreate the 12 office-bearer logins.');
}

console.log('\nReset complete. Content cleared' + (WIPE_USERS ? ' and all accounts removed.' : ', accounts kept.'));
process.exit(0);
