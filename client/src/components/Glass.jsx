import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export function GlassCard({ children, className = '', onClick, ...rest }) {
  return (
    <div className={`glass card ${onClick ? 'card-press' : ''} ${className}`} onClick={onClick} {...rest}>
      {children}
    </div>
  );
}

export function Btn({ children, variant = 'primary', sm, block, className = '', ...rest }) {
  return (
    <button
      className={`btn btn-${variant} ${sm ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ children, tone = 'gray' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Field({ label, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

const EyeIcon = ({ off }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.8" />
    {off && <line x1="4" y1="20" x2="20" y2="4" />}
  </svg>
);

// Password input with a show/hide (eye) toggle. Drop-in replacement for
// <input className="input" type="password" /> inside a <Field>.
export function PasswordInput({ className = '', ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pwd-wrap">
      <input className={`input ${className}`} type={show ? 'text' : 'password'} {...rest} />
      <button
        type="button"
        className="pwd-eye"
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow((s) => !s)}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <div className="row-between" style={{ marginBottom: 13 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <label className="switch">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" />
      </label>
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }) {
  // Portal to <body> so the fixed-position sheet is viewport-relative even when
  // it's mounted inside an ancestor with backdrop-filter/transform (e.g. the
  // topbar), which would otherwise become its containing block and clip it.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="sheet-grab" />
            {title && <div className="sheet-title">{title}</div>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function Empty({ emoji = '🌤️', title, sub }) {
  return (
    <div className="glass empty">
      <span className="e">{emoji}</span>
      <div className="t">{title}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};

export const listItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', damping: 24, stiffness: 300 } },
};

export function StaggerList({ children, className = 'stack' }) {
  return (
    <motion.div className={className} variants={listStagger} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children }) {
  return <motion.div variants={listItem}>{children}</motion.div>;
}
