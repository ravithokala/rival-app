// @ts-check

import { el, uk } from '../dom.js';
import { VERSION } from '../version.js';
import { status, data, saveSetting, exportAll, today } from '../store/store.js';
import { Schedule } from '../shared/schedule.js';
import { Dates } from '../shared/dates.js';
import { toast } from './sheet.js';
import { applyTheme, savedTheme } from '../theme.js';
import { systemSection } from './system.js';
import { loadTimeText } from '../freshness.js';
import { installState, install, installHint } from '../install.js';

/**
 * Settings, behind the gear: account, the Sheet, data status, appearance, system check. Reminder
 * times, phase unlocks, export and the reminders file arrive with their milestones.
 * @param {HTMLElement} main
 * @param {{ signOut: () => Promise<void>, signOutEverywhere: () => Promise<string|null> }} actions  signOutEverywhere answers why it failed
 */
export function settings(main, actions) {
  const synced = status.lastSynced ? new Date(status.lastSynced) : null;

  const themeChoice = (/** @type {string} */ value, /** @type {string} */ label) => el('button', { type: 'button', 'aria-pressed': String(savedTheme() === value),
    onclick: () => { applyTheme(value); settings(main, actions); } }, label);

  main.replaceChildren(
    el('h1', { class: 'screen-title' }, 'Settings'),
    planSection(() => settings(main, actions)),
    el('section', { class: 'card' },
      el('h2', {}, 'Data'),
      el('p', {}, status.online ? 'Your Google Sheet is the main copy; this phone keeps a copy for quick opening.' : 'Offline: you can view everything; saving needs a connection.'),
      el('p', { class: 'muted small' }, synced ? `Updated from the sheet ${uk(synced.toISOString().slice(0, 10))} at ${synced.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : 'Not updated yet.',
        status.error ? ` Last problem: ${status.error}` : ''),
      status.sheetUrl ? el('a', { class: 'menu-link', href: status.sheetUrl, target: '_blank', rel: 'noopener' }, 'Open the Google Sheet', el('span', { class: 'chevron' }, '›')) : ''),
    el('section', { class: 'card' },
      el('h2', {}, 'Appearance'),
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'Theme' }, themeChoice('auto', 'Auto'), themeChoice('light', 'Light'), themeChoice('dark', 'Dark'))),
    systemSection(),
    el('section', { class: 'card' },
      el('h2', {}, 'Account'),
      el('p', {}, status.user ? `Signed in as ${status.user}.` : 'Signed in.'),
      el('div', { class: 'actions start' },
        el('button', { class: 'button', type: 'button', onclick: actions.signOut }, 'Sign out of this phone'),
        // A lost phone: ends this account's sign-in on every device, this one included.
        el('button', { class: 'button danger', type: 'button', onclick: async () => {
          if (!window.confirm('Sign out on every device where you are signed in, including this one?')) return;
          const problem = await actions.signOutEverywhere();
          if (problem) toast(`Could not sign out all devices: ${problem}`);
        } }, 'Sign out all devices'))),
    el('section', { class: 'card' },
      el('h2', {}, 'Export'),
      el('p', { class: 'muted small' }, 'Everything in your Sheet as one JSON file, for your own records. Needs a connection.'),
      el('div', { class: 'actions start' }, el('button', { class: 'button', type: 'button', onclick: download }, 'Export all data (JSON)'))),
    el('section', { class: 'card coming' },
      el('h2', {}, 'Coming later'),
      el('ul', { class: 'plain-list' },
        el('li', {}, 'Reminder times and the reminders calendar file (Milestone 5)'))),
    // At the bottom, out of the way: needed once per phone (RT, 2026-10-04).
    installSection(),
    // Where a slow open spends its time (as the other apps): the last refresh from the sheet.
    el('p', { class: 'version' }, `Version ${VERSION}`, status.timing ? el('span', { class: 'load-time' }, loadTimeText(status.timing)) : ''));
}

/**
 * Install this app (ADR-016): Android Chrome's ⋮ menu refuses a second app from ravithokala.github.io,
 * so the app offers its own button (app-kit's install.js). At the bottom of Settings; nothing is
 * drawn once the app runs from its icon.
 */
function installSection() {
  const state = installState();
  if (state === 'installed') return '';
  return el('section', { class: 'card install' },
    el('h2', {}, 'Install this app'),
    state === 'ready'
      ? [el('p', {}, 'Adds The Rival to your home screen, so it opens full screen and works offline.'),
        el('button', { class: 'button primary', type: 'button', onclick: async () => {
          const outcome = await install();
          if (outcome === 'accepted') toast('Installing… look for The Rival on your home screen.');
        } }, 'Install this app')]
      : el('p', { class: 'muted small' }, installHint()));
}

/**
 * Your plan: the Rival's name, when week 1 starts, and tracks unlocked early ("I have a guitar"). Other
 * values (points, the schedule) are edited in the Sheet.
 * @param {() => void} redraw
 */
function planSection(redraw) {
  /** @param {string} key @param {string} value @param {string} done */
  const save = async (key, value, done) => {
    const r = await saveSetting(key, value);
    toast(r.ok ? done : r.message);
    if (r.ok) redraw();
  };
  const name = /** @type {HTMLInputElement} */ (el('input', { type: 'text', maxlength: '30', value: data.settings.rival_name ?? '', 'aria-label': "The Rival's name" }));
  const start = /** @type {HTMLInputElement} */ (el('input', { type: 'date', value: data.settings.start_date ?? '', 'aria-label': 'Start date (week 1)' }));
  const early = Schedule.unlockedEarly(data.settings);
  const day = today();
  const locked = data.tracks.filter((t) => !t.paused && (early.includes(t.track_id) || !Schedule.trackOpen(t, data.settings, day)));
  return el('section', { class: 'card' },
    el('h2', {}, 'Your plan'),
    el('label', { class: 'field' }, "The Rival's name",
      el('div', { class: 'inline' }, name, el('button', { class: 'button', type: 'button', onclick: () => save('rival_name', name.value, 'Name saved.') }, 'Save'))),
    el('label', { class: 'field' }, 'Week 1 starts',
      el('div', { class: 'inline' }, start, el('button', { class: 'button', type: 'button', onclick: () => save('start_date', start.value, 'Start date saved.') }, 'Save'))),
    data.settings.start_date ? el('p', { class: 'muted small' }, `Week 1 is the week of ${Dates.shortDay(Dates.weekStart(data.settings.start_date))}.`) : '',
    locked.length ? [el('h3', { class: 'check-group' }, 'Unlock early'),
      el('ul', { class: 'plain-rows' }, locked.map((t) => {
        const on = early.includes(t.track_id);
        const label = t.track_id === 'guitar' ? (on ? 'I have a guitar ✓' : 'I have a guitar') : on ? `${t.name}: unlocked early` : `Unlock ${t.name} now`;
        const next = on ? early.filter((id) => id !== t.track_id) : [...early, t.track_id];
        return el('li', {}, el('button', { class: `button${on ? '' : ' primary'}`, type: 'button', 'aria-pressed': String(on),
          onclick: () => save('unlocked_tracks', next.join(','), on ? `${t.name} back to its unlock week.` : `${t.name} unlocked.`) }, label),
        el('span', { class: 'muted small' }, ` opens in week ${t.unlock_week ?? 1}`));
      }))] : '',
    el('p', { class: 'muted small' }, 'Points and the weekly schedule are edited in the Sheet (Rules and Schedule tabs).'));
}

async function download() {
  const r = await exportAll();
  if (!r.ok) { toast(r.message); return; }
  const file = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
  const link = /** @type {HTMLAnchorElement} */ (el('a', { href: URL.createObjectURL(file), download: `the-rival-${new Date().toISOString().slice(0, 10)}.json` }));
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  toast('Export downloaded.');
}
