import { useEffect, useState } from 'react';
import { api } from '../api';

// Brand marks kept inline (the app's CSP-friendly, no-external-asset style).
const GoogleIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#F25022" d="M1 1h7.6v7.6H1z" />
    <path fill="#7FBA00" d="M9.4 1H17v7.6H9.4z" />
    <path fill="#00A4EF" d="M1 9.4h7.6V17H1z" />
    <path fill="#FFB900" d="M9.4 9.4H17V17H9.4z" />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="currentColor"
      d="M13.03 9.55c-.02-1.7 1.39-2.52 1.45-2.56-.79-1.16-2.02-1.32-2.46-1.34-1.05-.11-2.04.61-2.57.61-.53 0-1.35-.6-2.22-.58-1.14.02-2.2.66-2.79 1.68-1.19 2.06-.3 5.11.85 6.78.57.82 1.24 1.73 2.12 1.7.85-.03 1.17-.55 2.2-.55 1.02 0 1.31.55 2.21.53.91-.02 1.49-.83 2.05-1.65.65-.95.92-1.87.93-1.92-.02-.01-1.78-.68-1.8-2.71l.03.001ZM11.4 4.6c.47-.57.79-1.36.7-2.15-.68.03-1.5.45-1.98 1.02-.43.5-.81 1.31-.71 2.08.76.06 1.53-.39 2-.95Z"
    />
  </svg>
);

const PROVIDERS = [
  { key: 'google', label: 'Continue with Google', Icon: GoogleIcon },
  { key: 'microsoft', label: 'Continue with Microsoft', Icon: MicrosoftIcon },
  { key: 'apple', label: 'Continue with Apple', Icon: AppleIcon },
];

// Renders sign-in buttons only for the OAuth providers the server reports as
// configured — so before any credentials are added, the auth screens look
// exactly as they did before. Each button is a plain link that starts the
// server-side flow with a top-level navigation (needed for the OAuth redirect).
export default function OAuthButtons({ label = 'or continue with' }) {
  const [enabled, setEnabled] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/api/auth/oauth/providers')
      .then((d) => alive && setEnabled(d))
      .catch(() => alive && setEnabled({}));
    return () => {
      alive = false;
    };
  }, []);

  if (!enabled) return null;
  const active = PROVIDERS.filter((p) => enabled[p.key]);
  if (active.length === 0) return null;

  return (
    <>
      <div className="oauth-divider">
        <span>{label}</span>
      </div>
      <div className="oauth-btns">
        {active.map(({ key, label: text, Icon }) => (
          <a key={key} className={`oauth-btn oauth-${key}`} href={`/api/auth/oauth/${key}/start`}>
            <Icon />
            <span>{text}</span>
          </a>
        ))}
      </div>
    </>
  );
}
