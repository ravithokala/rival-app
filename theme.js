// @ts-check

/**
 * Light, dark, or follow the phone (auto), remembered on this phone. The page sets it before
 * drawing (theme-boot.js), so there is no flash of the wrong theme.
 */
const KEY = 'tr.theme';

export function savedTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch (e) {
    return 'auto';
  }
}

/** @param {string} value  auto, light or dark */
export function applyTheme(value) {
  try { localStorage.setItem(KEY, value); } catch (e) { /* not remembered */ }
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
}
