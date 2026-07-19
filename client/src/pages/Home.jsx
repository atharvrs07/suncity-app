import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api';
import { useAuth } from '../auth';
import { GlassCard, Chip, StaggerList, StaggerItem } from '../components/Glass';
import { roleLabel, NOTICE_CATEGORIES, catMeta } from '../constants';

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [notices, setNotices] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [complaints, dues, noticeData, eventData, approvals] = await Promise.all([
        api('/api/complaints').catch(() => null),
        api('/api/dues/mine').catch(() => null),
        api('/api/notices').catch(() => null),
        api('/api/events').catch(() => null),
        user.role === 'admin' ? api('/api/approvals').catch(() => null) : Promise.resolve(null),
      ]);
      if (!live) return;
      const openCount = complaints
        ? complaints.complaints.filter((c) => ['open', 'in_progress'].includes(c.status)).length
        : 0;
      const unpaid = dues ? dues.dues.filter((d) => ['pending', 'overdue'].includes(d.status)).length : 0;
      setStats({
        openCount,
        unpaid,
        pendingApprovals: approvals ? approvals.pending.length : null,
        manager: complaints ? complaints.can_manage : false,
      });
      if (noticeData) setNotices(noticeData.notices.slice(0, 3));
      if (eventData) {
        const today = new Date().toISOString().slice(0, 10);
        setEvents(eventData.events.filter((e) => e.event_date && e.event_date >= today).slice(-2).reverse());
      }
    })();
    return () => {
      live = false;
    };
  }, [user.role]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <StaggerList>
      <StaggerItem>
        <div style={{ marginBottom: 4 }}>
          <h1 className="page-title">
            {greeting}, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="page-sub">
            {roleLabel(user)}
            {user.flat_no ? ` · Flat ${user.flat_no}` : ''}
          </p>
        </div>
      </StaggerItem>

      <StaggerItem>
        <div className="grid-2">
          <Link to="/complaints">
            <GlassCard className="stat-tile">
              <div className="n">{stats ? stats.openCount : '–'}</div>
              <div className="l">{stats && stats.manager ? 'Open complaints' : 'My open complaints'}</div>
            </GlassCard>
          </Link>
          {stats && stats.pendingApprovals !== null ? (
            <Link to="/approvals">
              <GlassCard className="stat-tile">
                <div className="n">{stats.pendingApprovals}</div>
                <div className="l">Pending approvals</div>
              </GlassCard>
            </Link>
          ) : (
            <Link to="/dues">
              <GlassCard className="stat-tile">
                <div className="n">{stats ? stats.unpaid : '–'}</div>
                <div className="l">Dues to pay</div>
              </GlassCard>
            </Link>
          )}
        </div>
      </StaggerItem>

      <StaggerItem>
        <div className="row-between" style={{ marginTop: 8 }}>
          <h2 className="title-sm">📢 Latest notices</h2>
          <Link to="/notices" className="muted">
            See all
          </Link>
        </div>
      </StaggerItem>
      {notices.map((n) => {
        const cat = NOTICE_CATEGORIES.find((c) => c.value === n.category);
        return (
          <StaggerItem key={n.id}>
            <GlassCard>
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
          </StaggerItem>
        );
      })}

      {events.length > 0 && (
        <>
          <StaggerItem>
            <div className="row-between" style={{ marginTop: 8 }}>
              <h2 className="title-sm">🎉 Upcoming events</h2>
              <Link to="/events" className="muted">
                See all
              </Link>
            </div>
          </StaggerItem>
          {events.map((e) => (
            <StaggerItem key={e.id}>
              <GlassCard>
                <div className="row-between">
                  <span className="title-sm">{e.heading}</span>
                  <Chip tone="purple">{fmtDate(e.event_date)}</Chip>
                </div>
              </GlassCard>
            </StaggerItem>
          ))}
        </>
      )}
    </StaggerList>
  );
}
