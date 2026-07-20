// Server-side OAuth 2.0 / OpenID Connect helper for Google, Microsoft (Entra
// ID), and Apple. We run the Authorization Code flow entirely on the server:
// the browser is redirected to the provider, the provider redirects back to
// /api/auth/oauth/:provider/callback, and here we exchange the code, verify the
// returned ID token (signature via the provider's JWKS + iss/aud/exp/nonce),
// and return a normalized identity to the route. All client secrets stay
// server-side and no provider SDK is needed in the browser.
//
// The ID token is verified with Node's built-in crypto (JWK → public key) plus
// jsonwebtoken — the same library the rest of the app already uses — so this
// adds no new npm dependencies. Requires Node 18+ (global fetch, JWK key import).

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cfg = require('../config');

const SUPPORTED = ['google', 'microsoft', 'apple'];

const redirectUri = (provider) => `${cfg.APP_BASE_URL}/api/auth/oauth/${provider}/callback`;

// Resolve the endpoints/params for a provider (Microsoft's are tenant-scoped).
function meta(provider) {
  const c = cfg.OAUTH[provider];
  if (!c) return null;
  if (provider === 'google') {
    return {
      clientId: c.clientId,
      clientSecret: c.clientSecret,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      issuer: 'https://accounts.google.com',
      scope: 'openid email profile',
      responseMode: 'query',
      extraAuthParams: { access_type: 'online', prompt: 'select_account' },
    };
  }
  if (provider === 'microsoft') {
    const tenant = c.tenant || 'common';
    return {
      clientId: c.clientId,
      clientSecret: c.clientSecret,
      tenant,
      authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      jwksUrl: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      issuer: null, // validated dynamically against the token's tenant id (tid)
      scope: 'openid email profile',
      responseMode: 'query',
      extraAuthParams: { prompt: 'select_account' },
    };
  }
  if (provider === 'apple') {
    return {
      clientId: c.clientId, // the Services ID
      authorizeUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuer: 'https://appleid.apple.com',
      scope: 'name email',
      responseMode: 'form_post', // required by Apple when the email scope is requested
      extraAuthParams: {},
    };
  }
  return null;
}

function isConfigured(provider) {
  const c = cfg.OAUTH[provider];
  if (!c) return false;
  if (provider === 'apple') return !!(c.clientId && c.teamId && c.keyId && c.privateKey);
  return !!(c.clientId && c.clientSecret);
}

function enabledProviders() {
  const out = {};
  for (const p of SUPPORTED) out[p] = isConfigured(p);
  return out;
}

// ---- CSRF state + OIDC nonce store ----
// In-memory, keyed by the opaque `state` we send to the provider. This matches
// the app's other in-memory stores (rate limiters) and is fine for the
// single-process deployment; entries are one-time-use and expire in 10 minutes.
const stateStore = new Map(); // state -> { provider, nonce, expiresAt }
const STATE_TTL_MS = 10 * 60 * 1000;

function createState(provider) {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, { provider, nonce, expiresAt: Date.now() + STATE_TTL_MS });
  return { state, nonce };
}

function consumeState(state) {
  const entry = stateStore.get(String(state || ''));
  if (!entry) return null;
  stateStore.delete(String(state));
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of stateStore) if (v.expiresAt < now) stateStore.delete(k);
}, 5 * 60 * 1000).unref();

// ---- authorize URL (start of the flow) ----
function authorizeUrl(provider) {
  const m = meta(provider);
  const { state, nonce } = createState(provider);
  const params = new URLSearchParams({
    client_id: m.clientId,
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: m.scope,
    state,
    nonce,
    ...m.extraAuthParams,
  });
  if (m.responseMode === 'form_post') params.set('response_mode', 'form_post');
  return `${m.authorizeUrl}?${params.toString()}`;
}

// Apple's "client secret" is not a static string — it's a short-lived ES256 JWT
// signed with the account's .p8 private key.
function appleClientSecret() {
  const c = cfg.OAUTH.apple;
  return jwt.sign({}, c.privateKey, {
    algorithm: 'ES256',
    keyid: c.keyId,
    issuer: c.teamId,
    audience: 'https://appleid.apple.com',
    subject: c.clientId,
    expiresIn: '5m',
  });
}

// ---- authorization code → tokens ----
async function exchangeCode(provider, code) {
  const m = meta(provider);
  const clientSecret = provider === 'apple' ? appleClientSecret() : m.clientSecret;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(provider),
    client_id: m.clientId,
    client_secret: clientSecret,
  });
  const resp = await fetch(m.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error_description || data.error || `Token exchange failed (${resp.status})`);
  }
  if (!data.id_token) throw new Error('Provider did not return an ID token');
  return data;
}

// ---- JWKS cache + ID token verification ----
const jwksCache = new Map(); // provider -> { keys, fetchedAt }
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(provider, force) {
  const cached = jwksCache.get(provider);
  if (!force && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const m = meta(provider);
  const resp = await fetch(m.jwksUrl, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Could not fetch signing keys (${resp.status})`);
  const data = await resp.json();
  const keys = data.keys || [];
  jwksCache.set(provider, { keys, fetchedAt: Date.now() });
  return keys;
}

async function verifyIdToken(provider, idToken, nonce) {
  const m = meta(provider);
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) throw new Error('Malformed ID token');

  let keys = await getJwks(provider);
  let jwk = keys.find((k) => k.kid === decoded.header.kid);
  if (!jwk) {
    // Signing keys rotate — refresh once before giving up.
    keys = await getJwks(provider, true);
    jwk = keys.find((k) => k.kid === decoded.header.kid);
  }
  if (!jwk) throw new Error('No matching signing key for this token');

  const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verifyOpts = { algorithms: [jwk.alg || 'RS256'], audience: m.clientId };
  if (m.issuer) verifyOpts.issuer = m.issuer;
  const payload = jwt.verify(idToken, pubKey, verifyOpts);

  // Microsoft 'common' issues tokens whose iss embeds the user's tenant id, so
  // validate it against the token's own tid rather than a fixed issuer.
  if (provider === 'microsoft') {
    const expected = `https://login.microsoftonline.com/${payload.tid}/v2.0`;
    if (!payload.tid || payload.iss !== expected) throw new Error('Untrusted token issuer');
  }
  if (nonce && payload.nonce !== nonce) throw new Error('Nonce mismatch');
  return payload;
}

// Normalize the claims (+ Apple's first-login form_post body) into a single
// identity shape: { sub, email, name }. email is lowercased, or null when the
// provider did not supply a *verified* address.
function extractIdentity(provider, payload, params) {
  const sub = payload.sub;
  let email = payload.email;
  let name = payload.name;

  if (provider === 'google') {
    if (payload.email_verified === false || payload.email_verified === 'false') email = null;
  }
  if (provider === 'microsoft') {
    email = email || payload.preferred_username;
  }
  if (provider === 'apple') {
    // Apple sends the display name only on the very first authorization, in the
    // form_post `user` field (JSON). The email is a verified claim in the token.
    if (payload.email_verified === false || payload.email_verified === 'false') email = null;
    if (params && params.user) {
      try {
        const u = typeof params.user === 'string' ? JSON.parse(params.user) : params.user;
        if (u && u.name) {
          const full = [u.name.firstName, u.name.lastName].filter(Boolean).join(' ').trim();
          if (full) name = full;
        }
      } catch {
        /* ignore malformed user blob */
      }
    }
  }

  return {
    sub,
    email: email ? String(email).trim().toLowerCase() : null,
    name: name ? String(name).trim() : '',
  };
}

module.exports = {
  SUPPORTED,
  isConfigured,
  enabledProviders,
  authorizeUrl,
  consumeState,
  exchangeCode,
  verifyIdToken,
  extractIdentity,
  redirectUri,
};
