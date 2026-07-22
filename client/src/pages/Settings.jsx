import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, fmtDate, fmtDateTime } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { GlassCard, Btn, Chip, Field, PasswordInput, Segmented } from '../components/Glass';
import Avatar from '../components/Avatar';
import { roleLabel, capitalizeName } from '../constants';

// Human "2h 14m" / "8m" from a seconds count (session durations).
function fmtDuration(sec) {
  if (!sec || sec < 60) return `${sec || 0}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState({ name: user.name, flat_no: user.flat_no || '', email: user.email || '' });
  const [pwd, setPwd] = useState({ current_password: '', new_password: '' });
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyPwd, setBusyPwd] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    api('/api/auth/sessions').then(setActivity).catch(() => {});
  }, []);

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

  async function uploadAvatar(file) {
    if (!file) return;
    setBusyAvatar(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const d = await api('/api/auth/me/avatar', { method: 'POST', form: fd });
      setUser({ ...user, avatar: d.avatar });
      setMsg({ ok: true, text: 'Profile picture updated' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusyAvatar(false);
    }
  }

  async function removeAvatar() {
    setBusyAvatar(true);
    try {
      await api('/api/auth/me/avatar', { method: 'DELETE' });
      setUser({ ...user, avatar: null });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusyAvatar(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-sub">Profile, appearance & account</p>
        </div>
      </div>

      {msg && <div className={msg.ok ? 'ok-banner' : 'err-banner'}>{msg.text}</div>}

      <div className="stack">
        {/* Profile picture (item 16) */}
        <GlassCard>
          <div className="row" style={{ gap: 14 }}>
            <Avatar name={user.name} src={user.avatar} size="lg" />
            <div className="grow">
              <div className="title-sm">{t('settings.profilePicture')}</div>
              <div className="muted">Visible to everyone in the society.</div>
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  {busyAvatar ? '…' : t('settings.changePhoto')}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => uploadAvatar(e.target.files[0])}
                  />
                </label>
                {user.avatar && (
                  <Btn variant="danger" sm onClick={removeAvatar} disabled={busyAvatar}>
                    {t('common.remove')}
                  </Btn>
                )}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Appearance (item 5). Language now lives in the header (item 6). */}
        <GlassCard>
          <div className="title-sm" style={{ marginBottom: 8 }}>🎨 {t('settings.appearance')}</div>
          <Segmented
            options={[
              { value: 'light', label: `☀️ ${t('theme.light')}` },
              { value: 'dark', label: `🌙 ${t('theme.dark')}` },
            ]}
            value={theme}
            onChange={setTheme}
          />
          <p className="tiny" style={{ marginTop: 10 }}>
            🌐 {t('settings.language')} — use the Eng / Hin selector in the top bar.
          </p>
        </GlassCard>

        {/* Profile details */}
        <GlassCard>
          <div className="row" style={{ marginBottom: 14 }}>
            <Avatar name={user.name} src={user.avatar} />
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
            <Field label="EMAIL (USED FOR PASSWORD RECOVERY & RECEIPTS)">
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

        {/* Session activity (item 17) */}
        <GlassCard>
          <div className="title-sm" style={{ marginBottom: 10 }}>📊 {t('settings.sessionActivity')}</div>
          {activity ? (
            <>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div>
                  <div className="tiny">{t('settings.lastLogin')}</div>
                  <div className="bold">{activity.meta?.last_login_at ? fmtDateTime(activity.meta.last_login_at) : '—'}</div>
                </div>
                <div>
                  <div className="tiny">{t('settings.memberSince')}</div>
                  <div className="bold">{activity.meta?.created_at ? fmtDate(activity.meta.created_at) : '—'}</div>
                </div>
              </div>
              {activity.meta?.login_count != null && (
                <p className="muted" style={{ marginBottom: 8 }}>{activity.meta.login_count} total logins</p>
              )}
              <div className="title-sm" style={{ fontSize: 13.5, margin: '6px 0' }}>{t('settings.recentSessions')}</div>
              {(activity.sessions || []).slice(0, 5).map((s) => (
                <div key={s.id} className="row-between" style={{ padding: '5px 0', borderBottom: '1px solid rgba(120,130,170,0.14)' }}>
                  <span className="tiny">{fmtDateTime(s.started_at)}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{fmtDuration(s.duration_seconds)}</span>
                </div>
              ))}
              {(activity.sessions || []).length === 0 && <p className="muted">This is your first tracked session.</p>}
            </>
          ) : (
            <p className="muted">{t('common.loading')}</p>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="title-sm" style={{ marginBottom: 12 }}>🔐 Change password</h2>
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
              {t('nav.logout')}
            </Btn>
          </div>
        </GlassCard>
      </div>
    </>
  );
}
