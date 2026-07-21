const express = require('express');
const { authRequired, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const { getSetting, setSetting, paymentConfig } = require('../lib/settings');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

// Payment settings the whole app can read (Home QR block + Dues page): the UPI
// VPA, payee name and an optional society-provided QR image. Admin-configurable
// so the real values (item 21) drop in without a redeploy.
router.get('/payment', (req, res) => {
  res.json(paymentConfig());
});

// ---- Admin: update payment settings ----
router.patch('/payment', requireRoles('admin'), (req, res) => {
  const { vpa, payee_name } = req.body || {};
  if (vpa !== undefined) setSetting('upi_vpa', String(vpa).trim());
  if (payee_name !== undefined) setSetting('upi_payee', String(payee_name).trim());
  logAudit({ actor: req.user, action: 'settings_update', detail: 'payment VPA/payee' });
  res.json({ ...paymentConfig(), message: 'Payment settings updated' });
});

// Upload / replace the society's payment QR image.
router.post('/payment/qr', requireRoles('admin'), upload.single('qr'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pick a QR image to upload' });
  const url = `/uploads/${req.file.filename}`;
  setSetting('payment_qr_image', url);
  logAudit({ actor: req.user, action: 'settings_update', detail: 'payment QR image' });
  res.json({ ...paymentConfig(), message: 'Payment QR updated' });
});

router.delete('/payment/qr', requireRoles('admin'), (req, res) => {
  setSetting('payment_qr_image', '');
  logAudit({ actor: req.user, action: 'settings_update', detail: 'payment QR image cleared' });
  res.json({ ...paymentConfig(), message: 'Payment QR cleared' });
});

module.exports = router;
