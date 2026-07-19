import { useState } from 'react';
import { api, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Toggle, Sheet, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import { NOTICE_CATEGORIES, roleLabel } from '../constants';

export default function Notices() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch('/api/notices');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', category: 'general', pinned: false, admin_only: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canPost = data ? data.can_post : false;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/notices', { method: 'POST', body: form });
      setShowNew(false);
      setForm({ title: '', body: '', category: 'general', pinned: false, admin_only: false });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(n) {
    try {
      await api(`/api/notices/${n.id}/pin`, { method: 'PATCH' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(n) {
    if (!confirm('Delete this notice?')) return;
    try {
      await api(`/api/notices/${n.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Notices</h1>
          <p className="page-sub">Society announcements</p>
        </div>
        {canPost && <Btn onClick={() => setShowNew(true)}>+ Post</Btn>}
      </div>

      {loading && <Spinner />}
      {!loading && data && data.notices.length === 0 && (
        <Empty emoji="📭" title="No notices yet" sub="Announcements will appear here." />
      )}

      <StaggerList>
        {data &&
          data.notices.map((n) => {
            const cat = NOTICE_CATEGORIES.find((c) => c.value === n.category);
            const canEdit = user.role === 'admin' || n.posted_by === user.id;
            return (
              <StaggerItem key={n.id}>
                <GlassCard>
                  <div className="row-between">
                    <span className="title-sm">
                      {n.pinned ? '📌 ' : ''}
                      {n.title}
                    </span>
                    <div className="row">
                      {!!n.admin_only && <Chip tone="red">Admin only</Chip>}
                      <Chip tone={cat ? cat.tone : 'blue'}>{cat ? cat.label : n.category}</Chip>
                    </div>
                  </div>
                  <p style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</p>
                  <div className="row-between" style={{ marginTop: 10 }}>
                    <span className="tiny">
                      {n.poster_name} ({roleLabel({ role: n.poster_role, role_detail: n.poster_role_detail })}) ·{' '}
                      {fmtDateTime(n.created_at)}
                    </span>
                    {canPost && canEdit && (
                      <div className="row">
                        <Btn variant="ghost" sm onClick={() => togglePin(n)}>
                          {n.pinned ? 'Unpin' : 'Pin'}
                        </Btn>
                        <Btn variant="danger" sm onClick={() => remove(n)}>
                          Delete
                        </Btn>
                      </div>
                    )}
                  </div>
                </GlassCard>
              </StaggerItem>
            );
          })}
      </StaggerList>

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Post a Notice">
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="TITLE">
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </Field>
          <Field label="NOTICE">
            <textarea
              className="textarea"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              required
            />
          </Field>
          <Field label="CATEGORY">
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {NOTICE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Toggle label="📌 Pin to top" checked={form.pinned} onChange={(v) => setForm((f) => ({ ...f, pinned: v }))} />
          {user.role === 'admin' && (
            <Toggle
              label="🔒 Admin-only notice"
              checked={form.admin_only}
              onChange={(v) => setForm((f) => ({ ...f, admin_only: v }))}
            />
          )}
          <Btn block disabled={busy} type="submit">
            {busy ? 'Posting…' : 'Post Notice'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}
