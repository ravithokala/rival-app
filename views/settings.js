// @ts-check

import { el, uk } from '../dom.js';
import { VERSION } from '../version.js';
import { status } from '../store/store.js';
import { toast } from './sheet.js';
import { applyTheme, savedTheme } from '../theme.js';
import { systemSection } from './system.js';
import { loadTimeText } from '../freshness.js';

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
    el('section', { class: 'card coming' },
      el('h2', {}, 'Coming later'),
      el('ul', { class: 'plain-list' },
        el('li', {}, 'Rival name, reminder times and phase unlocks (Milestone 2)'),
        el('li', {}, 'Export all data as JSON (Milestone 2)'),
        el('li', {}, 'Download the reminders calendar file (Milestone 5)'))),
    // Where a slow open spends its time (as the other apps): the last refresh from the sheet.
    el('p', { class: 'version' }, `Version ${VERSION}`, status.timing ? el('span', { class: 'load-time' }, loadTimeText(status.timing)) : ''));
}
