// @ts-check

import * as db from './db.js';
import { call, Unreachable, lastTiming } from '../api.js';
import { copyTooOld } from '../freshness.js';

/**
 * The app's data (ADR-003, as the other apps): the sheet is the master copy; this phone keeps a
 * copy in IndexedDB so the app opens at once and can be viewed offline. Saving will happen only
 * online, straight to the server (Milestone 2 adds the first saves). The copy refreshes on
 * opening, on returning to the app, when the connection returns, and every five minutes (to pick
 * up edits made in the Sheet).
 */

export const data = {
  /** @type {Record<string, string|null>} key → value */
  settings: /** @type {Record<string, string|null>} */ ({}),
};

export const status = {
  user: '',
  /** The Sheet's address, for the link in Settings. */
  sheetUrl: '',
  /** Server time of the last successful refresh, or null before the first. */
  since: /** @type {string|null} */ (null),
  lastSynced: /** @type {number|null} */ (null),
  online: navigator.onLine,
  refreshing: false,
  /** Why the last refresh failed, if it did (not when simply offline). */
  error: /** @type {string|null} */ (null),
  /** How long the last refresh took (shown beside the version in Settings). */
  timing: /** @type {typeof lastTiming|null} */ (null),
};

/** @type {Set<() => void>} */
const listeners = new Set();

/** Called after anything changes (data or status). @param {() => void} fn */
export const onChange = (fn) => { listeners.add(fn); };
const changed = () => listeners.forEach((fn) => fn());

/** @param {Setting[]} rows */
const settingsFrom = (rows) => Object.fromEntries(rows.map((s) => [s.key, s.value]));

/** Loads this phone's copy. @returns {Promise<boolean>} whether there was one */
export async function load() {
  let saved = await db.loadAll();
  // A copy not refreshed for 30 days is removed, not shown: the session has ended by then too.
  if (copyTooOld(saved.meta.lastSynced, Date.now())) {
    await db.clearAll();
    saved = await db.loadAll();
  }
  data.settings = settingsFrom(saved.settings);
  status.since = saved.meta.since ?? null;
  status.user = saved.meta.user ?? '';
  status.sheetUrl = saved.meta.sheetUrl ?? '';
  status.lastSynced = saved.meta.lastSynced ?? null;
  changed();
  return status.since !== null;
}

/** Whether a failure means this phone has no connection (not just a busy server). @param {unknown} e */
const isOffline = (e) => !navigator.onLine || (e instanceof Unreachable && e.offline);

/** @type {Promise<void>|null} */
let running = null;

/**
 * Re-reads the copy from the server. One at a time: a call while one runs shares it.
 * @returns {Promise<void>}
 */
export function refresh() {
  if (!running) running = run().finally(() => { running = null; });
  return running;
}

async function run() {
  status.refreshing = true;
  changed();
  try {
    const r = await call('sync.pull', { since: status.since });
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    const pulled = /** @type {Pulled} */ (r.data);
    data.settings = settingsFrom(pulled.settings);
    await db.replaceRows(pulled);
    Object.assign(status, { since: pulled.server_time, user: pulled.user, sheetUrl: pulled.sheet_url, lastSynced: Date.now(), error: null, online: true, timing: { ...lastTiming } });
    await db.setMeta({ since: status.since, user: status.user, sheetUrl: status.sheetUrl, lastSynced: status.lastSynced });
  } catch (e) {
    status.online = !isOffline(e);
    status.error = status.online ? (e instanceof Error ? e.message : String(e)) : null;
    throw e;
  } finally {
    status.refreshing = false;
    changed();
  }
}

/** Forgets everything on this phone (signing out). */
export async function forget() {
  await db.clearAll();
  data.settings = {};
  Object.assign(status, { user: '', sheetUrl: '', since: null, lastSynced: null, error: null });
  changed();
}

/** Keeps the copy current: when the connection returns, when the app is reopened, and every five minutes. */
export function keepInStep() {
  const attempt = () => { if (navigator.onLine) refresh().catch(() => { /* shown in the header */ }); };
  window.addEventListener('online', () => { status.online = true; attempt(); });
  window.addEventListener('offline', () => { status.online = false; changed(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') attempt(); });
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - (status.lastSynced ?? 0) > 300000) attempt();
  }, 60000);
}
