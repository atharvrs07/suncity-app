const dns = require('dns').promises;
const disposableDomains = require('disposable-email-domains');

// O(1) lookups against the maintained disposable/temp-mail domain list.
// The list ships as an npm package so it can be refreshed with `npm update`.
const DISPOSABLE = new Set(disposableDomains.map((d) => d.toLowerCase()));

// How long we'll wait for a DNS MX answer before giving up. Kept short so a
// blocked or slow resolver can't stall a signup request — on timeout we treat
// the domain as "couldn't verify" (a thrown error) rather than hanging.
const MX_LOOKUP_TIMEOUT_MS = 5000;

// Resolver error codes that mean the domain *provably* cannot receive mail, as
// opposed to a transient / blocked-resolver problem we're in no position to judge.
const NO_MAIL_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

function domainOf(email) {
  const at = String(email || '').lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

function isDisposableEmail(email) {
  const domain = domainOf(email);
  return !!domain && DISPOSABLE.has(domain);
}

// Resolves true only if the email's domain publishes at least one MX record —
// i.e. it is actually capable of receiving mail. A missing domain / no records
// resolves false. Anything else (DNS timeout, blocked egress, resolver failure)
// is surfaced as a thrown error so the caller can distinguish "can't receive
// mail" from "couldn't check" and fail open rather than blocking every signup.
async function hasMxRecords(email, timeoutMs = MX_LOOKUP_TIMEOUT_MS) {
  const domain = domainOf(email);
  if (!domain) return false;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`MX lookup for "${domain}" timed out after ${timeoutMs}ms`);
      err.code = 'ETIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    const records = await Promise.race([dns.resolveMx(domain), timeout]);
    return Array.isArray(records) && records.length > 0;
  } catch (err) {
    // No such domain / no MX data → the domain cannot receive mail.
    if (err && NO_MAIL_CODES.has(err.code)) {
      return false;
    }
    throw err; // transient / blocked resolver — let the caller decide
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isDisposableEmail, hasMxRecords, domainOf, MX_LOOKUP_TIMEOUT_MS };
