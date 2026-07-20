const dns = require('dns').promises;
const disposableDomains = require('disposable-email-domains');

// O(1) lookups against the maintained disposable/temp-mail domain list.
// The list ships as an npm package so it can be refreshed with `npm update`.
const DISPOSABLE = new Set(disposableDomains.map((d) => d.toLowerCase()));

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
// resolves false; genuine transient DNS server errors are surfaced as a thrown
// error so the caller can distinguish "can't receive mail" from "couldn't check".
async function hasMxRecords(email) {
  const domain = domainOf(email);
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch (err) {
    // No such domain / no MX data → the domain cannot receive mail.
    if (err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'NXDOMAIN')) {
      return false;
    }
    throw err; // transient resolver problem — let the caller decide
  }
}

module.exports = { isDisposableEmail, hasMxRecords, domainOf };
