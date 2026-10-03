// Sets the saved theme before the page draws (a plain script in <head>, so no flash of the wrong
// theme). pwa/theme.js changes it later.
try {
  var saved = localStorage.getItem('tr.theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch (e) { /* follow the phone */ }
