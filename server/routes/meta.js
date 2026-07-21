const express = require('express');
const cfg = require('../config');
const db = require('../db');
const { HOUSE_NUMBERS } = require('../lib/houseNumbers');

const router = express.Router();

// Public (pre-auth) reference data the signup form needs: the society's blocks
// and the house numbers within each. Sourced from block-house-numbers.json so
// the client never hardcodes a duplicate list.
router.get('/house-numbers', (req, res) => {
  res.json({ blocks: cfg.BLOCKS, houseNumbers: HOUSE_NUMBERS });
});

// Which house slots are already registered, so the signup House No. dropdown can
// grey out the taken ones (still shown, just not selectable — see Section 7). A
// house holds at most one Owner and one Resident; this reports which of those two
// slots are filled per house. Mirrors exactly what the (block, house_no,
// resident_status) unique index enforces server-side (any role='resident' row,
// regardless of approval status). Only the occupancy — never any identity — is
// exposed. Not cached client-side, so it reflects the latest registrations.
router.get('/house-occupancy', (req, res) => {
  const rows = db
    .prepare(
      `SELECT block, house_no, resident_status FROM users
         WHERE role = 'resident' AND resident_status IS NOT NULL
           AND block IS NOT NULL AND house_no IS NOT NULL`
    )
    .all();
  const taken = {};
  for (const { block, house_no, resident_status } of rows) {
    if (resident_status !== 'owner' && resident_status !== 'resident') continue;
    (taken[block] || (taken[block] = {}));
    (taken[block][house_no] || (taken[block][house_no] = { owner: false, resident: false }));
    taken[block][house_no][resident_status] = true;
  }
  res.json({ taken });
});

module.exports = router;
