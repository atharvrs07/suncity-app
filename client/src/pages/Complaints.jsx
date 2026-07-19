import { useState } from 'react';
import { api, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Sheet, Segmented, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUS, catMeta } from '../constants';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function Complaints() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch('/api/complaints');
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ category: 'street_light', title: '', description: '', photo: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const complaints = data ? data.complaints.filter((c) => filter === 'all' || c.status === filter) : [];
  const canManage = data ? data.can_manage : false;

  async function submitNew(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('category', form.category);
      fd.append('title', form.title);
      fd.append('description', form.description);
      if (form.photo) fd.append('photo', form.photo);
      await api('/api/complaints', { method: 'POST', form: fd });
      setShowNew(false);
      setForm({ category: 'street_light', title: '', description: '', photo: null });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id, status) {
    try {
      await api(`/api/complaints/${id}/status`, { method: 'PATCH', body: { status } });
      setSelected(null);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Complaints</h1>
          <p className="page-sub">{canManage ? 'Manage society complaints' : 'Raise and track your complaints'}</p>
        </div>
        <Btn onClick={() => setShowNew(true)}>+ New</Btn>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {loading && <Spinner />}
      {!loading && complaints.length === 0 && (
        <Empty emoji="🎈" title="No complaints here" sub="Everything looks peaceful right now." />
      )}

      <StaggerList>
        {complaints.map((c) => {
          const cat = catMeta(c.category);
          const st = COMPLAINT_STATUS[c.status];
          return (
            <StaggerItem key={c.id}>
              <GlassCard onClick={() => setSelected(c)}>
                <div className="row-between">
                  <span className="title-sm">
                    {cat.emoji} {c.title}
                  </span>
                  <Chip tone={st.tone}>{st.label}</Chip>
                </div>
                <p className="muted" style={{ marginTop: 5 }}>
                  {cat.label}
                  {canManage ? ` · ${c.resident_name}${c.resident_flat ? ` (${c.resident_flat})` : ''}` : ''}
                </p>
                <p className="tiny" style={{ marginTop: 4 }}>
                  {fmtDateTime(c.created_at)}
                </p>
              </GlassCard>
            </StaggerItem>
          );
        })}
      </StaggerList>

      {/* detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? selected.title : ''}>
        {selected && (
          <div className="stack">
            <div className="row wrap">
              <Chip tone="blue">
                {catMeta(selected.category).emoji} {catMeta(selected.category).label}
              </Chip>
              <Chip tone={COMPLAINT_STATUS[selected.status].tone}>{COMPLAINT_STATUS[selected.status].label}</Chip>
            </div>
            {canManage && (
              <p className="muted">
                Raised by <b>{selected.resident_name}</b>
                {selected.resident_flat ? ` · Flat ${selected.resident_flat}` : ''} ·{' '}
                <a href={`tel:${selected.resident_phone}`}>📞 {selected.resident_phone}</a>
              </p>
            )}
            <p style={{ fontSize: 14.5, lineHeight: 1.55 }}>{selected.description}</p>
            {selected.photo && <img className="thumb" src={selected.photo} alt="complaint" />}
            <p className="tiny">Submitted {fmtDateTime(selected.created_at)}</p>
            {canManage && (
              <div className="row wrap">
                {selected.status !== 'in_progress' && (
                  <Btn variant="ghost" sm onClick={() => setStatus(selected.id, 'in_progress')}>
                    🔧 Start Work
                  </Btn>
                )}
                {selected.status !== 'resolved' && (
                  <Btn variant="success" sm onClick={() => setStatus(selected.id, 'resolved')}>
                    ✓ Resolve
                  </Btn>
                )}
                {selected.status !== 'closed' && (
                  <Btn variant="ghost" sm onClick={() => setStatus(selected.id, 'closed')}>
                    Close
                  </Btn>
                )}
                {selected.status === 'closed' && (
                  <Btn variant="ghost" sm onClick={() => setStatus(selected.id, 'open')}>
                    Reopen
                  </Btn>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* new complaint sheet */}
      <Sheet open={showNew} onClose={() => setShowNew(false)} title="New Complaint">
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submitNew}>
          <Field label="CATEGORY">
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="TITLE">
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Short summary"
              required
            />
          </Field>
          <Field label="DESCRIPTION">
            <textarea
              className="textarea"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the issue, location, and any details"
              required
            />
          </Field>
          <Field label="PHOTO (OPTIONAL)">
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setForm((f) => ({ ...f, photo: e.target.files[0] || null }))}
            />
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Submitting…' : 'Submit Complaint'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}
