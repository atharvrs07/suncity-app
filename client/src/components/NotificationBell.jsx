import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { api, fmtDateTime } from '../api';
import { useIsMobile } from '../platform';
import { Btn, Empty } from './Glass';

// Navbar notification bell (item 4). Polls the unread count for the badge and, on
// open, loads the history (most recent first) with read/unread state. Clicking a
// notification marks it read and navigates to the linked tab.
//
// The panel is a self-contained overlay so it opens and closes cleanly on every
// viewport (fixing the old bug where it slid into the navbar and got stuck):
//  - the bell toggles it (click again to close);
//  - clicking outside closes it (a full-screen overlay catches the click);
//  - on phones it opens as a bottom sheet with a visible Close button;
//  - on wider screens it opens as a dropdown anchored under the bell.
// Everything is portalled to <body> so no ancestor's backdrop-filter/transform
// can become its containing block and mis-anchor the fixed position.
export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [anchor, setAnchor] = useState(null); // { top, right } for the desktop dropdown
  const btnRef = useRef(null);
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

  // Position the desktop dropdown just under the bell, right-aligned to it.
  const place = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        place();
        loadList();
      }
      return next;
    });
  };

  // Keep the dropdown glued to the bell while open, and close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    let reflow;
    if (!isMobile) {
      reflow = () => place();
      window.addEventListener('resize', reflow);
      window.addEventListener('scroll', reflow, true);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      if (reflow) {
        window.removeEventListener('resize', reflow);
        window.removeEventListener('scroll', reflow, true);
      }
    };
  }, [open, isMobile, place, close]);

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

  const header = (
    <div className="row-between notif-head">
      <span className="notif-h-title">{t('notifications.title')}</span>
      <div className="row" style={{ gap: 6 }}>
        {items.length > 0 && (
          <Btn variant="ghost" sm onClick={markAllRead}>
            {t('notifications.markAllRead')}
          </Btn>
        )}
        <button className="notif-close" onClick={close} aria-label={t('common.close')}>✕</button>
      </div>
    </div>
  );

  const list =
    items.length === 0 ? (
      <Empty emoji="🔔" title={t('notifications.empty')} />
    ) : (
      <div className="notif-list">
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
    );

  return (
    <>
      <button
        ref={btnRef}
        className="icon-btn"
        onClick={toggle}
        aria-label={t('notifications.title')}
        aria-expanded={open}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                className={`notif-overlay ${isMobile ? 'dim' : ''}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={close}
              />
              {isMobile ? (
                <motion.div
                  className="notif-panel sheet-mode"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                >
                  <div className="sheet-grab" />
                  {header}
                  {list}
                </motion.div>
              ) : (
                <motion.div
                  className="notif-panel pop-mode"
                  style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  {header}
                  {list}
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
