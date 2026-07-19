import { useState } from 'react';
import { api, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Sheet, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import { roleLabel } from '../constants';

export default function Classifieds() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch('/api/classifieds');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: '', contact_info: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/classifieds', { method: 'POST', body: form });
      setShowNew(false);
      setForm({ title: '', description: '', category: '', contact_info: '' });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c) {
    try {
      await api(`/api/classifieds/${c.id}/toggle`, { method: 'PATCH' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(c) {
    if (!confirm('Delete this listing?')) return;
    try {
      await api(`/api/classifieds/${c.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Classifieds</h1>
          <p className="page-sub">Committee-vetted listings & recommendations</p>
        </div>
        <Btn onClick={() => setShowNew(true)}>+ Post</Btn>
      </div>

      {loading && <Spinner />}
      {!loading && data && data.classifieds.length === 0 && (
        <Empty emoji="🏷️" title="No listings yet" sub="Post the first classified for the committee." />
      )}

      <StaggerList>
        {data &&
          data.classifieds.map((c) => {
            const canEdit = user.role === 'admin' || c.posted_by === user.id;
            return (
              <StaggerItem key={c.id}>
                <GlassCard style={{ opacity: c.active ? 1 : 0.55 }}>
                  <div className="row-between">
                    <span className="title-sm">{c.title}</span>
                    <div className="row">
                      {!c.active && <Chip tone="gray">Inactive</Chip>}
                      {c.category && <Chip tone="purple">{c.category}</Chip>}
                    </div>
                  </div>
                  <p style={{ marginTop: 7, fontSize: 14.5, lineHeight: 1.55 }}>{c.description}</p>
                  {c.contact_info && (
                    <p className="muted" style={{ marginTop: 6 }}>
                      📱 {c.contact_info}
                    </p>
                  )}
                  <div className="row-between" style={{ marginTop: 10 }}>
                    <span className="tiny">
                      {c.poster_name} ({roleLabel({ role: c.poster_role, role_detail: c.poster_role_detail })}) ·{' '}
                      {fmtDateTime(c.created_at)}
                    </span>
                    {canEdit && (
                      <div className="row">
                        <Btn variant="ghost" sm onClick={() => toggle(c)}>
                          {c.active ? 'Deactivate' : 'Activate'}
                        </Btn>
                        <Btn variant="danger" sm onClick={() => remove(c)}>
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

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="New Listing">
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
          <Field label="DESCRIPTION">
            <textarea
              className="textarea"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              required
            />
          </Field>
          <Field label="CATEGORY (OPTIONAL)">
            <input
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. For Sale, Service, Rental"
            />
          </Field>
          <Field label="CONTACT INFO (OPTIONAL)">
            <input
              className="input"
              value={form.contact_info}
              onChange={(e) => setForm((f) => ({ ...f, contact_info: e.target.value }))}
              placeholder="Phone / details"
            />
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Posting…' : 'Post Listing'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}
