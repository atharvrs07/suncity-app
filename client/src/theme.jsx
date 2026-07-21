import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Light/Dark theme (item 5). The choice persists in localStorage and is applied
// as a `data-theme` attribute on <html>; styles.css defines light/dark variants
// of the existing design tokens off that attribute. Defaults to the app's
// original look ('light').
const ThemeContext = createContext(null);

const STORAGE_KEY = 'sv_theme';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : 'light';
  } catch {
    return 'light';
  }
}

function apply(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // Keep the PWA/browser status-bar colour in step with the theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#12141f' : '#eaf1ff');
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t) => setThemeState(t === 'dark' ? 'dark' : 'light'), []);
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext) || { theme: 'light', setTheme: () => {}, toggle: () => {} };
