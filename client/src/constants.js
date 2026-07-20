export const COMPLAINT_CATEGORIES = [
  { value: 'street_light', label: 'Street Light', emoji: '💡' },
  { value: 'security', label: 'Security', emoji: '🛡️' },
  { value: 'grass_cutting', label: 'Grass Cutting', emoji: '🌿' },
  { value: 'park_cleaning', label: 'Park Cleaning', emoji: '🏞️' },
  { value: 'drainage_cleaning', label: 'Drainage Cleaning', emoji: '🚰' },
  { value: 'road_garbage_pickup', label: 'Road Garbage Pickup', emoji: '🗑️' },
  { value: 'plumbing', label: 'Plumbing', emoji: '🔧' },
  { value: 'electrical', label: 'Electrical', emoji: '⚡' },
  { value: 'housekeeping', label: 'Housekeeping', emoji: '🧹' },
  { value: 'parking', label: 'Parking', emoji: '🚗' },
  { value: 'lift', label: 'Lift', emoji: '🛗' },
  { value: 'structural', label: 'Structural', emoji: '🏗️' },
  { value: 'pest_control', label: 'Pest Control', emoji: '🐜' },
  { value: 'other', label: 'Other', emoji: '📝' },
];

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
export const MENU = [
  { path: '/', label: 'Home', emoji: '🏠' },
  { path: '/complaints', label: 'Complaints', emoji: '📋' },
  { path: '/dues', label: 'Dues', emoji: '💳' },
  { path: '/notices', label: 'Notices', emoji: '📢' },
  { path: '/classifieds', label: 'Classifieds', emoji: '🏷️', perm: 'manage_classifieds' },
  { path: '/approvals', label: 'Approvals', emoji: '✅', roles: ['admin', 'super_admin'] },
  { path: '/admin', label: 'Admin', emoji: '⚙️', roles: ['admin', 'super_admin'] },
  { path: '/lost-found', label: 'Lost & Found', emoji: '🔍' },
  { path: '/events', label: 'Society Events', emoji: '🎉' },
  { path: '/gallery', label: 'Photo Gallery', emoji: '🖼️' },
  { path: '/settings', label: 'Settings', emoji: '👤' },
];

export function menuFor(user) {
  return MENU.filter((m) => {
    if (m.perm) return hasPerm(user, m.perm);
    if (m.roles) return m.roles.includes(user.role);
    return true;
  });
}
