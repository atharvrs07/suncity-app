import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, fmtMoney } from '../api';
import { useAuth } from '../auth';
import { GlassCard, Chip, StaggerList, StaggerItem } from '../components/Glass';
import PaymentQR from '../components/PaymentQR';
import EventsCalendar from '../components/EventsCalendar';
import { roleLabel, NOTICE_CATEGORIES, hasPerm } from '../constants';

// Quick actions surfaced on the home screen (item 18). Kept to what every user
// can reach; the drawer still holds the full menu.
const QUICK = [
  { path: '/complaints', emoji: '📋', label: 'Complaints' },
  { path: '/notices', emoji: '📢', label: 'Notices' },
  { path: '/lost-found', emoji: '🔍', label: 'Lost & Found' },
  { path: '/events', emoji: '🎉', label: 'Events' },
  { path: '/gallery', emoji: '🖼️', label: 'Gallery' },
  { path: '/dues', emoji: '💳', label: 'Dues' },
];

export default function Home() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dues, setDues] = useState(null);
  const [notices, setNotices] = useState([]);
  const [events, setEvents] = useState([]);
  const [openComplaints, setOpenComplaints] = useState(null);

  const manager = hasPerm(user, 'manage_dues');

  useEffect(() => {
    let live = true;
    (async () => {
      const [mine, noticeData, eventData, complaints] = await Promise.all([
        manager ? Promise.resolve(null) : api('/api/dues/mine').catch(() => null),
        api('/api/notices').catch(() => null),
        api('/api/events').catch(() => null),
        api('/api/complaints').catch(() => null),
      ]);
      if (!live) return;
      if (mine) setDues(mine.dues);
      if (noticeData) setNotices(noticeData.notices.slice(0, 3));
      if (eventData) setEvents(eventData.events);
      if (complaints)
        setOpenComplaints(complaints.complaints.filter((c) => ['open', 'in_progress'].includes(c.status)).length);
    })();
    return () => {
      live = false;
    };
  }, [manager]);

  const unpaid = dues ? dues.filter((d) => ['pending', 'overdue', 'submitted'].includes(d.status)) : [];
  const owed = unpaid.filter((d) => d.status !== 'submitted').reduce((s, d) => s + Number(d.amount), 0);

  return (
    <StaggerList>
      <StaggerItem>
        <div style={{ marginBottom: 4 }}>
          <h1 className="page-title">{t('home.greeting', { name: user.name.split(' ')[0] })} 👋</h1>
          <p className="page-sub">
            {roleLabel(user)}
            {user.flat_no ? ` · Flat ${user.flat_no}` : ''}
          </p>
        </div>
      </StaggerItem>

      {/* ── DUES CARD — always the topmost content element (item 18) ── */}
      <StaggerItem>
        <GlassCard className="card-press" onClick={() => navigate('/dues')}>
          <div className="row-between">
            <span className="title-sm">💳 {t('home.yourDues')}</span>
            <span className="more-link">{t('common.seeMore')} ›</span>
          </div>
          {manager ? (
            <p className="muted" style={{ marginTop: 8 }}>Open the dues manager to record and verify payments.</p>
          ) : owed > 0 ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 8 }}>{fmtMoney(owed)}</div>
              <p className="muted" style={{ marginTop: 2 }}>
                across {unpaid.filter((d) => d.status !== 'submitted').length} due(s) · {t('home.payNow')}
              </p>
            </>
          ) : unpaid.length > 0 ? (
            <p className="muted" style={{ marginTop: 8 }}>{unpaid.length} payment(s) awaiting verification.</p>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>✅ {t('home.allClear')}</p>
          )}
        </GlassCard>
      </StaggerItem>

      {/* ── Payment QR (item 21) — directly below the dues card ── */}
      {!manager && (
        <StaggerItem>
          <GlassCard>
            <div className="title-sm" style={{ marginBottom: 4 }}>{t('home.payTitle')}</div>
            <PaymentQR compact />
          </GlassCard>
        </StaggerItem>
      )}

      {/* ── Quick actions (item 18) ── */}
      <StaggerItem>
        <div className="row-between" style={{ marginTop: 4 }}>
          <h2 className="title-sm">⚡ {t('home.quickActions')}</h2>
        </div>
      </StaggerItem>
      <StaggerItem>
        <div className="grid-2">
          {QUICK.map((q) => (
            <Link key={q.path} to={q.path}>
              <GlassCard className="stat-tile card-press">
                <div style={{ fontSize: 22 }}>{q.emoji}</div>
                <div className="l" style={{ marginTop: 4 }}>
                  {q.label}
                  {q.path === '/complaints' && openComplaints != null ? ` · ${openComplaints} open` : ''}
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      </StaggerItem>

      {/* ── Events calendar (item 10) ── */}
      <StaggerItem>
        <div className="row-between" style={{ marginTop: 4 }}>
          <h2 className="title-sm">🗓️ {t('home.eventsCalendar')}</h2>
          <Link to="/events" className="more-link">{t('common.viewAll')} ›</Link>
        </div>
      </StaggerItem>
      <StaggerItem>
        <EventsCalendar events={events} onEventClick={() => navigate('/events')} />
      </StaggerItem>

      {/* ── Recent notices ── */}
      <StaggerItem>
        <div className="row-between" style={{ marginTop: 4 }}>
          <h2 className="title-sm">📢 {t('home.recentNotices')}</h2>
          <Link to="/notices" className="more-link">{t('common.viewAll')} ›</Link>
        </div>
      </StaggerItem>
      {notices.map((n) => {
        const cat = NOTICE_CATEGORIES.find((c) => c.value === n.category);
        return (
          <StaggerItem key={n.id}>
            <Link to="/notices">
              <GlassCard className="card-press">
                <div className="row-between">
                  <span className="title-sm">
                    {n.pinned ? '📌 ' : ''}
                    {n.title}
                  </span>
                  <Chip tone={cat ? cat.tone : 'blue'}>{cat ? cat.label : n.category}</Chip>
                </div>
                <p className="muted" style={{ marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {n.body}
                </p>
              </GlassCard>
            </Link>
          </StaggerItem>
        );
      })}
    </StaggerList>
  );
}
