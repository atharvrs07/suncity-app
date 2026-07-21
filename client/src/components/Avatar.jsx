// Reusable avatar (item 16). Shows the user's uploaded profile picture when they
// have one, otherwise the gradient initial bubble the app already used. `size` is
// 'sm' | 'xs' | 'lg' | default (topbar 38px). Used wherever a name appears.
export default function Avatar({ name = '', src, size, className = '' }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const sizeClass = size === 'lg' ? 'avatar-lg' : size === 'sm' ? 'avatar-sm' : size === 'xs' ? 'avatar-xs' : '';
  if (src) {
    return <img className={`avatar-img ${sizeClass} ${className}`} src={src} alt={name} />;
  }
  return <div className={`avatar ${sizeClass} ${className}`}>{initial}</div>;
}
