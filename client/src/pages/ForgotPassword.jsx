import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { Btn, Field } from '../components/Glass';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-wrap">
        <motion.div className="glass auth-card" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="auth-logo">
            <div className="e">📬</div>
            <h1>Check your inbox</h1>
            <p>
              If an account with that email exists, a reset link has been sent. The link is valid for 30
              minutes — check your spam folder too.
            </p>
          </div>
          <Link to="/login">
            <Btn block>Back to Sign In</Btn>
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
          <div className="e">🔑</div>
          <h1>Forgot password</h1>
          <p>Enter your account's email and we'll send you a reset link</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="EMAIL">
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Sending…' : 'Send Reset Link'}
          </Btn>
        </form>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
        <p className="tiny" style={{ textAlign: 'center', marginTop: 10 }}>
          No email on your account? Ask a society admin to reset your password.
        </p>
      </motion.div>
    </div>
  );
}
