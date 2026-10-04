// @ts-check

import { CONFIG } from './config.js';
import { init, session, signOutOfGoogle } from './auth.js';
import { sessionKey, signOut as endSession, signOutEverywhere as endEverySession, onSessionEnded } from './api.js';
import { el, $ } from './dom.js';
import * as store from './store/store.js';
import { updatedText } from './freshness.js';
import { VERSION } from './version.js';
import { watchForUpdates } from './update.js';
import { inFrame, FRAMED_MESSAGE } from './guard.js';
import { watchInstall, onInstallChange } from './install.js';
import { SCREENS, placeholder } from './views/placeholders.js';
import { settings } from './views/settings.js';
import { todayScreen } from './views/today.js';

/**
 * The Rival (docs/PROJECT_BRIEF.md). Starts the app, signs in, loads this phone's copy, keeps it in
 * step with the sheet, and sends each address to its screen:
 *   #/today  #/business  #/reading  #/progress  #/showdown   the five tabs
 *   #/settings                                               behind the gear
 */

const IDS = SCREENS.map((s) => s.id);

/** The screen from the address. */
function route() {
  const screen = window.location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
  return screen === 'settings' || IDS.includes(screen) ? screen : 'today';
}

let signedIn = false;

/** Draws the current screen. */
function show() {
  if (!signedIn) return;
  const screen = route();
  const main = $('main');
  if (screen === 'settings') settings(main, { signOut, signOutEverywhere });
  else if (screen === 'today') todayScreen(main);
  else placeholder(main, /** @type {import('./views/placeholders.js').Screen} */ (SCREENS.find((s) => s.id === screen)));
  document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('data-tab') === screen)));
  $('gear').setAttribute('aria-current', String(screen === 'settings'));
  showSyncState();
}

/**
 * The header's right: how fresh this phone's copy is ("09:14 ↻", tap to re-read the sheet), and
 * the badge: offline, or a problem.
 */
function showSyncState() {
  const updated = updatedText(store.status, Date.now());
  $('updated').textContent = updated.short;
  $('refresh').setAttribute('aria-label', updated.label);
  $('refresh').title = updated.label;
  $('refresh').hidden = false;
  $('gear').hidden = false;
  const badge = $('sync');
  const s = store.status;
  const text = !s.online ? 'Offline' : s.error ? 'Not updated' : '';
  badge.textContent = text;
  badge.hidden = text === '';
  badge.className = `badge ${!s.online ? 'offline' : s.error ? 'problem' : 'busy'}`;
  badge.title = !s.online ? 'Offline · view only: saving needs a connection' : s.error ?? '';
}

/**
 * Ends this account's sign-in on every device (a lost phone), then clears this phone as signing
 * out does. Needs a connection: answers why it failed, or null.
 * @returns {Promise<string|null>}
 */
async function signOutEverywhere() {
  try {
    const r = await endEverySession();
    if (!r.ok) return r.errors.map((e) => e.message).join('; ');
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  await clearThisPhone();
  return null;
}

async function signOut() {
  await endSession();
  await clearThisPhone();
}

async function clearThisPhone() {
  signOutOfGoogle();
  await store.forget();
  signedIn = false;
  window.location.hash = '#/today';
  window.location.reload();
}

/** @param {string} message */
function showError(message) {
  $('main').replaceChildren(el('p', { class: 'error' }, message));
}

async function start() {
  // GitHub Pages cannot forbid framing: refuse to run inside another page (app-kit's guard.js).
  if (inFrame()) { showError(FRAMED_MESSAGE); return; }
  // Chrome offers to install once, early: listen before anything else (app-kit's install.js, ADR-016).
  watchInstall();
  onInstallChange(() => show());
  // When the server ends this phone's session (expired, "sign out all devices" elsewhere, or the account
  // no longer allowed), the saved copy goes too, and the app starts again at sign-in.
  onSessionEnded(async () => { await store.forget(); window.location.reload(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* works without it */ });
  // The app opens from its saved copy; a newer published version reloads the page into it, never over an open form.
  const checkForUpdate = watchForUpdates({ running: VERSION, busy: () => Boolean(document.querySelector('dialog[open]')) });
  if (!CONFIG.apiUrl || !CONFIG.clientId) {
    showError('This app is not configured yet (config.js): see the README.');
    return;
  }

  $('tabs').replaceChildren(...SCREENS.map((s) => el('a', { href: `#/${s.id}`, 'data-tab': s.id }, s.label)));
  $('sync').addEventListener('click', () => { window.location.hash = '#/settings'; });
  // Tapping the time and ↻ re-reads the sheet now (reads only), and checks for a newer version of the app.
  $('refresh').addEventListener('click', () => {
    checkForUpdate(true);
    if (signedIn) store.refresh().catch(() => { /* shown in the header */ });
  });
  window.addEventListener('hashchange', () => { show(); window.scrollTo(0, 0); });
  store.onChange(() => show());

  let hasCopy = false;
  try {
    hasCopy = await store.load();
  } catch (e) {
    showError(`This phone's storage could not be opened: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // A signed-in phone with a saved copy opens at once, even offline; Google is only needed to sign in.
  if (!session()) {
    if (!navigator.onLine) { showError('Connect to the internet to sign in the first time.'); return; }
    $('main').replaceChildren(el('p', { class: 'muted' }, 'Sign in with your Google account to use the app.'));
    try {
      await init(CONFIG.clientId, $('signin'));
      await sessionKey();
    } catch (e) {
      showError(`Could not sign in: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    $('signin').replaceChildren();
  } else {
    // Ready for when the session expires and Google is needed again.
    init(CONFIG.clientId, $('signin')).then(() => $('signin').replaceChildren()).catch(() => { /* offline: the saved session is used */ });
  }

  signedIn = true;
  if (hasCopy) show();
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  store.keepInStep();
  try {
    await store.refresh();
  } catch (e) {
    if (!hasCopy) showError(store.status.online ? `Could not load: ${store.status.error}` : 'Offline: connect once to load the data.');
  }
  if (store.status.user) show();
}

start();
