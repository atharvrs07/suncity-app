// Human-readable labels for complaint category keys — used in notification and
// audit text server-side (the client keeps its own labelled/emoji list). Keep in
// sync with client/src/constants.js COMPLAINT_CATEGORIES.
const LABELS = {
  street_light: 'Street Light',
  security: 'Security',
  grass_cutting: 'Grass Cutting',
  park_cleaning: 'Park Cleaning',
  drainage_cleaning: 'Drainage Cleaning',
  road_garbage_pickup: 'Road Garbage Pickup',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  housekeeping: 'Housekeeping',
  parking: 'Parking',
  lift: 'Lift',
  structural: 'Structural',
  pest_control: 'Pest Control',
  other: 'Other',
};

const catLabel = (key) => LABELS[key] || key;

module.exports = { catLabel, LABELS };
