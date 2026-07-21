// Thin accessor over the app_settings key/value table. Admin-settable values
// (payment VPA, QR image, payee name) live here so they can be changed from the
// Control Panel without a redeploy. Defaults are seeded in db.js from env.
const db = require('../db');

const getStmt = db.prepare('SELECT value FROM app_settings WHERE key = ?');
const setStmt = db.prepare(
  `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
);

function getSetting(key, fallback = null) {
  const row = getStmt.get(key);
  return row && row.value != null ? row.value : fallback;
}

function setSetting(key, value) {
  setStmt.run(key, value == null ? '' : String(value));
}

// The payment-related settings surfaced to the client (Dues / Home QR block).
function paymentConfig() {
  return {
    vpa: getSetting('upi_vpa', ''),
    payee_name: getSetting('upi_payee', ''),
    qr_image: getSetting('payment_qr_image', '') || null,
  };
}

module.exports = { getSetting, setSetting, paymentConfig };
