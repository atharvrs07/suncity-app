require('dotenv').config();
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// 'super_admin' is the hidden top-level account (auto-seeded, secret, has every
// permission). It is intentionally NOT offered anywhere in signup — see
// ensureSuperAdmin() in db.js.
const ROLES = ['super_admin', 'admin', 'office_bearer', 'supervisor', 'resident'];

// Granular permissions an admin can grant to an office bearer at approval (and
// edit later). admins and the super_admin implicitly have all of them. Keys are
// stored as a JSON array in users.permissions; client/src/constants.js mirrors
// this list with display labels — keep the two in sync.
const OFFICE_BEARER_PERMISSIONS = [
  'manage_notices',
  'manage_events',
  'manage_gallery',
  'manage_classifieds',
  'manage_complaints',
  'manage_dues',
  'manage_lostfound',
];

const OFFICE_BEARER_ROLES = [
  'Chairman',
  'Vice Chairman 1',
  'Vice Chairman 2',
  'Cultural Activities Chairman',
  'Secretary',
  'Treasurer',
  'Member 1',
  'Member 2',
  'Member 3',
  'Member 4',
  'Member 5',
  'Member 6',
];

const SUPERVISOR_ROLES = ['maintenance', 'cleaning'];

// A resident account is either the flat's Owner or its (living-in) Resident.
// A house may hold at most one of each — see the (block, house_no,
// resident_status) unique index in db.js. client/src/constants.js mirrors this
// list with display labels; keep the two in sync.
const RESIDENT_STATUSES = ['owner', 'resident'];

// The canonical list of every complaint category the app has ever used. This
// stays complete so that complaints already filed under a now-retired category
// still render with a proper label (see catMeta on the client). New complaints
// may only be filed under COMPLAINT_CATEGORY_OPTIONS below.
const COMPLAINT_CATEGORIES = [
  'street_light',
  'security',
  'grass_cutting',
  'park_cleaning',
  'drainage_cleaning',
  'road_garbage_pickup',
  'plumbing',
  'electrical',
  'housekeeping',
  'parking',
  'lift',
  'structural',
  'pest_control',
  'other',
];

// Categories retired from the complaint submission form. They remain in
// COMPLAINT_CATEGORIES so historical complaints keep their labels, but the API
// rejects NEW complaints filed under them and the UI no longer offers them.
const REMOVED_COMPLAINT_CATEGORIES = ['parking', 'housekeeping', 'plumbing', 'security'];

// The categories a resident may actually choose when filing a new complaint.
const COMPLAINT_CATEGORY_OPTIONS = COMPLAINT_CATEGORIES.filter(
  (c) => !REMOVED_COMPLAINT_CATEGORIES.includes(c)
);

// Cleaning supervisor scope: road / drainage / park cleaning. Everything else
// routes to the maintenance supervisor. Used both for category visibility and
// to stamp complaints.assigned_role on creation (see routes/complaints.js).
const CLEANING_CATEGORIES = ['park_cleaning', 'drainage_cleaning', 'road_garbage_pickup'];

const NOTICE_CATEGORIES = ['general', 'maintenance', 'event', 'emergency'];

const COMPLAINT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// Society blocks a resident can belong to. Order is intentional (shown as-is in
// the signup dropdown); client/src/constants.js mirrors this list for the UI.
const BLOCKS = [
  'Aastha',
  'Abhilasha',
  'Avantika E',
  'Avantika G',
  'Club Premier',
  'Executive',
  'Royal',
  'Vaibhav',
  'Vatika',
];

// OAuth / OpenID Connect provider credentials. All are read from env and left
// blank by default — a provider with blank credentials is simply "not enabled"
// (no sign-in button, endpoints 404). See server/lib/oauth.js for the flow and
// OAUTH_SETUP.md for what to register in each provider's console.
const OAUTH = {
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  },
  microsoft: {
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET || '',
    // 'common' accepts any Microsoft account; set a tenant GUID to restrict to
    // a single Entra directory.
    tenant: process.env.MICROSOFT_OAUTH_TENANT || 'common',
  },
  apple: {
    clientId: process.env.APPLE_OAUTH_SERVICES_ID || '', // the Services ID acts as the OAuth client_id
    teamId: process.env.APPLE_OAUTH_TEAM_ID || '',
    keyId: process.env.APPLE_OAUTH_KEY_ID || '',
    // Contents of the .p8 private key. Env files often store the newlines
    // escaped as literal "\n"; normalize them back to real newlines here.
    privateKey: (process.env.APPLE_OAUTH_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
};

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOADS_DIR,
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  // Base URL used in emailed links (password reset). Defaults to the local server.
  APP_BASE_URL: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
  MAIL: {
    user: process.env.GMAIL_USER || 'suncityvistaar2000@gmail.com',
    appPassword: process.env.GMAIL_APP_PASSWORD || '', // empty → emails are logged to console instead
  },
  // Real society UPI details (extracted once from the provided "Suncity UPI"
  // payment card and kept here so they're not hardcoded loosely elsewhere). The
  // matching signed merchant QR image ships as client/public/imgs/payment-qr.png.
  UPI_VPA: process.env.SOCIETY_UPI_VPA || 'sunci94122025@barodampay',
  UPI_PAYEE: process.env.SOCIETY_UPI_PAYEE_NAME || 'SUNCITY VISTAAR JANKALYAN SAMITI',
  UPI_QR_IMAGE: process.env.SOCIETY_UPI_QR_IMAGE || '/imgs/payment-qr.png',
  // Google Gemini — powers the AI-assisted payment-screenshot check (item 22) and
  // is exposed as a reusable service in server/lib/gemini.js. Blank key → the
  // integration reports "not configured" and AI checks are skipped gracefully.
  GEMINI: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
  ADMIN_SEED: {
    name: process.env.ADMIN_SEED_NAME || 'Society Admin',
    phone: process.env.ADMIN_SEED_PHONE || '9999999999',
    password: process.env.ADMIN_SEED_PASSWORD || 'admin123',
  },
  // The single hidden super-admin account, auto-seeded at boot. Defaults are the
  // values the owner supplied; override any of them via env in production. Only
  // ever created if no super_admin exists yet, so a later password change sticks.
  SUPER_ADMIN_SEED: {
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    phone: process.env.SUPER_ADMIN_PHONE || '7817834370',
    email: process.env.SUPER_ADMIN_EMAIL || 'atharvrs2010@gmail.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'sadmin123',
  },
  ROLES,
  OFFICE_BEARER_PERMISSIONS,
  OFFICE_BEARER_ROLES,
  SUPERVISOR_ROLES,
  RESIDENT_STATUSES,
  COMPLAINT_CATEGORIES,
  REMOVED_COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_OPTIONS,
  CLEANING_CATEGORIES,
  NOTICE_CATEGORIES,
  COMPLAINT_STATUSES,
  BLOCKS,
  OAUTH,
};
