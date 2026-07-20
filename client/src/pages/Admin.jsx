import { useState } from 'react';
import { api, fmtMoney } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Toggle, Sheet, Segmented, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import { roleLabel } from '../constants';

const TABS = [
  { value: 'automations', label: 'Automated Dues' },
  { value: 'users', label: 'Users' },
  { value: 'society', label: 'Society' },
];

export default function Admin() {
  const [tab, setTab] = useState('automations');
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-sub">System settings & management</p>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'society' && <SocietyTab />}
    </>
  );
}

function AutomationsTab() {
  const { data, loading, reload } = useFetch('/api/automations');
  const [editing, setEditing] = useState(null); // null | 'new' | automation object
  const [form, setForm] = useState({ name: '', amount: '', trigger_day: 1, window_days: 10, active: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function openNew() {
    setForm({ name: '', amount: '', trigger_day: 1, window_days: 10, active: true });
    setError('');
    setEditing('new');
  }

  function openEdit(a) {
    setForm({ name: a.name, amount: a.amount, trigger_day: a.trigger_day, window_days: a.window_days, active: !!a.active });
    setError('');
    setEditing(a);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') {
        await api('/api/automations', { method: 'POST', body: form });
      } else {
        await api(`/api/automations/${editing.id}`, { method: 'PATCH', body: form });
      }
      setEditing(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runNow(a) {
    try {
      const r = await api(`/api/automations/${a.id}/run`, { method: 'POST' });
      alert(r.message);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleActive(a) {
    try {
      await api(`/api/automations/${a.id}`, { method: 'PATCH', body: { active: !a.active } });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(a) {
    if (!confirm(`Delete automation "${a.name}"? Existing dues stay untouched.`)) return;
    try {
      await api(`/api/automations/${a.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <p className="muted">Recurring dues are auto-created for all approved residents.</p>
        <Btn sm onClick={openNew}>
          + New Rule
        </Btn>
      </div>

      {loading && <Spinner />}
      {!loading && data && data.automations.length === 0 && (
        <Empty emoji="🤖" title="No automation rules" sub="Create one to generate monthly maintenance dues automatically." />
      )}

      <StaggerList>
        {data &&
          data.automations.map((a) => (
            <StaggerItem key={a.id}>
              <GlassCard>
                <div className="row-between">
                  <span className="title-sm">{a.name}</span>
                  <label className="switch">
                    <input type="checkbox" checked={!!a.active} onChange={() => toggleActive(a)} />
                    <span className="track" />
                  </label>
                </div>
                <p className="muted" style={{ marginTop: 5 }}>
                  {fmtMoney(a.amount)} · day {a.trigger_day} of every month · {a.window_days}-day payment window
                </p>
                {a.last_run_at && (
                  <p className="tiny" style={{ marginTop: 4 }}>
                    Last run {new Date(a.last_run_at).toLocaleString('en-IN')}
                  </p>
                )}
                <div className="row" style={{ marginTop: 10 }}>
                  <Btn variant="ghost" sm onClick={() => runNow(a)}>
                    ▶ Run Now
                  </Btn>
                  <Btn variant="ghost" sm onClick={() => openEdit(a)}>
                    Edit
                  </Btn>
                  <Btn variant="danger" sm onClick={() => remove(a)}>
                    Delete
                  </Btn>
                </div>
              </GlassCard>
            </StaggerItem>
          ))}
      </StaggerList>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New Automation Rule' : 'Edit Automation Rule'}
      >
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="NAME">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Monthly Maintenance"
              required
            />
          </Field>
          <Field label="AMOUNT (₹)">
            <input
              className="input"
              type="number"
              min="1"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </Field>
          <div className="grid-2">
            <Field label="TRIGGER DAY (1-31)">
              <input
                className="input"
                type="number"
                min="1"
                max="31"
                value={form.trigger_day}
                onChange={(e) => setForm((f) => ({ ...f, trigger_day: e.target.value }))}
                required
              />
            </Field>
            <Field label="PAYMENT WINDOW (DAYS)">
              <input
                className="input"
                type="number"
                min="1"
                max="90"
                value={form.window_days}
                onChange={(e) => setForm((f) => ({ ...f, window_days: e.target.value }))}
                required
              />
            </Field>
          </div>
          <Toggle label="Active" checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          <Btn block disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Save Rule'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const { data, loading, reload } = useFetch('/api/users');
  const [resetResult, setResetResult] = useState(null); // { user, password }
  const [copied, setCopied] = useState(false);

  async function setStatus(u, status) {
    const verb = status === 'approved' ? 'Enable' : 'Disable';
    if (!confirm(`${verb} ${u.name}'s account?`)) return;
    try {
      await api(`/api/users/${u.id}/status`, { method: 'PATCH', body: { status } });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function resetPassword(u) {
    const who = u.id === me.id ? 'your own' : `${u.name}'s`;
    if (!confirm(`Reset ${who} password? A new random password is generated and the old one stops working immediately.`)) return;
    try {
      const r = await api(`/api/users/${u.id}/reset-password`, { method: 'POST' });
      setCopied(false);
      setResetResult({ user: u, password: r.password });
    } catch (err) {
      alert(err.message);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(resetResult.password);
      setCopied(true);
    } catch {
      /* clipboard unavailable (e.g. plain http) — password stays visible to copy manually */
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <StaggerList>
        {data &&
          data.users.map((u) => (
            <StaggerItem key={u.id}>
              <GlassCard>
                <div className="row-between">
                  <span className="title-sm">
                    {u.name}
                    {u.id === me.id ? ' (you)' : ''}
                  </span>
                  <Chip tone={u.status === 'approved' ? 'green' : u.status === 'pending' ? 'orange' : 'red'}>
                    {u.status}
                  </Chip>
                </div>
                <p className="muted" style={{ marginTop: 4 }}>
                  {roleLabel(u)} · {u.phone ? `📱 ${u.phone}` : `@${u.username || '—'}`}
                  {u.email ? ` · ✉️ ${u.email}` : ''}
                  {u.flat_no ? ` · Flat ${u.flat_no}` : ''}
                </p>
                <div className="row" style={{ marginTop: 9 }}>
                  {u.id !== me.id && u.status !== 'approved' && (
                    <Btn variant="success" sm onClick={() => setStatus(u, 'approved')}>
                      Enable
                    </Btn>
                  )}
                  {u.id !== me.id && u.status === 'approved' && (
                    <Btn variant="danger" sm onClick={() => setStatus(u, 'rejected')}>
                      Disable
                    </Btn>
                  )}
                  <Btn variant="ghost" sm onClick={() => resetPassword(u)}>
                    🔑 Reset Password
                  </Btn>
                </div>
              </GlassCard>
            </StaggerItem>
          ))}
      </StaggerList>

      <Sheet
        open={!!resetResult}
        onClose={() => setResetResult(null)}
        title={resetResult ? `New password for ${resetResult.user.name}` : ''}
      >
        {resetResult && (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              Share it with them securely — it is shown only this once. They can change it later under
              Settings.
            </p>
            <div
              className="input"
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, textAlign: 'center', userSelect: 'all' }}
            >
              {resetResult.password}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Btn block onClick={copyPassword}>
                {copied ? '✓ Copied' : 'Copy Password'}
              </Btn>
              <Btn block variant="ghost" onClick={() => setResetResult(null)}>
                Done
              </Btn>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

function SocietyTab() {
  const { data, loading } = useFetch('/api/dues/upi-config');
  if (loading) return <Spinner />;
  return (
    <GlassCard>
      <h2 className="title-sm">💳 UPI collection details</h2>
      <p className="muted" style={{ marginTop: 8 }}>
        VPA: <b>{data ? data.vpa : '—'}</b>
      </p>
      <p className="muted" style={{ marginTop: 4 }}>
        Payee name: <b>{data ? data.payee_name : '—'}</b>
      </p>
      <p className="tiny" style={{ marginTop: 10 }}>
        These come from SOCIETY_UPI_VPA and SOCIETY_UPI_PAYEE_NAME in the server's .env file. Payment QR codes
        shown to residents are generated from these values.
      </p>
    </GlassCard>
  );
}
