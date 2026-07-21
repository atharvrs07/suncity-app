import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';
import { menuFor, roleLabel } from '../constants';
import { Btn } from './Glass';
import Avatar from './Avatar';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const items = menuFor(user);
  const current = items.find((m) => m.path === location.pathname);
  const label = (m) => (m.labelKey ? t(m.labelKey) : m.label);

  return (
    <>
      <header className="topbar">
        <button className="hamburger" aria-label="Open menu" onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-title">{current ? label(current) : t('brand.app')}</div>
        <div className="topbar-actions">
          <NotificationBell />
          <ThemeToggle />
          <NavLink to="/settings" aria-label={t('nav.settings')}>
            <Avatar name={user.name} src={user.avatar} />
          </NavLink>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="drawer"
              initial={{ x: '-105%' }}
              animate={{ x: 0 }}
              exit={{ x: '-105%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="drawer-brand">
                <img className="brand-logo" src="/imgs/logo.png" alt="" />
                <div>
                  <div className="name">{t('brand.app')}</div>
                  <div className="tag">{t('brand.tagline')}</div>
                </div>
              </div>
              <nav className="drawer-nav">
                {items.map((m) => (
                  <NavLink
                    key={m.path}
                    to={m.path}
                    end={m.path === '/'}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="emoji">{m.emoji}</span>
                    {label(m)}
                  </NavLink>
                ))}
              </nav>
              <div className="drawer-user">
                <Avatar name={user.name} src={user.avatar} />
                <div className="who">
                  <div className="nm">{user.name}</div>
                  <div className="rl">{roleLabel(user)}</div>
                </div>
                <Btn variant="ghost" sm onClick={logout}>
                  {t('nav.logout')}
                </Btn>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          className="page"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </>
  );
}
