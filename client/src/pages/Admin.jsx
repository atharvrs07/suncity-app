import { useState } from 'react';
import { api, fmtMoney } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Toggle, Sheet, Segmented, Empty, Spinner, StaggerList, StaggerItem, PasswordInput } from '../components/Glass';
import { roleLabel, BLOCKS } from '../constants';
import BlockHousePicker from '../components/BlockHousePicker';

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

const emptyEdit = { name: '', phone: '', email: '', block: '', house_no: '', password: '' };

function UsersTab() {
  const { user: me } = useAuth();
  const { data, loading, reload } = useFetch('/api/users');
  const [resetResult, setResetResult] = useState(null); // { user, password }
  const [copied, setCopied] = useState(false);
  const [blockFilter, setBlockFilter] = useState('all');
  const [editing, setEditing] = useState(null); // the user being edited, or null
  const [form, setForm] = useState(emptyEdit);
  const [editErr, setEditErr] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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

  function openEdit(u) {
    setForm({
      name: u.name || '',
      phone: u.phone || '',
      email: u.email || '',
      block: u.block || '',
      house_no: u.house_no || '',
      password: '',
    });
    setEditErr('');
    setEditing(u);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    setEditErr('');
    // Send only what changed (and the password only if a new one was typed) so
    // untouched, format-sensitive fields aren't needlessly re-validated.
    const body = {};
    for (const k of ['name', 'phone', 'email', 'block', 'house_no']) {
      if ((form[k] || '') !== (editing[k] || '')) body[k] = form[k];
    }
    if (form.password) body.password = form.password;
    if (Object.keys(body).length === 0) {
      setEditing(null);
      setSavingEdit(false);
      return;
    }
    try {
      await api(`/api/users/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      reload();
    } catch (err) {
      setEditErr(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteUser(u) {
    if (!confirm(`Permanently delete ${u.name}'s account? This also removes their complaints, dues and Lost & Found posts. This cannot be undone.`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: 'DELETE' });
      setEditing(null);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <Spinner />;

  const allUsers = data ? data.users : [];
  const visible = blockFilter === 'all' ? allUsers : allUsers.filter((u) => u.block === blockFilter);

  return (
    <>
      <div className="row-between" style={{ marginBottom: 12, gap: 10 }}>
        <p className="muted">
          {visible.length} {visible.length === 1 ? 'account' : 'accounts'}
          {blockFilter !== 'all' ? ` in ${blockFilter}` : ''}
        </p>
        <select
          className="input"
          style={{ width: 'auto', maxWidth: 190 }}
          value={blockFilter}
          onChange={(e) => setBlockFilter(e.target.value)}
        >
          <option value="all">All blocks</option>
          {BLOCKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 && (
        <Empty emoji="🏢" title="No accounts in this block" sub="Try a different block or clear the filter." />
      )}

      <StaggerList>
        {visible.map((u) => (
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
                  {u.block ? ` · 🏢 ${u.block}` : ''}
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
                  <Btn variant="ghost" sm onClick={() => openEdit(u)}>
                    ✏️ Edit
                  </Btn>
                  <Btn variant="ghost" sm onClick={() => resetPassword(u)}>
                    🔑 Reset Password
                  </Btn>
                </div>
              </GlassCard>
            </StaggerItem>
          ))}
      </StaggerList>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}` : ''}>
        {editing && (
          <>
            {editErr && <div className="err-banner">{editErr}</div>}
            <form onSubmit={saveEdit}>
              <Field label="NAME">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </Field>
              {/* Office bearers sign in by username, so phone is optional for them. */}
              <Field label={editing.username ? 'PHONE NUMBER (OPTIONAL)' : 'PHONE NUMBER'}>
                <input
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="10-digit mobile number"
                />
              </Field>
              <Field label="EMAIL (OPTIONAL)">
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                />
              </Field>
              {/* Block/house apply to residents; other roles have no society flat. */}
              {editing.role === 'resident' && (
                <BlockHousePicker
                  block={form.block}
                  houseNo={form.house_no}
                  onBlockChange={(v) => setForm((f) => ({ ...f, block: v }))}
                  onHouseNoChange={(v) => setForm((f) => ({ ...f, house_no: v }))}
                />
              )}
              <Field label="SET NEW PASSWORD (OPTIONAL)">
                <PasswordInput
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to keep current password"
                />
              </Field>
              <Btn block disabled={savingEdit} type="submit">
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </Btn>
            </form>

            {editing.role === 'resident' && editing.id !== me.id && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <p className="tiny" style={{ marginBottom: 8 }}>
                  Deleting removes the account and all of its complaints, dues and Lost &amp; Found posts. This
                  can't be undone.
                </p>
                <Btn block variant="danger" onClick={() => deleteUser(editing)}>
                  Delete this account
                </Btn>
              </div>
            )}
          </>
        )}
      </Sheet>

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
