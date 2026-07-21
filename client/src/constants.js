// The full historical category list — kept complete so complaints already filed
// under a retired category (marked `removed`) still show a proper label. New
// complaints are filed only from COMPLAINT_CATEGORY_OPTIONS below. Mirrors
// server/config.js COMPLAINT_CATEGORIES / REMOVED_COMPLAINT_CATEGORIES.
export const COMPLAINT_CATEGORIES = [
  { value: 'street_light', label: 'Street Light', emoji: '💡' },
  { value: 'security', label: 'Security', emoji: '🛡️', removed: true },
  { value: 'grass_cutting', label: 'Grass Cutting', emoji: '🌿' },
  { value: 'park_cleaning', label: 'Park Cleaning', emoji: '🏞️' },
  { value: 'drainage_cleaning', label: 'Drainage Cleaning', emoji: '🚰' },
  { value: 'road_garbage_pickup', label: 'Road Garbage Pickup', emoji: '🗑️' },
  { value: 'plumbing', label: 'Plumbing', emoji: '🔧', removed: true },
  { value: 'electrical', label: 'Electrical', emoji: '⚡' },
  { value: 'housekeeping', label: 'Housekeeping', emoji: '🧹', removed: true },
  { value: 'parking', label: 'Parking', emoji: '🚗', removed: true },
  { value: 'lift', label: 'Lift', emoji: '🛗' },
  { value: 'structural', label: 'Structural', emoji: '🏗️' },
  { value: 'pest_control', label: 'Pest Control', emoji: '🐜' },
  { value: 'other', label: 'Other', emoji: '📝' },
];

// Only these may be picked on the complaint form (retired ones are excluded).
export const COMPLAINT_CATEGORY_OPTIONS = COMPLAINT_CATEGORIES.filter((c) => !c.removed);

export const catMeta = (value) =>
  COMPLAINT_CATEGORIES.find((c) => c.value === value) || { value, label: value, emoji: '📋' };

export const COMPLAINT_STATUS = {
  open: { label: 'Open', tone: 'red' },
  in_progress: { label: 'In Progress', tone: 'orange' },
  resolved: { label: 'Resolved', tone: 'green' },
  closed: { label: 'Closed', tone: 'gray' },
};

export const DUE_STATUS = {
  pending: { label: 'Pending', tone: 'orange' },
  submitted: { label: 'Verifying', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
};

export const NOTICE_CATEGORIES = [
  { value: 'general', label: 'General', tone: 'blue' },
  { value: 'maintenance', label: 'Maintenance', tone: 'orange' },
  { value: 'event', label: 'Event', tone: 'purple' },
  { value: 'emergency', label: 'Emergency', tone: 'red' },
];

export const OFFICE_BEARER_ROLES = [
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

export const SUPERVISOR_ROLES = [
  { value: 'maintenance', label: 'Maintenance Supervisor' },
  { value: 'cleaning', label: 'Cleaning Supervisor' },
];

// Granular capabilities an admin can grant an office bearer. Mirrors
// server/config.js OFFICE_BEARER_PERMISSIONS (keep the two in sync). admins and
// the super admin implicitly hold all of these.
export const OFFICE_BEARER_PERMISSIONS = [
  { key: 'manage_notices', label: 'Notices', emoji: '📢', desc: 'Post, pin & delete notices' },
  { key: 'manage_events', label: 'Society Events', emoji: '🎉', desc: 'Post & remove events' },
  { key: 'manage_gallery', label: 'Photo Gallery', emoji: '🖼️', desc: 'Upload & remove gallery photos' },
  { key: 'manage_classifieds', label: 'Classifieds', emoji: '🏷️', desc: 'Access & manage classifieds' },
  { key: 'manage_complaints', label: 'Complaints', emoji: '📋', desc: 'View all complaints & update status' },
  { key: 'manage_dues', label: 'Dues & Payments', emoji: '💳', desc: 'Create dues & verify payments' },
  { key: 'manage_lostfound', label: 'Lost & Found', emoji: '🔍', desc: 'Moderate any Lost & Found post' },
];

export const permLabel = (key) => {
  const p = OFFICE_BEARER_PERMISSIONS.find((x) => x.key === key);
  return p ? p.label : key;
};

// Roles carrying full authority (everything an admin can do, the super admin can too).
export const isAdmin = (user) => !!user && (user.role === 'admin' || user.role === 'super_admin');

// Parse the permissions field, which may arrive as an array (from /me) or a raw
// JSON string (from the login endpoints) or be absent (roles without permissions).
export function userPermissions(user) {
  if (!user) return [];
  const p = user.permissions;
  if (Array.isArray(p)) return p;
  if (typeof p === 'string') {
    try {
      const a = JSON.parse(p);
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function hasPerm(user, perm) {
  if (isAdmin(user)) return true;
  if (user && user.role === 'office_bearer') return userPermissions(user).includes(perm);
  return false;
}

// A resident account is either the flat's Owner or its (living-in) Resident.
// Mirrors server/config.js RESIDENT_STATUSES (keep the two in sync).
export const RESIDENT_STATUSES = [
  { value: 'owner', label: 'Owner' },
  { value: 'resident', label: 'Resident' },
];

export const residentStatusLabel = (value) => {
  const s = RESIDENT_STATUSES.find((x) => x.value === value);
  return s ? s.label : '';
};

// Live "title case" for full-name inputs: capitalize the first letter of every
// word (the first char and any letter following whitespace) as the user types,
// leaving the rest untouched so intentional caps like "McArthur" survive. The
// replacement is length-preserving, so the caret never jumps mid-edit.
export const capitalizeName = (value) =>
  String(value == null ? '' : value).replace(/(^|\s)(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

// Society blocks — mirrors server/config.js BLOCKS (keep the two in sync).
// Order is intentional and shown as-is in the signup / profile dropdowns.
export const BLOCKS = [
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

export function roleLabel(user) {
  if (!user) return '';
  if (user.role === 'super_admin') return 'Super Admin';
  if (user.role === 'admin') return 'Admin';
  if (user.role === 'office_bearer') return user.role_detail || 'Office Bearer';
  if (user.role === 'supervisor')
    return user.role_detail === 'cleaning' ? 'Cleaning Supervisor' : 'Maintenance Supervisor';
  return 'Resident';
}

// Menu items may gate on `roles` (any of) or `perm` (an office-bearer permission,
// which admins/super admin always satisfy). No gate → visible to everyone.
// `labelKey` maps to an i18n key (client/src/i18n.js); `label` is the English
// fallback used if a translation is missing. The Admin area is labelled
// "Control Panel" in the UI (item 12) — the route/role names are unchanged.
export const MENU = [
  { path: '/', label: 'Home', labelKey: 'nav.home', emoji: '🏠' },
  { path: '/complaints', label: 'Complaints', labelKey: 'nav.complaints', emoji: '📋' },
  { path: '/dues', label: 'Dues', labelKey: 'nav.dues', emoji: '💳' },
  { path: '/notices', label: 'Notices', labelKey: 'nav.notices', emoji: '📢' },
  { path: '/classifieds', label: 'Classifieds', labelKey: 'nav.classifieds', emoji: '🏷️', perm: 'manage_classifieds' },
  { path: '/approvals', label: 'Approvals', labelKey: 'nav.approvals', emoji: '✅', roles: ['admin', 'super_admin'] },
  { path: '/admin', label: 'Control Panel', labelKey: 'nav.controlPanel', emoji: '⚙️', roles: ['admin', 'super_admin'] },
  { path: '/lost-found', label: 'Lost & Found', labelKey: 'nav.lostFound', emoji: '🔍' },
  { path: '/events', label: 'Society Events', labelKey: 'nav.events', emoji: '🎉' },
  { path: '/gallery', label: 'Photo Gallery', labelKey: 'nav.gallery', emoji: '🖼️' },
  { path: '/settings', label: 'Settings', labelKey: 'nav.settings', emoji: '👤' },
];

export function menuFor(user) {
  return MENU.filter((m) => {
    if (m.perm) return hasPerm(user, m.perm);
    if (m.roles) return m.roles.includes(user.role);
    return true;
  });
}
