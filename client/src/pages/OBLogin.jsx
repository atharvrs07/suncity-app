import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth';
import { Btn, Field, PasswordInput } from '../components/Glass';

// Office-bearer login. Intentionally NOT linked from anywhere in the app —
// reachable only by typing /ob/login directly. Keep it that way.
export default function OBLogin() {
  const { obLogin } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await obLogin(username, password);
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
          <div className="e">🪑</div>
          <h1>Office Bearer Sign In</h1>
          <p>My Suncity Vistaar committee access</p>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="USERNAME">
            <input
              className="input"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              placeholder="Your committee username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
          <Btn block disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign In'}
          </Btn>
        </form>
      </motion.div>
    </div>
  );
}
