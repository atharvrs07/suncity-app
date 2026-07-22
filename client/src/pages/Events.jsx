import { useEffect, useState } from 'react';
import { api, fmtDate, fmtDateTime, fmtTime } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Sheet, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import EventsCalendar from '../components/EventsCalendar';

const EMPTY = { heading: '', details: '', event_date: '', event_time: '', photo: null };

export default function Events() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch('/api/events');
  const [sheet, setSheet] = useState(null); // null | { mode:'new' } | { mode:'edit', ev }
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canPost = data ? data.can_post : false;
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const canEditEv = (ev) => canPost && (isAdmin || ev.posted_by === user.id);

  const openNew = () => {
    setForm(EMPTY);
    setError('');
    setSheet({ mode: 'new' });
  };
  const openEdit = (ev) => {
    setForm({ heading: ev.heading, details: ev.details || '', event_date: ev.event_date || '', event_time: ev.event_time || '', photo: null });
    setError('');
    setSheet({ mode: 'edit', ev });
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('heading', form.heading);
      fd.append('details', form.details);
      fd.append('event_date', form.event_date || '');
      fd.append('event_time', form.event_time || '');
      if (form.photo) fd.append('photo', form.photo);
      if (sheet.mode === 'edit') {
        await api(`/api/events/${sheet.ev.id}`, { method: 'PATCH', form: fd });
      } else {
        await api('/api/events', { method: 'POST', form: fd });
      }
      setSheet(null);
      setForm(EMPTY);
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
        {canPost && <Btn onClick={openNew}>+ Event</Btn>}
      </div>

      {loading && <Spinner />}

      {data && data.events.some((e) => e.event_date) && (
        <div style={{ marginBottom: 14 }}>
          <EventsCalendar events={data.events} onEventClick={(ev) => (canEditEv(ev) ? openEdit(ev) : null)} />
        </div>
      )}

      {!loading && data && data.events.length === 0 && (
        <Empty emoji="🎪" title="No events yet" sub="Celebrations and gatherings will show up here." />
      )}

      <StaggerList>
        {data &&
          data.events.map((ev) => {
            const upcoming = ev.event_date && ev.event_date >= today;
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
                        {ev.event_time ? ` · ${fmtTime(ev.event_time)}` : ''}
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
                    {canEditEv(ev) && (
                      <div className="row" style={{ gap: 6 }}>
                        <Btn variant="ghost" sm onClick={() => openEdit(ev)}>
                          Edit
                        </Btn>
                        <Btn variant="danger" sm onClick={() => remove(ev)}>
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

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet && sheet.mode === 'edit' ? 'Edit Event' : 'New Event'}>
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
          <div className="grid-2">
            <Field label="EVENT DATE (OPTIONAL)">
              <input
                className="input"
                type="date"
                value={form.event_date}
                onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
              />
            </Field>
            <Field label="TIME (OPTIONAL)">
              <input
                className="input"
                type="time"
                value={form.event_time}
                onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
              />
            </Field>
          </div>
          <span className="tiny" style={{ display: 'block', marginTop: -6, marginBottom: 8 }}>
            Add a time to run several events on the same day (e.g. 10:00 AM and 6:00 PM).
          </span>
          <Field label={sheet && sheet.mode === 'edit' ? 'REPLACE PHOTO (OPTIONAL)' : 'PHOTO (OPTIONAL)'}>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setForm((f) => ({ ...f, photo: e.target.files[0] || null }))}
            />
            <span className="tiny" style={{ marginTop: 4 }}>Event photos are also added to the Photo Gallery.</span>
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Saving…' : sheet && sheet.mode === 'edit' ? 'Save Changes' : 'Post Event'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}
