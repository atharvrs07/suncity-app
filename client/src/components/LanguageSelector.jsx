import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { setLanguage, LANGUAGES } from '../i18n';
import { getPlatform } from '../platform';

// Header language selector (item 6). Always visible in the top bar, showing a
// compact indicator ("Eng" / "Hin"). Tapping it opens a picker whose styling is
// platform-native: an iOS liquid-glass action sheet, an Android Material bottom
// sheet, or a plain anchored dropdown on desktop/other. Detection uses the
// shared getPlatform() util (user-agent based).
const SHORT = { en: 'Eng', hi: 'Hin' };

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const btnRef = useRef(null);
  const platform = useRef(getPlatform()).current; // stable for the session
  const current = i18n.language && i18n.language.startsWith('hi') ? 'hi' : 'en';

  const place = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next && platform === 'desktop') place();
      return next;
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    let reflow;
    if (platform === 'desktop') {
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
  }, [open, platform, place, close]);

  const pick = (code) => {
    setLanguage(code);
    setOpen(false);
  };

  const rows = LANGUAGES.map((l) => (
    <button
      key={l.code}
      className={`lang-opt ${l.code === current ? 'active' : ''}`}
      onClick={() => pick(l.code)}
    >
      <span className="lang-opt-label">{l.label}</span>
      <span className="lang-opt-short">{SHORT[l.code] || l.code}</span>
      {l.code === current && <span className="lang-opt-check" aria-hidden>✓</span>}
    </button>
  ));

  let panel = null;
  if (open) {
    if (platform === 'ios') {
      // iOS liquid-glass action sheet: grouped options card + a separate Cancel.
      panel = (
        <motion.div
          className="lang-ios-wrap"
          initial={{ y: '110%' }}
          animate={{ y: 0 }}
          exit={{ y: '110%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        >
          <div className="lang-ios-card">
            <div className="lang-ios-title">Language</div>
            {rows}
          </div>
          <button className="lang-ios-cancel" onClick={close}>Cancel</button>
        </motion.div>
      );
    } else if (platform === 'android') {
      // Android Material bottom sheet: elevated surface, left-aligned list.
      panel = (
        <motion.div
          className="lang-android-sheet"
          initial={{ y: '110%' }}
          animate={{ y: 0 }}
          exit={{ y: '110%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        >
          <div className="lang-android-handle" />
          <div className="lang-android-title">Select language</div>
          {rows}
        </motion.div>
      );
    } else {
      // Desktop/other: anchored dropdown/popover.
      panel = (
        <motion.div
          className="lang-menu"
          style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          {rows}
        </motion.div>
      );
    }
  }

  const dimOverlay = platform === 'ios' || platform === 'android';

  return (
    <>
      <button
        ref={btnRef}
        className="lang-btn"
        onClick={toggle}
        aria-label="Change language"
        aria-expanded={open}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
        <span className="lang-btn-txt">{SHORT[current]}</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                className={`lang-overlay ${dimOverlay ? 'dim' : ''}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={close}
              />
              {panel}
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
