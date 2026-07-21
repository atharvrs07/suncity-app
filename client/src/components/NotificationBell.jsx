import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, fmtDateTime } from '../api';
import { Sheet, Btn, Empty } from './Glass';

// Navbar notification bell (item 4). Polls the unread count for the badge, and on
// open loads the history (most recent first) with read/unread state. Clicking a
// notification marks it read and navigates to the linked tab.
export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const timer = useRef(null);

  const loadCount = useCallback(() => {
    api('/api/notifications/unread-count')
      .then((d) => setUnread(d.unread || 0))
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    api('/api/notifications')
      .then((d) => {
        setItems(d.notifications || []);
        setUnread(d.unread || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCount();
    timer.current = setInterval(loadCount, 45000); // lightweight poll for the badge
    return () => clearInterval(timer.current);
  }, [loadCount]);

  const openSheet = () => {
    setOpen(true);
    loadList();
  };

  const markAllRead = () => {
    api('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
    setItems((list) => list.map((n) => ({ ...n, read: 1 })));
    setUnread(0);
  };

  const onClickItem = (n) => {
    if (!n.read) {
      api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <button className="icon-btn" onClick={openSheet} aria-label={t('notifications.title')}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('notifications.title')}>
        {items.length > 0 && (
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span className="muted">{unread} {t('notifications.unread')}</span>
            <Btn variant="ghost" sm onClick={markAllRead}>
              {t('notifications.markAllRead')}
            </Btn>
          </div>
        )}
        {items.length === 0 ? (
          <Empty emoji="🔔" title={t('notifications.empty')} />
        ) : (
          <div>
            {items.map((n) => (
              <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => onClickItem(n)}>
                <span className={`notif-dot ${n.read ? 'read' : ''}`} />
                <div className="grow">
                  <div className="nt">{n.title}</div>
                  {n.body && <div className="nb">{n.body}</div>}
                  <div className="ntime">{fmtDateTime(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
