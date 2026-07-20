const crypto = require('crypto');

// 12-char password with guaranteed letter/digit/symbol mix; ambiguous
// characters (0/O, 1/l/I) excluded since these get typed from paper.
function genPassword(len = 12) {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_+=?';
  const all = letters + digits + symbols;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(letters), pick(digits), pick(symbols)];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { genPassword };
