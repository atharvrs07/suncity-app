import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { Btn, Field } from '../components/Glass';
import { OFFICE_BEARER_ROLES, SUPERVISOR_ROLES } from '../constants';

const ROLE_OPTIONS = [
  { value: 'resident', label: 'Resident' },
  { value: 'office_bearer', label: 'Office Bearer' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' },
];

export default function Signup() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    flat_no: '',
    password: '',
    role: 'resident',
    role_detail: '',
  });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/signup', { method: 'POST', body: form });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <motion.div className="glass auth-card" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="auth-logo">
            <div className="e">⏳</div>
            <h1>Almost there!</h1>
            <p>
              Your signup was received. An admin will review and approve your account — you can log in once
              that happens.
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
          <div className="e">🏙️</div>
          <h1>Create Account</h1>
          <p>Join My Suncity Vistaar</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
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
          <Field label="FLAT / HOUSE NO. (OPTIONAL)">
            <input className="input" value={form.flat_no} onChange={set('flat_no')} placeholder="e.g. A-101" />
          </Field>
          <Field label="PASSWORD">
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="At least 6 characters"
              required
            />
          </Field>
          <Field label="I AM SIGNING UP AS">
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, role_detail: '' }))}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          {form.role === 'office_bearer' && (
            <Field label="OFFICE BEARER ROLE">
              <select className="input" value={form.role_detail} onChange={set('role_detail')} required>
                <option value="">Select role…</option>
                {OFFICE_BEARER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {form.role === 'supervisor' && (
            <Field label="SUPERVISOR TYPE">
              <select className="input" value={form.role_detail} onChange={set('role_detail')} required>
                <option value="">Select type…</option>
                {SUPERVISOR_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {form.role === 'admin' && (
            <p className="muted" style={{ marginBottom: 13 }}>
              Admin signups need approval from an existing admin.
            </p>
          )}
          <Btn block disabled={busy} type="submit">
            {busy ? 'Submitting…' : 'Sign Up'}
          </Btn>
        </form>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
