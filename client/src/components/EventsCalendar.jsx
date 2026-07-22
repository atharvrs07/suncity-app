import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtDate, fmtTime } from '../api';
import { GlassCard, Chip, Segmented, Sheet } from './Glass';

// Month calendar of society events (items 10 + 3/4). A Past / Upcoming toggle
// (Past shown first) filters the list below. Any day with one or more events —
// past or upcoming — renders bold with a dot indicator; tapping it opens a
// bottom sheet listing that day's events with their times, in chronological
// order. Reused on the Home screen and the Events page. `onEventClick(ev)` lets
// the host decide what a tapped event does (navigate, or open the edit sheet).
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Chronological within a day: timed events first (ascending), untimed last.
const byTime = (a, b) => (a.event_time || '99:99').localeCompare(b.event_time || '99:99');

export default function EventsCalendar({ events = [], onEventClick }) {
  const { t } = useTranslation();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [filter, setFilter] = useState('upcoming');
  const [daySheet, setDaySheet] = useState(null); // ISO date whose events are shown in the bottom sheet
  const today = now.toISOString().slice(0, 10);

  const dated = useMemo(() => events.filter((e) => e.event_date), [events]);
  const byDay = useMemo(() => {
    const map = {};
    for (const e of dated) (map[e.event_date] || (map[e.event_date] = [])).push(e);
    for (const k of Object.keys(map)) map[k].sort(byTime);
    return map;
  }, [dated]);

  const filtered = useMemo(() => {
    const list = dated.filter((e) => (filter === 'upcoming' ? e.event_date >= today : e.event_date < today));
    list.sort((a, b) =>
      filter === 'upcoming'
        ? a.event_date.localeCompare(b.event_date) || byTime(a, b)
        : b.event_date.localeCompare(a.event_date) || byTime(a, b)
    );
    return list;
  }, [dated, filter, today]);

  const monthStart = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = monthStart.getDay();
  const monthName = monthStart.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const move = (delta) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayEvents = daySheet ? byDay[daySheet] || [] : [];

  return (
    <GlassCard>
      <div style={{ marginBottom: 10 }}>
        <Segmented
          options={[
            { value: 'past', label: t('home.pastEvents') },
            { value: 'upcoming', label: t('home.upcomingEvents') },
          ]}
          value={filter}
          onChange={setFilter}
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
          return (
            <div
              key={iso}
              className={`cal-cell ${has ? 'has-event' : ''} ${isToday ? 'today' : ''}`}
              onClick={has ? () => setDaySheet(iso) : undefined}
              role={has ? 'button' : undefined}
              tabIndex={has ? 0 : undefined}
              aria-label={has ? `${byDay[iso].length} event(s) on ${fmtDate(iso)}` : undefined}
            >
              {d}
              {has && <span className="evdot" />}
            </div>
          );
        })}
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        {filtered.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>
            {filter === 'upcoming' ? 'No upcoming events.' : 'No past events.'}
          </p>
        )}
        {filtered.map((e) => (
          <div
            key={e.id}
            className="row-between card-press"
            style={{ padding: '6px 2px', cursor: onEventClick ? 'pointer' : 'default' }}
            onClick={onEventClick ? () => onEventClick(e) : undefined}
          >
            <span className="title-sm">{e.heading}</span>
            <Chip tone={e.event_date >= today ? 'purple' : 'gray'}>
              {fmtDate(e.event_date)}
              {e.event_time ? ` · ${fmtTime(e.event_time)}` : ''}
            </Chip>
          </div>
        ))}
      </div>

      {/* Bottom sheet: all events on a tapped date, with times, chronological. */}
      <Sheet open={!!daySheet} onClose={() => setDaySheet(null)} title={daySheet ? fmtDate(daySheet) : ''}>
        <div className="stack">
          {dayEvents.map((e) => (
            <div
              key={e.id}
              className="day-ev card-press"
              style={{ cursor: onEventClick ? 'pointer' : 'default' }}
              onClick={
                onEventClick
                  ? () => {
                      setDaySheet(null);
                      onEventClick(e);
                    }
                  : undefined
              }
            >
              <div className="day-ev-time">{e.event_time ? fmtTime(e.event_time) : 'All day'}</div>
              <div className="grow">
                <div className="title-sm">{e.heading}</div>
                {e.details && <p className="muted day-ev-details">{e.details}</p>}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </GlassCard>
  );
}
