import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { Btn, Field, PasswordInput } from '../components/Glass';

// Opened from the emailed reset link: /reset-password?token=…
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!token || done) {
    return (
      <div className="auth-wrap">
        <motion.div className="glass auth-card" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="auth-logo">
            <div className="e">{done ? '✅' : '⚠️'}</div>
            <h1>{done ? 'Password updated' : 'Invalid link'}</h1>
            <p>
              {done
                ? 'Your password has been changed. Sign in with your new password.'
                : 'This reset link is missing or broken. Request a new one from the sign-in page.'}
            </p>
          </div>
          <Link to={done ? '/login' : '/forgot-password'}>
            <Btn block>{done ? 'Go to Sign In' : 'Request New Link'}</Btn>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <motion.div
        className="glass auth-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      >
        <div className="auth-logo">
          <div className="e">🔐</div>
          <h1>Set a new password</h1>
          <p>My Suncity Vistaar</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="NEW PASSWORD">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </Field>
          <Field label="CONFIRM NEW PASSWORD">
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat the new password"
              required
            />
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Update Password'}
          </Btn>
        </form>
      </motion.div>
    </div>
  );
}
