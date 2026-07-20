const express = require('express');
const cfg = require('../config');
const { HOUSE_NUMBERS } = require('../lib/houseNumbers');

const router = express.Router();

// Public (pre-auth) reference data the signup form needs: the society's blocks
// and the house numbers within each. Sourced from block-house-numbers.json so
// the client never hardcodes a duplicate list.
router.get('/house-numbers', (req, res) => {
  res.json({ blocks: cfg.BLOCKS, houseNumbers: HOUSE_NUMBERS });
});

module.exports = router;
