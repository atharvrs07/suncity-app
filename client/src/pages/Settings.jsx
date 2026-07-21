import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, PasswordInput } from '../components/Glass';
import { roleLabel, capitalizeName } from '../constants';

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const [profile, setProfile] = useState({ name: user.name, flat_no: user.flat_no || '', email: user.email || '' });
  const [pwd, setPwd] = useState({ current_password: '', new_password: '' });
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyPwd, setBusyPwd] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setBusyProfile(true);
    setMsg(null);
    try {
      const d = await api('/api/auth/me', { method: 'PATCH', body: profile });
      setUser(d.user);
      setMsg({ ok: true, text: 'Profile updated' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusyProfile(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setBusyPwd(true);
    setMsg(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: pwd });
      setPwd({ current_password: '', new_password: '' });
      setMsg({ ok: true, text: 'Password changed' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusyPwd(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Profile & account</p>
        </div>
      </div>

      {msg && <div className={msg.ok ? 'ok-banner' : 'err-banner'}>{msg.text}</div>}

      <div className="stack">
        <GlassCard>
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="avatar" style={{ width: 52, height: 52, fontSize: 21 }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="grow">
              <div className="title-sm">{user.name}</div>
              <div className="muted">{user.phone ? `📱 ${user.phone}` : `@${user.username || ''}`}</div>
            </div>
            <Chip tone="blue">{roleLabel(user)}</Chip>
          </div>
          <form onSubmit={saveProfile}>
            <Field label="NAME">
              <input
                className="input"
                value={profile.name}
                onChange={(e) => setProfile((f) => ({ ...f, name: capitalizeName(e.target.value) }))}
                required
              />
            </Field>
            <Field label="FLAT / HOUSE NO.">
              <input
                className="input"
                value={profile.flat_no}
                onChange={(e) => setProfile((f) => ({ ...f, flat_no: e.target.value }))}
                placeholder="e.g. A-101"
              />
            </Field>
            <Field label="EMAIL (USED FOR PASSWORD RECOVERY)">
              <input
                className="input"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </Field>
            <Btn disabled={busyProfile} type="submit">
              {busyProfile ? 'Saving…' : 'Save Profile'}
            </Btn>
          </form>
        </GlassCard>

        <GlassCard>
          <h2 className="title-sm" style={{ marginBottom: 12 }}>
            🔐 Change password
          </h2>
          <form onSubmit={changePassword}>
            <Field label="CURRENT PASSWORD">
              <PasswordInput
                value={pwd.current_password}
                onChange={(e) => setPwd((f) => ({ ...f, current_password: e.target.value }))}
                required
              />
            </Field>
            <Field label="NEW PASSWORD">
              <PasswordInput
                value={pwd.new_password}
                onChange={(e) => setPwd((f) => ({ ...f, new_password: e.target.value }))}
                placeholder="At least 6 characters"
                required
              />
            </Field>
            <Btn disabled={busyPwd} type="submit">
              {busyPwd ? 'Updating…' : 'Update Password'}
            </Btn>
          </form>
        </GlassCard>

        <GlassCard>
          <div className="row-between">
            <div>
              <div className="title-sm">Sign out</div>
              <div className="muted">You'll need your phone & password to sign back in.</div>
            </div>
            <Btn variant="danger" onClick={logout}>
              Logout
            </Btn>
          </div>
        </GlassCard>
      </div>
    </>
  );
}
