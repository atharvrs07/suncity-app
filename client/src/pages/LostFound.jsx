import { useState } from 'react';
import { api, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Sheet, Segmented, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'lost', label: 'Lost' },
  { value: 'found', label: 'Found' },
];

export default function LostFound() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch('/api/lostfound');
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ type: 'lost', title: '', description: '', location: '', contact_phone: '', photo: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const items = data ? data.items.filter((i) => filter === 'all' || i.type === filter) : [];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      for (const k of ['type', 'title', 'description', 'location', 'contact_phone']) fd.append(k, form[k]);
      if (form.photo) fd.append('photo', form.photo);
      await api('/api/lostfound', { method: 'POST', form: fd });
      setShowNew(false);
      setForm({ type: 'lost', title: '', description: '', location: '', contact_phone: '', photo: null });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(item) {
    try {
      await api(`/api/lostfound/${item.id}/resolve`, { method: 'PATCH' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(item) {
    if (!confirm('Delete this post?')) return;
    try {
      await api(`/api/lostfound/${item.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Lost &amp; Found</h1>
          <p className="page-sub">Reunite things with their owners</p>
        </div>
        <Btn onClick={() => setShowNew(true)}>+ Post</Btn>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {loading && <Spinner />}
      {!loading && items.length === 0 && (
        <Empty emoji="🧦" title="Nothing here" sub="Lost or found something? Post it for the society." />
      )}

      <StaggerList>
        {items.map((item) => {
          const canManage = user.role === 'admin' || item.posted_by === user.id;
          return (
            <StaggerItem key={item.id}>
              <GlassCard style={{ opacity: item.status === 'resolved' ? 0.55 : 1 }}>
                <div className="row-between">
                  <span className="title-sm">{item.title}</span>
                  <div className="row">
                    {item.status === 'resolved' && <Chip tone="green">Resolved</Chip>}
                    <Chip tone={item.type === 'lost' ? 'red' : 'green'}>
                      {item.type === 'lost' ? '😟 Lost' : '🎁 Found'}
                    </Chip>
                  </div>
                </div>
                {item.photo && <img className="thumb" src={item.photo} alt={item.title} style={{ marginTop: 9, maxHeight: 220 }} />}
                {item.description && (
                  <p style={{ marginTop: 7, fontSize: 14.5, lineHeight: 1.5 }}>{item.description}</p>
                )}
                <p className="muted" style={{ marginTop: 6 }}>
                  {item.location ? `📍 ${item.location} · ` : ''}
                  {item.contact_phone && <a href={`tel:${item.contact_phone}`}>📞 {item.contact_phone}</a>}
                </p>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="tiny">
                    {item.poster_name}
                    {item.poster_flat ? ` (${item.poster_flat})` : ''} · {fmtDateTime(item.created_at)}
                  </span>
                  {canManage && (
                    <div className="row">
                      {item.status === 'active' && (
                        <Btn variant="success" sm onClick={() => resolve(item)}>
                          ✓ Resolved
                        </Btn>
                      )}
                      <Btn variant="danger" sm onClick={() => remove(item)}>
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

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Post Lost / Found Item">
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <div style={{ marginBottom: 13 }}>
            <Segmented
              options={[
                { value: 'lost', label: '😟 I lost something' },
                { value: 'found', label: '🎁 I found something' },
              ]}
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v }))}
            />
          </div>
          <Field label="WHAT IS IT?">
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Black wallet, house keys"
              required
            />
          </Field>
          <Field label="DETAILS (OPTIONAL)">
            <textarea
              className="textarea"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label="LOCATION (OPTIONAL)">
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Where was it lost/found?"
            />
          </Field>
          <Field label="CONTACT PHONE (DEFAULTS TO YOURS)">
            <input
              className="input"
              type="tel"
              value={form.contact_phone}
              onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              placeholder="Leave blank to use your number"
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
            {busy ? 'Posting…' : 'Post'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}
