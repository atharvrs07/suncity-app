require('dotenv').config();
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ROLES = ['admin', 'office_bearer', 'supervisor', 'resident'];

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

// Cleaning supervisor scope: road / drainage / park cleaning.
const CLEANING_CATEGORIES = ['park_cleaning', 'drainage_cleaning', 'road_garbage_pickup'];

const NOTICE_CATEGORIES = ['general', 'maintenance', 'event', 'emergency'];

const COMPLAINT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOADS_DIR,
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  UPI_VPA: process.env.SOCIETY_UPI_VPA || 'society@upi',
  UPI_PAYEE: process.env.SOCIETY_UPI_PAYEE_NAME || 'My Suncity Vistaar',
  ADMIN_SEED: {
    name: process.env.ADMIN_SEED_NAME || 'Society Admin',
    phone: process.env.ADMIN_SEED_PHONE || '9999999999',
    password: process.env.ADMIN_SEED_PASSWORD || 'admin123',
  },
  ROLES,
  OFFICE_BEARER_ROLES,
  SUPERVISOR_ROLES,
  COMPLAINT_CATEGORIES,
  CLEANING_CATEGORIES,
  NOTICE_CATEGORIES,
  COMPLAINT_STATUSES,
};
