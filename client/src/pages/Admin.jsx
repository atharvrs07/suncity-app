import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, fmtMoney, fmtDate, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Toggle, Sheet, Segmented, Empty, Spinner, StaggerList, StaggerItem, PasswordInput } from '../components/Glass';
import {
  roleLabel,
  BLOCKS,
  OFFICE_BEARER_ROLES,
  OFFICE_BEARER_PERMISSIONS,
  SUPERVISOR_ROLES,
  permLabel,
  residentStatusLabel,
  capitalizeName,
} from '../constants';
import BlockHousePicker from '../components/BlockHousePicker';
import Avatar from '../components/Avatar';

// Roles an admin may assign from the editor (mirrors the server's ASSIGNABLE_ROLES).
const ROLE_OPTIONS = [
  { value: 'resident', label: 'Resident' },
  { value: 'office_bearer', label: 'Office Bearer' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' },
];

const TABS = [
  { value: 'automations', label: 'Automated Dues' },
  { value: 'users', label: 'Users' },
  { value: 'activity', label: 'Activity Log' },
  { value: 'society', label: 'Payments & QR' },
];

export default function Admin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('automations');
  return (
    <>
      <div className="page-head">
        <div>
          {/* Display label is "Control Panel" (item 12); routes/roles unchanged. */}
          <h1 className="page-title">{t('nav.controlPanel')}</h1>
          <p className="page-sub">System settings & management</p>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'activity' && <ActivityTab />}
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

const emptyEdit = { name: '', phone: '', email: '', resident_status: '', block: '', house_no: '', role: 'resident', role_detail: '', permissions: [], password: '' };

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
      resident_status: u.resident_status || '',
      block: u.block || '',
      house_no: u.house_no || '',
      role: u.role,
      role_detail: u.role_detail || '',
      permissions: Array.isArray(u.permissions) ? u.permissions : [],
      password: '',
    });
    setEditErr('');
    setEditing(u);
  }

  function togglePerm(key) {
    setForm((f) => {
      const has = f.permissions.includes(key);
      return { ...f, permissions: has ? f.permissions.filter((k) => k !== key) : [...f.permissions, key] };
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    setEditErr('');
    // Send only what changed (and the password only if a new one was typed) so
    // untouched, format-sensitive fields aren't needlessly re-validated.
    const body = {};
    for (const k of ['name', 'phone', 'email']) {
      if ((form[k] || '') !== (editing[k] || '')) body[k] = form[k];
    }
    if (form.role === 'resident') {
      for (const k of ['block', 'house_no', 'resident_status']) {
        if ((form[k] || '') !== (editing[k] || '')) body[k] = form[k];
      }
    }
    const roleChanged = form.role !== editing.role;
    if (roleChanged) body.role = form.role;
    if (form.role === 'office_bearer') {
      if (roleChanged || form.role_detail !== (editing.role_detail || '')) body.role_detail = form.role_detail;
      const cur = Array.isArray(editing.permissions) ? editing.permissions : [];
      const sel = form.permissions;
      const permsChanged = cur.length !== sel.length || sel.some((k) => !cur.includes(k));
      if (roleChanged || permsChanged) body.permissions = sel;
    } else if (form.role === 'supervisor') {
      if (roleChanged || form.role_detail !== (editing.role_detail || '')) body.role_detail = form.role_detail;
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
    if (
      !confirm(
        `Permanently delete ${u.name}'s account? Their complaints, dues and Lost & Found posts are removed; any notices/events/gallery/classifieds they posted are reassigned to you. This cannot be undone.`
      )
    )
      return;
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
                  <span className="title-sm row" style={{ gap: 8 }}>
                    <Avatar name={u.name} src={u.avatar} size="sm" />
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
                  {u.resident_status ? ` · 👤 ${residentStatusLabel(u.resident_status)}` : ''}
                </p>
                {u.last_active_at && (
                  <p className="tiny" style={{ marginTop: 3 }}>🕓 Last active {fmtDateTime(u.last_active_at)}</p>
                )}
                {u.role === 'office_bearer' && (
                  <p className="tiny" style={{ marginTop: 5 }}>
                    🔑{' '}
                    {Array.isArray(u.permissions) && u.permissions.length > 0
                      ? u.permissions.map(permLabel).join(', ')
                      : 'No permissions granted'}
                  </p>
                )}
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
                  onChange={(e) => setForm((f) => ({ ...f, name: capitalizeName(e.target.value) }))}
                  required
                />
              </Field>
              {/* Office bearers sign in by username, so phone is optional for them. */}
              <Field label={editing.username ? 'PHONE NUMBER (OPTIONAL)' : 'PHONE NUMBER'}>
                <input
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
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
              {/* Role — lets an admin promote/demote. Hidden for the super admin,
                  and locked when editing your own account. */}
              {editing.role !== 'super_admin' && (
                <Field label="ROLE">
                  <select
                    className="input"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    disabled={editing.id === me.id}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {form.role === 'office_bearer' && (
                <Field label="COMMITTEE POST">
                  <select
                    className="input"
                    value={form.role_detail}
                    onChange={(e) => setForm((f) => ({ ...f, role_detail: e.target.value }))}
                    required
                  >
                    <option value="" disabled>
                      Select a post
                    </option>
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
                  <select
                    className="input"
                    value={form.role_detail}
                    onChange={(e) => setForm((f) => ({ ...f, role_detail: e.target.value }))}
                    required
                  >
                    <option value="" disabled>
                      Select a type
                    </option>
                    {SUPERVISOR_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {form.role === 'office_bearer' && (
                <Field label="PERMISSIONS">
                  <div className="stack" style={{ gap: 6 }}>
                    {OFFICE_BEARER_PERMISSIONS.map((p) => (
                      <label key={p.key} className="row" style={{ gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(p.key)}
                          onChange={() => togglePerm(p.key)}
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                            {p.emoji} {p.label}
                          </span>
                          <span className="tiny" style={{ display: 'block' }}>
                            {p.desc}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
              )}

              {/* Status/block/house apply to residents; other roles have no society flat.
                  `ignore` keeps this resident's own current slot selectable. */}
              {form.role === 'resident' && (
                <BlockHousePicker
                  status={form.resident_status}
                  block={form.block}
                  houseNo={form.house_no}
                  onStatusChange={(v) => setForm((f) => ({ ...f, resident_status: v }))}
                  onBlockChange={(v) => setForm((f) => ({ ...f, block: v }))}
                  onHouseNoChange={(v) => setForm((f) => ({ ...f, house_no: v }))}
                  ignore={{ block: editing.block, houseNo: editing.house_no, status: editing.resident_status }}
                  statusRequired={false}
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

            {editing.role !== 'super_admin' && editing.id !== me.id && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <p className="tiny" style={{ marginBottom: 8 }}>
                  Deleting removes the account and its complaints, dues and Lost &amp; Found posts. Any notices,
                  events, gallery photos or classifieds it posted are reassigned to you. This can't be undone.
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

const ACTION_LABELS = {
  login: '🔑 Login',
  resident_signup: '🙋 Resident joined',
  staff_signup_request: '📝 Account request',
  approve: '✅ Approved',
  reject: '⛔ Rejected',
  user_edit: '✏️ Account edited',
  user_delete: '🗑️ Account deleted',
  user_enable: '✅ Account enabled',
  user_disable: '🚫 Account disabled',
  admin_reset_password: '🔑 Password reset (by admin)',
  password_change: '🔑 Password changed',
  password_reset: '🔑 Password reset',
  notice_post: '📢 Notice posted',
  notice_delete: '📢 Notice deleted',
  event_post: '🎉 Event posted',
  event_delete: '🎉 Event deleted',
  gallery_upload: '🖼️ Photo uploaded',
  gallery_delete: '🖼️ Photo removed',
  classified_post: '🏷️ Classified posted',
  classified_delete: '🏷️ Classified deleted',
  complaint_status: '📋 Complaint status',
  due_create: '💳 Due created',
  payment_verify: '💳 Payment verified',
  payment_reject: '💳 Payment rejected',
  lostfound_moderate_delete: '🔍 Lost & Found removed',
};
const prettyAction = (a) => ACTION_LABELS[a] || a;

function ActivityTab() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const { data, loading } = useFetch(`/api/audit?limit=250${q ? `&q=${encodeURIComponent(q)}` : ''}`);

  function submitSearch(e) {
    e.preventDefault();
    setQ(input.trim());
  }

  const entries = data ? data.entries : [];
  return (
    <>
      <form onSubmit={submitSearch} className="row" style={{ marginBottom: 12, gap: 8 }}>
        <input
          className="input"
          placeholder="Search by name, action or detail…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Btn sm type="submit">
          Search
        </Btn>
        {q && (
          <Btn
            sm
            variant="ghost"
            type="button"
            onClick={() => {
              setInput('');
              setQ('');
            }}
          >
            Clear
          </Btn>
        )}
      </form>

      {loading && <Spinner />}
      {!loading && entries.length === 0 && (
        <Empty emoji="🗒️" title="No activity yet" sub="Actions across the app will appear here." />
      )}

      <StaggerList>
        {entries.map((e) => (
          <StaggerItem key={e.id}>
            <GlassCard>
              <div className="row-between">
                <span className="title-sm">{prettyAction(e.action)}</span>
                <span className="tiny">{fmtDateTime(e.created_at)}</span>
              </div>
              <p className="muted" style={{ marginTop: 4 }}>
                {e.actor_name || 'system'}
                {e.actor_role ? ` · ${e.actor_role}` : ''}
              </p>
              {e.detail && (
                <p className="tiny" style={{ marginTop: 3 }}>
                  {e.detail}
                </p>
              )}
            </GlassCard>
          </StaggerItem>
        ))}
      </StaggerList>
    </>
  );
}

// Editable payment settings (item 21): VPA, payee, and an optional society-
// provided QR image. Stored in app_settings so they change without a redeploy.
function SocietyTab() {
  const { data, loading, reload } = useFetch('/api/settings/payment');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Hydrate the local form once the config loads.
  if (data && !form) setForm({ vpa: data.vpa || '', payee_name: data.payee_name || '' });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/settings/payment', { method: 'PATCH', body: form });
      setMsg({ ok: true, text: 'Payment details saved' });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function uploadQr(file) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('qr', file);
      await api('/api/settings/payment/qr', { method: 'POST', form: fd });
      setMsg({ ok: true, text: 'QR image updated' });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function clearQr() {
    setBusy(true);
    try {
      await api('/api/settings/payment/qr', { method: 'DELETE' });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !form) return <Spinner />;

  return (
    <div className="stack">
      {msg && <div className={msg.ok ? 'ok-banner' : 'err-banner'}>{msg.text}</div>}
      <GlassCard>
        <h2 className="title-sm" style={{ marginBottom: 10 }}>💳 UPI collection details</h2>
        <form onSubmit={save}>
          <Field label="UPI ID / VPA">
            <input
              className="input break-anywhere"
              value={form.vpa}
              onChange={(e) => setForm((f) => ({ ...f, vpa: e.target.value }))}
              placeholder="society@upi"
            />
          </Field>
          <Field label="PAYEE NAME">
            <input
              className="input"
              value={form.payee_name}
              onChange={(e) => setForm((f) => ({ ...f, payee_name: e.target.value }))}
              placeholder="My Suncity Vistaar"
            />
          </Field>
          <Btn disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Save Details'}
          </Btn>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="title-sm" style={{ marginBottom: 8 }}>🔳 Payment QR image</h2>
        <p className="tiny" style={{ marginBottom: 10 }}>
          Upload the society's official QR here. If none is set, a UPI QR is generated automatically from the VPA above.
        </p>
        {data.qr_image && (
          <div className="qr-frame" style={{ margin: '0 auto 12px' }}>
            <img src={data.qr_image} alt="Payment QR" />
          </div>
        )}
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {busy ? '…' : data.qr_image ? 'Replace QR' : 'Upload QR'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadQr(e.target.files[0])} />
          </label>
          {data.qr_image && (
            <Btn variant="danger" sm onClick={clearQr} disabled={busy}>
              Clear QR
            </Btn>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
