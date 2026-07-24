const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { authRequired, requirePermission } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');
const { localDateStr } = require('../lib/dates');
const { paymentConfig } = require('../lib/settings');
const { notifyUsers } = require('../lib/notify');
const gemini = require('../lib/gemini');
const { sendPaymentReceiptEmail } = require('../lib/mailer');
const upload = require('../lib/uploads');

const router = express.Router();
router.use(authRequired);

// Dues administration is grantable to office bearers via the manage_dues
// permission (admins and the super admin always pass).
const canManageDues = requirePermission('manage_dues');

const SOCIETY_NAME = 'SunCity Vistaar - Jan Kalyan Samiti';

// Latest payment for a due — includes the AI-check fields so both the resident
// and admin UIs can show what state the payment is in (item 22).
const LATEST_PAYMENT = `(
  SELECT json_object(
    'id', p.id, 'utr_reference', p.utr_reference, 'status', p.status, 'created_at', p.created_at,
    'screenshot', p.screenshot, 'txn_id', p.txn_id, 'txn_datetime', p.txn_datetime,
    'ai_verdict', p.ai_verdict, 'ai_reason', p.ai_reason,
    'provisional_receipt_at', p.provisional_receipt_at, 'receipt_at', p.receipt_at,
    'allocations', (
      SELECT json_group_array(json_object('period_label', dd.period_label, 'amount', pa.amount))
      FROM payment_allocations pa JOIN dues dd ON dd.id = pa.due_id
      WHERE pa.payment_id = p.id ORDER BY dd.due_date ASC, dd.id ASC
    )
  )
  FROM payments p WHERE p.due_id = d.id ORDER BY p.created_at DESC, p.id DESC LIMIT 1
)`;

const EXTENSION_DAYS_USED = `(
  SELECT COALESCE(SUM(e.days_requested), 0) FROM due_extensions e
  WHERE e.due_id = d.id AND e.status IN ('pending', 'approved')
)`;

// Payment config (VPA + payee + optional QR image) — admin-settable (item 21).
router.get('/upi-config', (req, res) => {
  res.json(paymentConfig());
});

router.get('/mine', (req, res) => {
  const dues = db
    .prepare(
      `SELECT d.*, ${LATEST_PAYMENT} AS latest_payment, ${EXTENSION_DAYS_USED} AS extension_days_used
       FROM dues d WHERE d.user_id = ?
       ORDER BY CASE d.status WHEN 'overdue' THEN 0 WHEN 'pending' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END, d.due_date DESC`
    )
    .all(req.user.id)
    .map((d) => ({ ...d, latest_payment: d.latest_payment ? JSON.parse(d.latest_payment) : null }));
  res.json({ dues });
});

// ---- Oldest-first payment allocation ----
// A submitted payment is mapped against the resident's outstanding dues, oldest
// first: the earliest unpaid due is filled, then the next, until the payment
// amount is exhausted (the last touched due may be left partially paid). Each
// (payment, due) slice is recorded in payment_allocations — the source of truth
// for the itemized receipt and for rollback if the payment is later rejected.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// The amount that drives allocation: the amount the AI read off the screenshot
// (what was actually paid), falling back to the opened due's billed amount when
// the screenshot amount is missing/unparseable.
function allocationAmount(aiAmount, dueAmount) {
  const a = Number(aiAmount);
  return Number.isFinite(a) && a > 0 ? round2(a) : round2(dueAmount);
}

function outstandingDuesOldestFirst(userId) {
  return db
    .prepare(
      `SELECT * FROM dues
       WHERE user_id = ? AND status != 'paid' AND amount_paid < amount
       ORDER BY due_date ASC, id ASC`
    )
    .all(userId);
}

// Recompute one due's status from its balance + any in-flight payment. Idempotent
// and always safe to call after allocate / rollback / verify.
//  - fully covered (amount_paid >= amount) → 'paid'
//  - otherwise a submitted payment still allocates to it → 'submitted' (in review)
//  - otherwise date-based: 'overdue' if past due_date, else 'pending'
function recomputeDueStatus(dueId) {
  const due = db.prepare('SELECT id, amount, amount_paid, due_date FROM dues WHERE id = ?').get(dueId);
  if (!due) return;
  let status;
  if (round2(due.amount_paid) >= round2(due.amount) - 0.001) {
    status = 'paid';
  } else {
    const inReview = db
      .prepare(
        "SELECT 1 FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE pa.due_id = ? AND p.status = 'submitted' LIMIT 1"
      )
      .get(dueId);
    status = inReview ? 'submitted' : due.due_date < localDateStr() ? 'overdue' : 'pending';
  }
  db.prepare('UPDATE dues SET status = ? WHERE id = ?').run(status, dueId);
}

// Apply `amount` across the resident's outstanding dues oldest-first, recording a
// payment_allocations row per touched due. Self-contained transaction. Returns
// the applied slices ([{ due, applied }]) for the receipt itemization.
const applyAllocation = db.transaction((paymentId, userId, amount) => {
  let remaining = round2(amount);
  const applied = [];
  for (const due of outstandingDuesOldestFirst(userId)) {
    if (remaining <= 0) break;
    const owed = round2(due.amount - due.amount_paid);
    if (owed <= 0) continue;
    const use = round2(Math.min(owed, remaining));
    db.prepare('UPDATE dues SET amount_paid = amount_paid + ? WHERE id = ?').run(use, due.id);
    db.prepare('INSERT INTO payment_allocations (payment_id, due_id, amount) VALUES (?, ?, ?)').run(paymentId, due.id, use);
    applied.push({ due, applied: use });
    remaining = round2(remaining - use);
  }
  for (const a of applied) recomputeDueStatus(a.due.id);
  return applied;
});

// Undo a payment's allocations (on reject): restore each due's amount_paid, drop
// the allocation rows, and recompute the affected dues' statuses.
const rollbackAllocation = db.transaction((paymentId) => {
  const allocs = db.prepare('SELECT due_id, amount FROM payment_allocations WHERE payment_id = ?').all(paymentId);
  for (const a of allocs) {
    db.prepare('UPDATE dues SET amount_paid = MAX(0, amount_paid - ?) WHERE id = ?').run(a.amount, a.due_id);
  }
  db.prepare('DELETE FROM payment_allocations WHERE payment_id = ?').run(paymentId);
  for (const a of allocs) recomputeDueStatus(a.due_id);
});

// The month/due breakdown a payment was applied to — for receipts and the UI.
function paymentAllocationItems(paymentId) {
  return db
    .prepare(
      `SELECT dd.period_label AS periodLabel, pa.amount AS amount, pa.due_id AS due_id
       FROM payment_allocations pa JOIN dues dd ON dd.id = pa.due_id
       WHERE pa.payment_id = ? ORDER BY dd.due_date ASC, dd.id ASC`
    )
    .all(paymentId);
}

// Build the receipt payload for a verified/provisional payment.
function buildReceipt(payment, due, user) {
  return {
    receiptNo: `SCV-${String(payment.id).padStart(6, '0')}`,
    resident: user ? user.name : '',
    amountValue: Number(due.amount), // single-line fallback when there are no allocation items
    periodLabel: due.period_label,
    txnId: payment.txn_id || payment.utr_reference || null,
    txnDateTime: payment.txn_datetime || null,
    paidOn: localDateStr(),
    society: SOCIETY_NAME,
  };
}

// Send a receipt email (itemized by the dues this payment covered) if the
// resident has an email on file. Returns whether it was attempted so the caller
// can record the timestamp.
function sendReceipt(payment, due, user, provisional) {
  if (!user || !user.email) return false;
  let items = paymentAllocationItems(payment.id);
  if (!items.length) items = [{ periodLabel: due.period_label, amount: Number(due.amount) }];
  sendPaymentReceiptEmail({
    to: user.email,
    name: user.name,
    receipt: buildReceipt(payment, due, user),
    items,
    provisional,
  }).catch((err) => console.error('[receipt] send failed:', err.message));
  return true;
}

// ---- Resident submits a payment (UTR and/or screenshot) ----
// If a screenshot is attached and Gemini is configured, it's analysed: the
// transaction id + date/time + amount are extracted and the id is checked for a
// system-wide duplicate. A duplicate is set aside as its own 'duplicate' status
// (no allocation, no receipt) for admins to investigate. Otherwise, on a passing
// check the paid amount is auto-mapped against the resident's outstanding dues
// oldest-first (partial on the last), and an itemized PROVISIONAL receipt is
// emailed. A suspicious/unreadable result is flagged for manual review. An
// admin/office bearer still does the final manual verification either way.
router.post('/:id/payment', upload.single('screenshot'), async (req, res) => {
  const utrBody = String((req.body && req.body.utr_reference) || '').trim();
  const screenshot = req.file ? `/uploads/${req.file.filename}` : null;
  if (!screenshot && utrBody.length < 6) {
    return res.status(400).json({ error: 'Enter the UTR / transaction reference, or upload a payment screenshot' });
  }
  const due = db.prepare('SELECT * FROM dues WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!due) return res.status(404).json({ error: 'Due not found' });
  if (due.status === 'paid') return res.status(400).json({ error: 'This due is already paid' });
  const pendingPayment = db.prepare("SELECT id FROM payments WHERE due_id = ? AND status = 'submitted'").get(due.id);
  if (pendingPayment) return res.status(400).json({ error: 'A payment for this due is already awaiting verification' });

  // Create the payment row up front (state: Submitted). utr_reference falls back
  // to a placeholder if only a screenshot was given — the AI fills in txn_id.
  const info = db
    .prepare('INSERT INTO payments (due_id, user_id, utr_reference, screenshot) VALUES (?, ?, ?, ?)')
    .run(due.id, req.user.id, utrBody || 'via-screenshot', screenshot);
  const paymentId = info.lastInsertRowid;
  db.prepare("UPDATE dues SET status = 'submitted' WHERE id = ?").run(due.id);

  // System-wide uniqueness: a txn id / UTR used by ANY other payment (any
  // resident, any status) makes this a duplicate.
  const isDuplicateId = (id) =>
    !!id && !!db.prepare('SELECT id FROM payments WHERE id != ? AND (txn_id = ? OR utr_reference = ?)').get(paymentId, id, id);

  // Flag as duplicate: record what we know, do NOT allocate or send a receipt,
  // revert the entry due, and alert dues managers + the resident to investigate.
  const flagDuplicate = ({ txnId, txnDateTime, amountDetected, reason }) => {
    db.prepare(
      `UPDATE payments SET status = 'duplicate', ai_verdict = 'duplicate', ai_reason = ?, ai_checked_at = datetime('now'),
         txn_id = COALESCE(?, txn_id), txn_datetime = COALESCE(?, txn_datetime), amount_detected = COALESCE(?, amount_detected),
         utr_reference = COALESCE(NULLIF(utr_reference, 'via-screenshot'), ?) WHERE id = ?`
    ).run(reason, txnId || null, txnDateTime || null, amountDetected || null, txnId || 'via-screenshot', paymentId);
    recomputeDueStatus(due.id);
    const managers = db
      .prepare("SELECT id FROM users WHERE status = 'approved' AND role IN ('admin','super_admin')")
      .all()
      .map((u) => u.id);
    notifyUsers(managers, {
      type: 'payment',
      title: 'Duplicate payment flagged for review',
      body: `${req.user.name} · ${due.period_label}. ${reason}`.slice(0, 160),
      link: '/dues',
    });
    notifyUsers([req.user.id], {
      type: 'payment',
      title: 'Payment needs review',
      body: `${due.period_label}: this transaction was already recorded. The society office will review it.`,
      link: '/dues',
    });
    logAudit({ actor: req.user, action: 'payment_submit', targetType: 'payment', targetId: paymentId, detail: 'duplicate txn id' });
  };

  // A typed UTR can be duplicate-checked immediately (with or without AI).
  if (isDuplicateId(utrBody)) {
    flagDuplicate({ reason: 'This UTR / transaction reference has already been submitted before.' });
    return res.status(201).json({
      message: 'This transaction appears to have already been submitted. The society office will review it.',
      ai: { verdict: 'duplicate', reason: 'Duplicate transaction reference.' },
    });
  }

  let ai = null;
  if (screenshot && gemini.isConfigured()) {
    try {
      const path = require('path');
      const absPath = path.join(cfg.UPLOADS_DIR, path.basename(screenshot));
      const result = await gemini.analyzePaymentScreenshot({
        imagePath: absPath,
        expectedAmount: due.amount,
        todayISO: localDateStr(),
      });

      const txnId = result.transaction_id || utrBody || null;

      // Duplicate detection on the AI-extracted transaction id (system-wide).
      if (isDuplicateId(txnId)) {
        flagDuplicate({
          txnId,
          txnDateTime: result.datetime || null,
          amountDetected: result.amount || null,
          reason: 'This transaction ID has already been submitted before (possible reused screenshot).',
        });
        return res.status(201).json({
          message: 'This transaction appears to have already been submitted. The society office will review it.',
          ai: { verdict: 'duplicate', reason: 'Duplicate transaction ID.' },
        });
      }

      let verdict = 'suspicious';
      let reason = result.notes || '';
      if (!result.ok) {
        verdict = 'error';
        reason = result.reason || 'The screenshot could not be read clearly.';
      } else if (!result.is_payment_screenshot) {
        verdict = 'suspicious';
        reason = reason || "This doesn't look like a payment confirmation screenshot.";
      } else if (!result.looks_legit) {
        verdict = 'suspicious';
        reason = reason || 'The payment details look inconsistent or possibly edited.';
      } else if (!result.is_recent) {
        verdict = 'suspicious';
        reason = reason || 'The payment date/time does not look recent.';
      } else {
        verdict = 'pass';
      }

      db.prepare(
        `UPDATE payments SET txn_id = ?, txn_datetime = ?, amount_detected = ?, ai_verdict = ?, ai_reason = ?,
           ai_checked_at = datetime('now'), utr_reference = COALESCE(NULLIF(utr_reference, 'via-screenshot'), ?) WHERE id = ?`
      ).run(txnId, result.datetime || null, result.amount || null, verdict, reason, txnId || 'via-screenshot', paymentId);

      ai = { verdict, reason, txn_id: txnId, txn_datetime: result.datetime || null };

      if (verdict === 'pass') {
        // Commit the allocation now (oldest-first) and email the itemized
        // PROVISIONAL receipt. Admin verification later makes it permanent.
        const amount = allocationAmount(result.amount, due.amount);
        const applied = applyAllocation(paymentId, req.user.id, amount);
        recomputeDueStatus(due.id); // the entry due may not be among the touched dues
        const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
        if (sendReceipt(payment, due, req.user, true)) {
          db.prepare("UPDATE payments SET provisional_receipt_at = datetime('now') WHERE id = ?").run(paymentId);
        }
        const total = applied.reduce((s, a) => s + a.applied, 0);
        const covered = applied.map((a) => a.due.period_label).join(', ') || due.period_label;
        notifyUsers([req.user.id], {
          type: 'payment',
          title: 'Payment received — provisional receipt sent',
          body: `₹${total} applied to ${covered}. Awaiting final verification by the society.`.slice(0, 160),
          link: '/dues',
        });
        ai.allocations = applied.map((a) => ({ period_label: a.due.period_label, amount: a.applied }));
      } else {
        // Flag suspicious/unreadable submissions to dues managers (the entry due
        // stays 'submitted' for manual verification).
        const managers = db
          .prepare("SELECT id FROM users WHERE status = 'approved' AND role IN ('admin','super_admin')")
          .all()
          .map((u) => u.id);
        notifyUsers(managers, {
          type: 'payment',
          title: 'Payment screenshot flagged for review',
          body: `${req.user.name} · ${due.period_label}. ${reason}`.slice(0, 160),
          link: '/dues',
        });
      }
      logAudit({ actor: req.user, action: 'payment_submit', targetType: 'payment', targetId: paymentId, detail: `AI: ${verdict}` });
    } catch (err) {
      console.error('[dues] Gemini check failed:', err.message);
      db.prepare("UPDATE payments SET ai_verdict = 'error', ai_reason = ?, ai_checked_at = datetime('now') WHERE id = ?").run(
        'Automated check unavailable — pending manual verification.',
        paymentId
      );
      ai = { verdict: 'error', reason: 'Automated check unavailable — a person will verify it.' };
    }
  } else {
    logAudit({ actor: req.user, action: 'payment_submit', targetType: 'payment', targetId: paymentId, detail: screenshot ? 'screenshot (AI off)' : 'UTR' });
  }

  res.status(201).json({
    message:
      ai && ai.verdict === 'pass'
        ? 'Payment checked — a provisional receipt has been emailed. Awaiting final verification.'
        : ai && (ai.verdict === 'suspicious' || ai.verdict === 'error')
          ? 'Payment submitted. It needs manual verification by the society office.'
          : 'Payment submitted for verification',
    ai,
  });
});

// ---- Admin ----

router.get('/', canManageDues, (req, res) => {
  const { status } = req.query;
  const where = status ? 'd.status = ?' : '1=1';
  const dues = db
    .prepare(
      `SELECT d.*, u.name AS resident_name, u.phone AS resident_phone, u.flat_no AS resident_flat, u.block AS resident_block,
              ${LATEST_PAYMENT} AS latest_payment
       FROM dues d JOIN users u ON u.id = d.user_id
       WHERE ${where} ORDER BY d.due_date DESC, d.id DESC LIMIT 500`
    )
    .all(...(status ? [status] : []))
    .map((d) => ({ ...d, latest_payment: d.latest_payment ? JSON.parse(d.latest_payment) : null }));
  res.json({ dues });
});

// Create a due for one resident or for all residents. For an all-residents due,
// an optional `block_amounts` map ({ "Vaibhav": 1500, ... }) lets each block get
// a different amount for the same cycle (item 19); residents in a block not named
// there fall back to the base `amount`.
router.post('/', canManageDues, (req, res) => {
  const { user_id, all_residents, amount, block_amounts, period_label, due_date } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Enter a valid (default) amount' });
  if (!period_label || !period_label.trim()) return res.status(400).json({ error: 'Period label is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date || '')) return res.status(400).json({ error: 'Pick a due date' });

  // Validate the optional per-block override map.
  const blockMap = {};
  if (block_amounts && typeof block_amounts === 'object') {
    for (const [block, value] of Object.entries(block_amounts)) {
      if (value === '' || value == null) continue;
      if (!cfg.BLOCKS.includes(block)) return res.status(400).json({ error: `Unknown block: ${block}` });
      const v = Number(value);
      if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: `Invalid amount for ${block}` });
      blockMap[block] = v;
    }
  }

  const insert = db.prepare('INSERT INTO dues (user_id, amount, period_label, due_date) VALUES (?, ?, ?, ?)');
  if (all_residents) {
    const residents = db.prepare("SELECT id, block FROM users WHERE role = 'resident' AND status = 'approved'").all();
    const tx = db.transaction(() => {
      for (const r of residents) {
        const rowAmt = r.block && blockMap[r.block] != null ? blockMap[r.block] : amt;
        insert.run(r.id, rowAmt, period_label.trim(), due_date);
      }
    });
    tx();
    const perBlockNote = Object.keys(blockMap).length ? ` · per-block: ${Object.entries(blockMap).map(([b, v]) => `${b} ₹${v}`).join(', ')}` : '';
    logAudit({ actor: req.user, action: 'due_create', detail: `${period_label.trim()} · ₹${amt} default · all residents (${residents.length})${perBlockNote}` });
    // Let residents know a new due was raised (item 4/20).
    notifyUsers(residents.map((r) => r.id), {
      type: 'due',
      title: `New due: ${period_label.trim()}`,
      body: `Due by ${due_date}`,
      link: '/dues',
    });
    return res.status(201).json({ message: `Due created for ${residents.length} resident(s)` });
  }
  const target = db.prepare("SELECT id, block FROM users WHERE id = ? AND status = 'approved'").get(user_id);
  if (!target) return res.status(400).json({ error: 'Pick an approved resident' });
  const rowAmt = target.block && blockMap[target.block] != null ? blockMap[target.block] : amt;
  insert.run(target.id, rowAmt, period_label.trim(), due_date);
  logAudit({ actor: req.user, action: 'due_create', targetType: 'user', targetId: target.id, detail: `${period_label.trim()} · ₹${rowAmt}` });
  notifyUsers([target.id], { type: 'due', title: `New due: ${period_label.trim()}`, body: `Due by ${due_date}`, link: '/dues' });
  res.status(201).json({ message: 'Due created' });
});

router.patch('/:id/mark-paid', canManageDues, (req, res) => {
  const due = db.prepare('SELECT * FROM dues WHERE id = ?').get(req.params.id);
  if (!due) return res.status(404).json({ error: 'Due not found' });
  // Settle the balance too, so amount_paid stays consistent with the status.
  db.prepare("UPDATE dues SET status = 'paid', amount_paid = amount WHERE id = ?").run(due.id);
  res.json({ message: 'Marked as paid' });
});

// Residents who haven't paid yet (item 19). Grouped per resident with their phone
// for the Call CTA. "Unpaid" = any due not in the 'paid' state.
router.get('/unpaid-residents', canManageDues, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.phone, u.flat_no, u.block,
              COUNT(d.id) AS unpaid_count,
              SUM(d.amount - d.amount_paid) AS unpaid_amount,
              SUM(CASE WHEN d.status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count
       FROM dues d JOIN users u ON u.id = d.user_id
       WHERE d.status != 'paid'
       GROUP BY u.id
       ORDER BY overdue_count DESC, unpaid_amount DESC`
    )
    .all();
  res.json({ residents: rows, count: rows.length });
});

// Auto-generated Overdue Watch list (admin only): overdue residents with a
// call CTA on the client and a mark-as-paid action.
router.get('/overdue-watch', canManageDues, (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.id AS due_id, d.amount, d.period_label, d.due_date,
              u.id AS user_id, u.name, u.phone, u.flat_no,
              CAST(julianday(?) - julianday(d.due_date) AS INTEGER) AS days_overdue
       FROM dues d JOIN users u ON u.id = d.user_id
       WHERE d.status = 'overdue'
       ORDER BY d.due_date ASC`
    )
    .all(localDateStr());
  res.json({ overdue: rows });
});

// Payment submissions for admins/OB. `status` filters the queue: 'submitted'
// (default, the verify queue), 'duplicate' (flagged for investigation),
// 'verified', or 'rejected'. Each row carries the itemized allocation breakdown
// so managers see which month(s) it was applied to.
router.get('/payments/list', canManageDues, (req, res) => {
  const status = req.query.status || 'submitted';
  const payments = db
    .prepare(
      `SELECT p.*, d.amount, d.period_label, d.due_date, u.name AS resident_name, u.phone AS resident_phone, u.flat_no AS resident_flat,
              (SELECT json_group_array(json_object('period_label', dd.period_label, 'amount', pa.amount))
               FROM payment_allocations pa JOIN dues dd ON dd.id = pa.due_id
               WHERE pa.payment_id = p.id ORDER BY dd.due_date ASC, dd.id ASC) AS allocations
       FROM payments p JOIN dues d ON d.id = p.due_id JOIN users u ON u.id = p.user_id
       WHERE p.status = ? ORDER BY p.created_at ASC LIMIT 500`
    )
    .all(status)
    .map((p) => ({ ...p, allocations: p.allocations ? JSON.parse(p.allocations) : [] }));
  res.json({ payments });
});

// Manual verification: the human confirmation that issues the FINAL receipt.
// Acts on a 'submitted' payment, or on a 'duplicate' one an admin has
// investigated and decided is genuine (the override). If the payment hasn't been
// allocated yet (manual / AI-off path, or a duplicate being overridden), map it
// oldest-first now, then email the itemized permanent (unwatermarked) receipt.
router.post('/payments/:pid/verify', canManageDues, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.pid);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'submitted' && payment.status !== 'duplicate') {
    return res.status(400).json({ error: 'Payment already reviewed' });
  }
  const due = db.prepare('SELECT * FROM dues WHERE id = ?').get(payment.due_id);
  const resident = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(payment.user_id);

  // Allocate if this payment carries no allocation yet (oldest-first). Amount =
  // AI-detected if present, else the opened due's billed amount.
  const already = db.prepare('SELECT COUNT(*) AS c FROM payment_allocations WHERE payment_id = ?').get(payment.id).c;
  if (!already) {
    applyAllocation(payment.id, payment.user_id, allocationAmount(payment.amount_detected, due.amount));
  }
  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'verified', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(
      req.user.id,
      payment.id
    );
    // Re-settle every due this payment touched now that it's no longer 'submitted'
    // (fully-covered → paid; a partially-covered due returns to pending/overdue for
    // its remaining balance).
    for (const a of db.prepare('SELECT due_id FROM payment_allocations WHERE payment_id = ?').all(payment.id)) {
      recomputeDueStatus(a.due_id);
    }
  });
  tx();

  // Final receipt email + record (itemized by the dues covered).
  const verifiedPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  if (sendReceipt(verifiedPayment, due, resident, false)) {
    db.prepare("UPDATE payments SET receipt_at = datetime('now') WHERE id = ?").run(payment.id);
  }
  const items = paymentAllocationItems(payment.id);
  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0);
  const covered = items.map((it) => it.periodLabel).join(', ') || due.period_label;
  notifyUsers([payment.user_id], {
    type: 'payment',
    title: 'Payment verified — receipt sent',
    body: `₹${total} confirmed by the society office (${covered}).`.slice(0, 160),
    link: '/dues',
  });
  logAudit({ actor: req.user, action: 'payment_verify', targetType: 'payment', targetId: payment.id, detail: `UTR ${payment.utr_reference}` });
  res.json({ message: 'Payment verified — final receipt sent, dues updated' });
});

// Reject a 'submitted' or flagged 'duplicate' payment. Any allocation it made is
// rolled back (dues' amount_paid restored and their statuses recomputed), so the
// resident's outstanding balance returns to exactly what it was.
router.post('/payments/:pid/reject', canManageDues, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.pid);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'submitted' && payment.status !== 'duplicate') {
    return res.status(400).json({ error: 'Payment already reviewed' });
  }
  const due = db.prepare('SELECT * FROM dues WHERE id = ?').get(payment.due_id);
  db.prepare("UPDATE payments SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(
    req.user.id,
    payment.id
  );
  rollbackAllocation(payment.id); // restores amount_paid + recomputes the touched dues
  recomputeDueStatus(payment.due_id); // covers the manual path where the entry due was set 'submitted' but never allocated
  notifyUsers([payment.user_id], {
    type: 'payment',
    title: 'Payment could not be verified',
    body: `${due.period_label}: please re-submit a valid payment.`,
    link: '/dues',
  });
  logAudit({ actor: req.user, action: 'payment_reject', targetType: 'payment', targetId: payment.id, detail: `UTR ${payment.utr_reference}` });
  res.json({ message: 'Payment rejected — resident can resubmit' });
});

module.exports = router;
