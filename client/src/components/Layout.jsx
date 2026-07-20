import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../auth';
import { MENU, roleLabel } from '../constants';
import { Btn } from './Glass';

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const items = MENU.filter((m) => !m.roles || m.roles.includes(user.role));
  const current = items.find((m) => m.path === location.pathname);

  return (
    <>
      <header className="topbar">
        <button className="hamburger" aria-label="Open menu" onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-title">{current ? current.label : 'My Suncity Vistaar'}</div>
        <NavLink to="/settings" aria-label="Settings">
          <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
        </NavLink>
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
                  <div className="name">My Suncity Vistaar</div>
                  <div className="tag">Society, simplified</div>
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
                    {m.label}
                  </NavLink>
                ))}
              </nav>
              <div className="drawer-user">
                <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
                <div className="who">
                  <div className="nm">{user.name}</div>
                  <div className="rl">{roleLabel(user)}</div>
                </div>
                <Btn variant="ghost" sm onClick={logout}>
                  Logout
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
