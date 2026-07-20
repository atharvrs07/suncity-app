const fs = require('fs');
const path = require('path');
const cfg = require('../config');

// Single source of truth for the block → house-number mapping is the
// project-root block-house-numbers.json. The server reads it here (and the
// client fetches the same data via GET /api/meta/house-numbers), so the list
// is never duplicated in code.
let HOUSE_NUMBERS = {};
try {
  HOUSE_NUMBERS = JSON.parse(fs.readFileSync(path.join(cfg.ROOT, 'block-house-numbers.json'), 'utf8'));
} catch (err) {
  console.error('[house-numbers] Failed to load block-house-numbers.json:', err.message);
  HOUSE_NUMBERS = {};
}

function houseNumbersForBlock(block) {
  return HOUSE_NUMBERS[block] || [];
}

// A house number is valid only if it belongs to the given block's list.
function isValidHouseNo(block, houseNo) {
  return houseNumbersForBlock(block).includes(String(houseNo == null ? '' : houseNo).trim());
}

module.exports = { HOUSE_NUMBERS, houseNumbersForBlock, isValidHouseNo };
