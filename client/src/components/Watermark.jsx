import { useAuth } from '../auth';

// Global developer watermark shown across the whole UI. Intentionally hidden for
// the hidden super-admin account (which should carry no attribution).
export default function Watermark() {
  const auth = useAuth();
  const user = auth ? auth.user : null;
  if (user && user.role === 'super_admin') return null;
  return (
    <div className="app-watermark" aria-hidden="true">
      Developed by Adarsh Sharma&nbsp;|&nbsp;25 Carat Ventures
    </div>
  );
}
