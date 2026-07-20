// One-time seed of the 12 known office-bearer accounts (username + password
// login, status approved — these are known onboardings, not open signups).
// Run with: node server/seed-office-bearers.js
//
// This is now optional: the same seeding runs automatically at boot (see
// server/lib/officeBearers.js + server/index.js). The script remains handy for
// running it on demand and printing the generated credentials to the console.
const { ensureOfficeBearers, formatCreds, writeCredsFile, CREDS_FILE } = require('./lib/officeBearers');

const created = ensureOfficeBearers();

if (created.length === 0) {
  console.log('Nothing to do — all office-bearer accounts already exist.');
  process.exit(0);
}

const out = formatCreds(created);
console.log('\n' + out);
writeCredsFile(out);
console.log(`Saved to ${CREDS_FILE} (persistent, host-only — do NOT commit or share).`);
console.log('Office bearers can change their password later under Settings.');
