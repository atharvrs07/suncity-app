import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { useAuth } from '../auth';
import { Btn, Field, Spinner } from '../components/Glass';
import BlockHousePicker from '../components/BlockHousePicker';
import { capitalizeName } from '../constants';

// Landing route for the server-side OAuth flow. The server bounces the browser
// here with the outcome in the URL fragment:
//   #token=<jwt>                      → existing/linked account, sign straight in
//   #pending=<jwt>&email=&name=       → new account, collect the mandatory
//                                        fields OAuth can't supply (phone/flat/block)
//   #error=<message>                  → something went wrong
function parseHash() {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  return Object.fromEntries(new URLSearchParams(raw));
}

export default function OAuthCallback() {
  const { loginWithToken, completeSignup } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('loading'); // 'loading' | 'complete' | 'error'
  const [error, setError] = useState('');
  const [prefillEmail, setPrefillEmail] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', resident_status: '', block: '', house_no: '' });
  const [busy, setBusy] = useState(false);
  const pendingToken = useRef(null);

  useEffect(() => {
    const p = parseHash();
    // Strip the fragment so the token doesn't linger in the address bar / history.
    window.history.replaceState(null, '', '/oauth/callback');

    if (p.error) {
      setError(p.error);
      setMode('error');
      return;
    }
    if (p.token) {
      loginWithToken(p.token)
        .then(() => navigate('/', { replace: true }))
        .catch((err) => {
          setError(err.message);
          setMode('error');
        });
      return;
    }
    if (p.pending) {
      pendingToken.current = p.pending;
      setPrefillEmail(p.email || '');
      setForm((f) => ({ ...f, name: p.name || '' }));
      setMode('complete');
      return;
    }
    setError('Sign-in did not complete. Please try again.');
    setMode('error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/api/auth/oauth/complete', {
        method: 'POST',
        body: { pending_token: pendingToken.current, ...form },
      });
      completeSignup(d.token, d.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'loading') {
    return (
      <div className="auth-wrap">
        <div className="glass auth-card">
          <Spinner />
          <p className="muted" style={{ textAlign: 'center' }}>
            Completing sign-in…
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div className="auth-wrap">
        <motion.div
          className="glass auth-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        >
          <div className="auth-logo">
            <div className="e">⚠️</div>
            <h1>Sign-in failed</h1>
            <p>{error}</p>
          </div>
          <Link to="/login">
            <Btn block>Back to sign in</Btn>
          </Link>
        </motion.div>
      </div>
    );
  }

  // mode === 'complete' — collect the mandatory fields OAuth didn't provide.
  return (
    <div className="auth-wrap">
      <motion.div
        className="glass auth-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      >
        <div className="auth-logo">
          <img className="auth-logo-img" src="/imgs/logo.png" alt="My Suncity Vistaar" />
          <h1>Complete your profile</h1>
          <p>A few required details to finish{prefillEmail ? ` for ${prefillEmail}` : ''}</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="FULL NAME">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: capitalizeName(e.target.value) }))}
              placeholder="Your name"
              required
            />
          </Field>
          <Field label="PHONE NUMBER">
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
              placeholder="10-digit mobile number"
              required
            />
          </Field>
          <BlockHousePicker
            status={form.resident_status}
            block={form.block}
            houseNo={form.house_no}
            onStatusChange={(v) => setForm((f) => ({ ...f, resident_status: v }))}
            onBlockChange={(v) => setForm((f) => ({ ...f, block: v }))}
            onHouseNoChange={(v) => setForm((f) => ({ ...f, house_no: v }))}
          />
          <Btn block disabled={busy} type="submit">
            {busy ? 'Creating account…' : 'Finish & Continue'}
          </Btn>
        </form>
      </motion.div>
    </div>
  );
}
