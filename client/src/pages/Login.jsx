import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth';
import { Btn, Field, PasswordInput } from '../components/Glass';
import OAuthButtons from '../components/OAuthButtons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(phone, password, remember);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
          <img className="auth-logo-img" src="/imgs/logo.png" alt="My Suncity Vistaar" />
          <h1>My Suncity Vistaar</h1>
          <p>Your society, in your pocket</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="PHONE NUMBER">
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
            />
          </Field>
          <Field label="PASSWORD">
            <PasswordInput
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <div className="row-between" style={{ marginTop: -4, marginBottom: 13 }}>
            <label className="row" style={{ gap: 7, cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Stay logged in
            </label>
            <Link to="/forgot-password" className="muted" style={{ fontSize: 13.5 }}>
              Forgot password?
            </Link>
          </div>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign In'}
          </Btn>
        </form>
        <OAuthButtons />
        <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </motion.div>
    </div>
  );
}
