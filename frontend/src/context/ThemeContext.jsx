/* eslint-disable react-refresh/only-export-components -- provider + hook in one file, same shape as AuthContext */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'learnprep-theme';

const DEFAULT_THEME = 'fantasy';

/**
 * Single source of truth for the theme list. Every `id` must also appear in the
 * `themes:` option of the daisyui plugin in index.css; a name that is only in
 * one of the two places produces no CSS and the page renders blank.
 */
export const THEMES = [
  { id: 'fantasy', label: 'Light' },
  { id: 'learnprep-dark', label: 'Dark' }
];

const THEME_IDS = THEMES.map((t) => t.id);

// localStorage can throw (private mode / disabled storage), so every access is guarded.
const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEME_IDS.includes(value) ? value : null;
  } catch {
    return null;
  }
};

const writeStored = (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode can block writes, theme just will not persist */
  }
};

const ThemeContext = createContext(null);

/** Single owner of the theme so every copy of the picker reads the same value. */
export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => readStored() || DEFAULT_THEME);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStored(theme);
  }, [theme]);

  // Guarded so a stale value from an older build cannot reach the DOM.
  const setTheme = (next) => {
    if (THEME_IDS.includes(next)) setThemeState(next);
  };

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};

export default ThemeContext;
