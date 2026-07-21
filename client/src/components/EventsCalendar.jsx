import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtDate } from '../api';
import { GlassCard, Chip, Segmented } from './Glass';

// Month calendar of society events (item 10) with a Past / Upcoming toggle. Event
// days are highlighted; tapping one selects it and filters the list below.
// Reused on the Home screen and the Events page. `onEventClick(ev)` lets the host
// decide what a tapped event does (navigate, or open the edit sheet).
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function EventsCalendar({ events = [], onEventClick }) {
  const { t } = useTranslation();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [filter, setFilter] = useState('upcoming');
  const [selected, setSelected] = useState(null);
  const today = now.toISOString().slice(0, 10);

  const dated = useMemo(() => events.filter((e) => e.event_date), [events]);
  const byDay = useMemo(() => {
    const map = {};
    for (const e of dated) (map[e.event_date] || (map[e.event_date] = [])).push(e);
    return map;
  }, [dated]);

  const filtered = useMemo(() => {
    const list = dated.filter((e) => (filter === 'upcoming' ? e.event_date >= today : e.event_date < today));
    list.sort((a, b) => (filter === 'upcoming' ? a.event_date.localeCompare(b.event_date) : b.event_date.localeCompare(a.event_date)));
    return list;
  }, [dated, filter, today]);

  const listShown = selected ? byDay[selected] || [] : filtered;

  const monthStart = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = monthStart.getDay();
  const monthName = monthStart.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const move = (delta) => {
    setSelected(null);
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <GlassCard>
      <div style={{ marginBottom: 10 }}>
        <Segmented
          options={[
            { value: 'upcoming', label: t('home.upcomingEvents') },
            { value: 'past', label: t('home.pastEvents') },
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setSelected(null);
          }}
        />
      </div>

      <div className="cal-head">
        <button className="cal-nav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <span className="title-sm">{monthName}</span>
        <button className="cal-nav" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>

      <div className="cal-grid">
        {DOW.map((d, i) => (
          <div key={`dow-${i}`} className="cal-dow">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`b-${i}`} className="cal-cell blank" />;
          const iso = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const has = !!byDay[iso];
          const isToday = iso === today;
          const isSel = iso === selected;
          return (
            <div
              key={iso}
              className={`cal-cell ${has ? 'has-event' : ''} ${isToday ? 'today' : ''}`}
              style={isSel ? { outline: '2px solid var(--purple)' } : undefined}
              onClick={has ? () => setSelected(isSel ? null : iso) : undefined}
            >
              {d}
              {has && <span className="evdot" />}
            </div>
          );
        })}
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        {listShown.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>
            {selected ? 'No events on this day.' : filter === 'upcoming' ? 'No upcoming events.' : 'No past events.'}
          </p>
        )}
        {listShown.map((e) => (
          <div
            key={e.id}
            className="row-between card-press"
            style={{ padding: '6px 2px', cursor: onEventClick ? 'pointer' : 'default' }}
            onClick={onEventClick ? () => onEventClick(e) : undefined}
          >
            <span className="title-sm">{e.heading}</span>
            <Chip tone={e.event_date >= today ? 'purple' : 'gray'}>{fmtDate(e.event_date)}</Chip>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
