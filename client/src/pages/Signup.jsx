import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api';
import { useAuth } from '../auth';
import { Btn, Field, PasswordInput } from '../components/Glass';
import BlockHousePicker from '../components/BlockHousePicker';
import OAuthButtons from '../components/OAuthButtons';
import { OFFICE_BEARER_ROLES } from '../constants';

const RESEND_COOLDOWN = 60; // seconds — mirrors the server-side resend gate

const ACCOUNT_TYPES = [
  { value: 'resident', label: 'Resident' },
  { value: 'office_bearer', label: 'Office Bearer' },
  { value: 'admin', label: 'Admin' },
];

// Wraps a progressively-revealed step so it slides/fades in smoothly.
function Reveal({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export default function Signup() {
  const { completeSignup } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('form'); // 'form' → 'otp' (resident) | 'submitted' (staff)
  const [form, setForm] = useState({
    account_type: 'resident',
    name: '',
    phone: '',
    email: '',
    block: '',
    house_no: '',
    role_detail: '',
    password: '',
  });
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const isResident = form.account_type === 'resident';
  const isOfficeBearer = form.account_type === 'office_bearer';

  // Progressive reveal: Account type + Name → (Block/House for residents, or
  // Committee post for office bearers) → email/phone/password.
  const named = form.name.trim().length > 0;
  const midComplete = isResident ? !!form.block && !!form.house_no : isOfficeBearer ? !!form.role_detail : true;
  const showRest = named && midComplete;

  // Tick down the resend cooldown once per second.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function changeType(e) {
    const account_type = e.target.value;
    // Clear the fields that don't apply to the newly-chosen type.
    setForm((f) => ({ ...f, account_type, block: '', house_no: '', role_detail: '' }));
    setError('');
  }

  async function submitForm(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (isResident) {
        const d = await api('/api/auth/signup', {
          method: 'POST',
          body: {
            name: form.name,
            phone: form.phone,
            email: form.email,
            block: form.block,
            house_no: form.house_no,
            password: form.password,
          },
        });
        setStep('otp');
        setInfo(d.message || `We've emailed a 6-digit code to ${form.email}.`);
        setCooldown(RESEND_COOLDOWN);
      } else {
        const d = await api('/api/auth/signup-staff', {
          method: 'POST',
          body: {
            name: form.name,
            role: form.account_type,
            role_detail: form.role_detail,
            email: form.email,
            phone: form.phone,
            password: form.password,
          },
        });
        setInfo(d.message || 'Your request has been submitted for admin approval.');
        setStep('submitted');
      }
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

  // ---- Staff request submitted: pending admin approval ----
  if (step === 'submitted') {
    return (
      <div className="auth-wrap">
        <motion.div
          className="glass auth-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        >
          <div className="auth-logo">
            <div className="e">⏳</div>
            <h1>Request submitted</h1>
            <p>Awaiting admin approval</p>
          </div>
          <div className="ok-banner">{info}</div>
          <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
            You'll be able to sign in with your phone number and password once an admin approves your account.
          </p>
          <div style={{ marginTop: 16 }}>
            <Btn block onClick={() => navigate('/login', { replace: true })}>
              Back to Sign In
            </Btn>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---- Resident email OTP verification ----
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
          <img className="auth-logo-img" src="/imgs/logo.png" alt="My Suncity Vistaar" />
          <h1>Create Account</h1>
          <p>Join My Suncity Vistaar</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submitForm}>
          <Field label="ACCOUNT TYPE">
            <select className="input" value={form.account_type} onChange={changeType}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          {!isResident && (
            <p className="tiny" style={{ marginTop: -6, marginBottom: 12 }}>
              {isOfficeBearer ? 'Office bearer' : 'Admin'} accounts are reviewed by an admin before they can sign in.
            </p>
          )}

          <Field label="FULL NAME">
            <input className="input" value={form.name} onChange={set('name')} placeholder="Your name" required autoFocus />
          </Field>

          <AnimatePresence>
            {named && isResident && (
              <Reveal key="location">
                <BlockHousePicker
                  block={form.block}
                  houseNo={form.house_no}
                  onBlockChange={(v) => setForm((f) => ({ ...f, block: v }))}
                  onHouseNoChange={(v) => setForm((f) => ({ ...f, house_no: v }))}
                />
              </Reveal>
            )}
            {named && isOfficeBearer && (
              <Reveal key="post">
                <Field label="COMMITTEE POST">
                  <select className="input" value={form.role_detail} onChange={set('role_detail')} required>
                    <option value="" disabled>
                      Select your post
                    </option>
                    {OFFICE_BEARER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
              </Reveal>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showRest && (
              <Reveal key="rest">
                <Field label={isResident ? 'EMAIL' : 'EMAIL (OPTIONAL)'}>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@example.com"
                    required={isResident}
                  />
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
                <Field label="PASSWORD">
                  <PasswordInput
                    value={form.password}
                    onChange={set('password')}
                    placeholder="At least 6 characters"
                    minLength={6}
                    required
                  />
                </Field>
                <Btn block disabled={busy} type="submit">
                  {busy ? (isResident ? 'Sending code…' : 'Submitting…') : isResident ? 'Sign Up' : 'Submit for approval'}
                </Btn>
              </Reveal>
            )}
          </AnimatePresence>
        </form>
        {isResident && <OAuthButtons label="or sign up with" />}
        <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
