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
  if (user.role === 'admin') return 'Admin';
  if (user.role === 'office_bearer') return user.role_detail || 'Office Bearer';
  if (user.role === 'supervisor')
    return user.role_detail === 'cleaning' ? 'Cleaning Supervisor' : 'Maintenance Supervisor';
  return 'Resident';
}

export const MENU = [
  { path: '/', label: 'Home', emoji: '🏠' },
  { path: '/complaints', label: 'Complaints', emoji: '📋' },
  { path: '/dues', label: 'Dues', emoji: '💳' },
  { path: '/notices', label: 'Notices', emoji: '📢' },
  { path: '/classifieds', label: 'Classifieds', emoji: '🏷️', roles: ['admin', 'office_bearer'] },
  { path: '/approvals', label: 'Approvals', emoji: '✅', roles: ['admin'] },
  { path: '/admin', label: 'Admin', emoji: '⚙️', roles: ['admin'] },
  { path: '/lost-found', label: 'Lost & Found', emoji: '🔍' },
  { path: '/events', label: 'Society Events', emoji: '🎉' },
  { path: '/gallery', label: 'Photo Gallery', emoji: '🖼️' },
  { path: '/settings', label: 'Settings', emoji: '👤' },
];
