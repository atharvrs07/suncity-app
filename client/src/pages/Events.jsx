import { useState } from 'react';
import { api, fmtDate, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Sheet, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';

export default function Events() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch('/api/events');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ heading: '', details: '', event_date: '', photo: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canPost = data ? data.can_post : false;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('heading', form.heading);
      fd.append('details', form.details);
      if (form.event_date) fd.append('event_date', form.event_date);
      if (form.photo) fd.append('photo', form.photo);
      await api('/api/events', { method: 'POST', form: fd });
      setShowNew(false);
      setForm({ heading: '', details: '', event_date: '', photo: null });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(ev) {
    if (!confirm('Delete this event?')) return;
    try {
      await api(`/api/events/${ev.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Society Events</h1>
          <p className="page-sub">What's happening in Suncity Vistaar</p>
        </div>
        {canPost && <Btn onClick={() => setShowNew(true)}>+ Event</Btn>}
      </div>

      {loading && <Spinner />}
      {!loading && data && data.events.length === 0 && (
        <Empty emoji="🎪" title="No events yet" sub="Celebrations and gatherings will show up here." />
      )}

      <StaggerList>
        {data &&
          data.events.map((ev) => {
            const upcoming = ev.event_date && ev.event_date >= today;
            const canEdit = user.role === 'admin' || ev.posted_by === user.id;
            return (
              <StaggerItem key={ev.id}>
                <GlassCard>
                  {ev.photo && <img className="thumb" src={ev.photo} alt={ev.heading} style={{ maxHeight: 240, marginBottom: 10 }} />}
                  <div className="row-between">
                    <span className="title-sm">{ev.heading}</span>
                    {ev.event_date && (
                      <Chip tone={upcoming ? 'purple' : 'gray'}>
                        {upcoming ? '🗓️ ' : ''}
                        {fmtDate(ev.event_date)}
                      </Chip>
                    )}
                  </div>
                  {ev.details && (
                    <p style={{ marginTop: 7, fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{ev.details}</p>
                  )}
                  <div className="row-between" style={{ marginTop: 9 }}>
                    <span className="tiny">
                      Posted by {ev.poster_name} · {fmtDateTime(ev.created_at)}
                    </span>
                    {canPost && canEdit && (
                      <Btn variant="danger" sm onClick={() => remove(ev)}>
                        Delete
                      </Btn>
                    )}
                  </div>
                </GlassCard>
              </StaggerItem>
            );
          })}
      </StaggerList>

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="New Event">
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="EVENT HEADING">
            <input
              className="input"
              value={form.heading}
              onChange={(e) => setForm((f) => ({ ...f, heading: e.target.value }))}
              required
            />
          </Field>
          <Field label="DETAILS (OPTIONAL)">
            <textarea
              className="textarea"
              value={form.details}
              onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
            />
          </Field>
          <Field label="EVENT DATE (OPTIONAL)">
            <input
              className="input"
              type="date"
              value={form.event_date}
              onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
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
            {busy ? 'Posting…' : 'Post Event'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}
