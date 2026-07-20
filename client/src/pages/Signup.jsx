import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { useAuth } from '../auth';
import { Btn, Field, PasswordInput } from '../components/Glass';

const RESEND_COOLDOWN = 60; // seconds — mirrors the server-side resend gate

export default function Signup() {
  const { completeSignup } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('form'); // 'form' → 'otp'
  const [form, setForm] = useState({ name: '', phone: '', email: '', flat_no: '', password: '' });
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Tick down the resend cooldown once per second.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function submitForm(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const d = await api('/api/auth/signup', { method: 'POST', body: form });
      setStep('otp');
      setInfo(d.message || `We've emailed a 6-digit code to ${form.email}.`);
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/api/auth/verify-signup', {
        method: 'POST',
        body: { email: form.email, otp },
      });
      completeSignup(d.token, d.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const d = await api('/api/auth/resend-otp', { method: 'POST', body: { email: form.email } });
      setInfo(d.message || 'A new code has been sent.');
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function editEmail() {
    setStep('form');
    setOtp('');
    setError('');
    setInfo('');
  }

  if (step === 'otp') {
    return (
      <div className="auth-wrap">
        <motion.div
          className="glass auth-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        >
          <div className="auth-logo">
            <div className="e">📧</div>
            <h1>Verify your email</h1>
            <p>
              Enter the 6-digit code we sent to <strong>{form.email}</strong>
            </p>
          </div>
          {error && <div className="err-banner">{error}</div>}
          {info && !error && <div className="ok-banner">{info}</div>}
          <form onSubmit={verifyOtp}>
            <Field label="VERIFICATION CODE">
              <input
                className="input otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                required
              />
            </Field>
            <Btn block disabled={busy || otp.length !== 6} type="submit">
              {busy ? 'Verifying…' : 'Verify & Create Account'}
            </Btn>
          </form>
          <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
            Didn't get it?{' '}
            {cooldown > 0 ? (
              <span>Resend in {cooldown}s</span>
            ) : (
              <a
                href="#resend"
                onClick={(e) => {
                  e.preventDefault();
                  resend();
                }}
              >
                Resend code
              </a>
            )}
          </p>
          <p className="muted" style={{ textAlign: 'center', marginTop: 6 }}>
            Wrong email?{' '}
            <a
              href="#edit"
              onClick={(e) => {
                e.preventDefault();
                editEmail();
              }}
            >
              Go back
            </a>
          </p>
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
          <div className="e">🏙️</div>
          <h1>Create Account</h1>
          <p>Join My Suncity Vistaar</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submitForm}>
          <Field label="FULL NAME">
            <input className="input" value={form.name} onChange={set('name')} placeholder="Your name" required />
          </Field>
          <Field label="PHONE NUMBER">
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={set('phone')}
              placeholder="10-digit mobile number"
              required
            />
          </Field>
          <Field label="EMAIL">
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="you@example.com"
              required
            />
          </Field>
          <Field label="FLAT / HOUSE NO. (OPTIONAL)">
            <input className="input" value={form.flat_no} onChange={set('flat_no')} placeholder="e.g. A-101" />
          </Field>
          <Field label="PASSWORD">
            <PasswordInput
              value={form.password}
              onChange={set('password')}
              placeholder="At least 6 characters"
              required
            />
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Sending code…' : 'Sign Up'}
          </Btn>
        </form>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
