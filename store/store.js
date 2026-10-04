// @ts-check

import * as db from './db.js';
import { call, Unreachable, lastTiming } from '../api.js';
import { copyTooOld } from '../freshness.js';
import { Dates } from '../shared/dates.js';
import { Points } from '../shared/points.js';

/**
 * The app's data (ADR-003, as the other apps): the sheet is the master copy; this phone keeps a copy in
 * IndexedDB so the app opens at once and can be viewed offline. Saving happens only online, straight to
 * the server: the rows it returns replace this phone's copies. Offline, saving says so and keeps nothing
 * (an item can be logged later in the week: ADR-004). The copy refreshes on opening, on returning to the
 * app, when the connection returns, and every five minutes (to pick up edits made in the Sheet).
 */

export const data = {
  /** @type {Record<string, string|null>} */ settings: {},
  /** @type {Record<string, string|null>} */ rules: {},
  /** @type {Track[]} */ tracks: [],
  /** @type {ScheduleItem[]} */ schedule: [],
  /** @type {LogEntry[]} */ logs: [],
  /** @type {PointEntry[]} */ points: [],
  /** @type {Break[]} */ breaks: [],
  /** @type {WeekResult[]} */ weeks: [],
  /** @type {RivalLine[]} */ lines: [],
  /** @type {Reward[]} */ rewards: [],
  /** @type {Milestone[]} */ milestones: [],
  /** Points earned minus spent, all time (from the server: the phone keeps only recent points). */
  balance: 0,
  /** @type {Streak[]} */ streaks: [],
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
const keyed = (rows) => Object.fromEntries((rows ?? []).map((s) => [s.key, s.value]));

/** @param {Record<string, any[]>} rows */
function take(rows) {
  data.settings = keyed(rows.settings);
  data.rules = keyed(rows.rules);
  data.tracks = rows.tracks ?? [];
  data.schedule = rows.schedule ?? [];
  data.logs = rows.logs ?? [];
  data.points = rows.points ?? [];
  data.breaks = rows.breaks ?? [];
  data.weeks = rows.weeks ?? [];
  data.lines = rows.lines ?? [];
  data.rewards = rows.rewards ?? [];
  data.milestones = rows.milestones ?? [];
}

/** Today on this phone, after the day cutoff (ADR-004): an entry at 01:30 counts for the evening before. */
export const today = () => Dates.dayAt(new Date(), Points.num(data.rules.day_cutoff_hour ?? '3'));

/** Loads this phone's copy. @returns {Promise<boolean>} whether there was one */
export async function load() {
  let saved = await db.loadAll();
  // A copy not refreshed for 30 days is removed, not shown: the session has ended by then too.
  if (copyTooOld(saved.meta.lastSynced, Date.now())) {
    await db.clearAll();
    saved = await db.loadAll();
  }
  take(saved.rows);
  data.balance = saved.meta.balance ?? 0;
  data.streaks = saved.meta.streaks ?? [];
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
    const rows = { settings: pulled.settings, rules: pulled.rules, tracks: pulled.tracks, schedule: pulled.schedule, logs: pulled.logs, points: pulled.points,
      breaks: pulled.breaks ?? [], weeks: pulled.weeks ?? [], lines: pulled.lines ?? [], rewards: pulled.rewards ?? [], milestones: pulled.milestones ?? [] };
    take(rows);
    data.balance = pulled.balance ?? 0;
    data.streaks = pulled.streaks ?? [];
    await db.replaceRows(rows);
    Object.assign(status, { since: pulled.server_time, user: pulled.user, sheetUrl: pulled.sheet_url, lastSynced: Date.now(), error: null, online: true, timing: { ...lastTiming } });
    await db.setMeta({ since: status.since, user: status.user, sheetUrl: status.sheetUrl, lastSynced: status.lastSynced, balance: data.balance, streaks: data.streaks });
  } catch (e) {
    status.online = !isOffline(e);
    status.error = status.online ? (e instanceof Error ? e.message : String(e)) : null;
    throw e;
  } finally {
    status.refreshing = false;
    changed();
  }
}

/** @typedef {{ ok: true } | { ok: false, message: string }} Saved */

/** @param {string} message @returns {Saved} */
const refuse = (message) => ({ ok: false, message });

/**
 * Keeps the rows a log save returned: the log, and its points row (or none: a skip, an undo).
 * @param {LogEntry|null} log @param {PointEntry|null} point
 */
async function keep(log, point) {
  if (!log) return;
  // The balance moves by what this log now earns, less what it earned before.
  const before = data.points.find((p) => p.log_id === log.log_id && !p.deleted)?.amount ?? 0;
  data.balance += (point && !point.deleted ? point.amount ?? 0 : 0) - before;
  db.setMeta({ balance: data.balance }).catch(() => { /* refreshed from the server next time */ });
  data.logs = [...data.logs.filter((l) => l.log_id !== log.log_id), log];
  // The log's earlier points row goes (undone, or now worth nothing) unless the server sent its new version.
  data.points = data.points.map((p) => (p.log_id === log.log_id && !p.deleted && p.point_id !== point?.point_id ? { ...p, deleted: true } : p))
    .filter((p) => p.point_id !== point?.point_id);
  if (point) data.points.push(point);
  await db.putRows({ logs: [log], points: data.points.filter((p) => p.log_id === log.log_id) });
  changed();
}

/**
 * Logs an item for a day, changes that log, or undoes it (ADR-004). Online only: nothing is kept on the
 * phone unless the server accepted it.
 * @param {{ schedule_id: string, date: string, variant?: 'full'|'minimum'|'skipped', minutes?: number|null, note?: string|null, undo?: boolean }} change
 * @returns {Promise<Saved>}
 */
export async function saveLog(change) {
  if (!navigator.onLine) return refuse("You're offline: log it later this week. It will wait under \"Did you do these?\".");
  const current = data.logs.find((l) => !l.deleted && l.schedule_id === change.schedule_id && l.date === change.date);
  /** @type {import('../api.js').ApiResponse} */
  let r;
  try {
    // A save (app-kit's api.js): a short wait, then one automatic retry with the same id, applied once.
    r = await call('log.save', { ...change, base_version: current ? current.version : 0 });
  } catch (e) {
    return refuse(isOffline(e) ? "You're offline: log it later this week." : `${e instanceof Error ? e.message : String(e)}. Nothing was lost: try again in a moment.`);
  }
  if (!r.ok) {
    // Changed elsewhere (another tap, or the Sheet): show what is saved now.
    if (r.errors[0]?.code === 'CONFLICT' && r.data) {
      if (r.data.log) await keep(r.data.log, r.data.point);
      else refresh().catch(() => { /* shown in the header */ });
    }
    return refuse(r.errors.map((e) => e.message).join('; '));
  }
  const saved = /** @type {LogSaved} */ (r.data);
  await keep(saved.log, saved.point);
  return { ok: true };
}

/**
 * Changes a setting the app may change (the Rival's name, the start date, early unlocks). Online only.
 * @param {string} key @param {string} value
 * @returns {Promise<Saved>}
 */
export async function saveSetting(key, value) {
  if (!navigator.onLine) return refuse("You're offline: connect to change settings.");
  try {
    const r = await call('settings.save', { key, value });
    if (!r.ok) return refuse(r.errors.map((e) => e.message).join('; '));
    data.settings = keyed(r.data.settings);
    await db.putRows({ settings: r.data.settings });
    changed();
    return { ok: true };
  } catch (e) {
    return refuse(isOffline(e) ? "You're offline: connect to change settings." : `${e instanceof Error ? e.message : String(e)}. Try again in a moment.`);
  }
}

/**
 * Adds a break, edits one, ends one ("I'm back") or removes one (ADR-018). Online only.
 * @param {{ action: 'add', from: string, to: string, keep_tracks?: string[], note?: string|null }
 *   | { action: 'edit', break_id: string, from: string, to: string, keep_tracks?: string[], note?: string|null }
 *   | { action: 'end'|'remove', break_id: string }} change
 * @returns {Promise<Saved>}
 */
export async function saveBreak(change) {
  if (!navigator.onLine) return refuse("You're offline: connect to set a break.");
  const current = 'break_id' in change ? data.breaks.find((b) => b.break_id === change.break_id) : null;
  try {
    const r = await call('break.save', current ? { ...change, base_version: current.version } : change);
    if (!r.ok) {
      if (r.errors[0]?.code === 'CONFLICT') refresh().catch(() => { /* shown in the header */ });
      return refuse(r.errors.map((e) => e.message).join('; '));
    }
    const saved = /** @type {Break} */ (r.data.break);
    data.breaks = [...data.breaks.filter((b) => b.break_id !== saved.break_id), saved];
    await db.putRows({ breaks: [saved] });
    changed();
    return { ok: true };
  } catch (e) {
    return refuse(isOffline(e) ? "You're offline: connect to set a break." : `${e instanceof Error ? e.message : String(e)}. Try again in a moment.`);
  }
}

/**
 * Buys a reward (a 'spend' row; the server refuses it if the balance is short), or undoes a spend. Online only.
 * @param {{ reward_id: string } | { undo: string }} change
 * @returns {Promise<Saved & { pointId?: string }>}
 */
export async function spendReward(change) {
  if (!navigator.onLine) return refuse("You're offline: connect to spend points.");
  try {
    const r = await call('reward.spend', change);
    if (!r.ok) return refuse(r.errors.map((e) => e.message).join('; '));
    const point = /** @type {PointEntry} */ (r.data.point);
    data.points = [...data.points.filter((p) => p.point_id !== point.point_id), point];
    data.balance = r.data.balance;
    await db.putRows({ points: [point] });
    await db.setMeta({ balance: data.balance });
    changed();
    return { ok: true, pointId: point.point_id };
  } catch (e) {
    return refuse(isOffline(e) ? "You're offline: connect to spend points." : `${e instanceof Error ? e.message : String(e)}. Try again in a moment.`);
  }
}

/**
 * Ticks a manual milestone as reached today, or unticks it. Online only.
 * @param {string} milestoneId @param {boolean} [undo]
 * @returns {Promise<Saved>}
 */
export async function tickMilestone(milestoneId, undo = false) {
  if (!navigator.onLine) return refuse("You're offline: connect to tick a milestone.");
  try {
    const r = await call('milestone.tick', { milestone_id: milestoneId, undo });
    if (!r.ok) return refuse(r.errors.map((e) => e.message).join('; '));
    const m = /** @type {Milestone} */ (r.data.milestone);
    data.milestones = [...data.milestones.filter((x) => x.milestone_id !== m.milestone_id), m];
    data.balance = r.data.balance;
    await db.putRows({ milestones: [m] });
    await db.setMeta({ balance: data.balance });
    changed();
    return { ok: true };
  } catch (e) {
    return refuse(isOffline(e) ? "You're offline: connect to tick a milestone." : `${e instanceof Error ? e.message : String(e)}. Try again in a moment.`);
  }
}

/** Every row of every tab, from the server (Settings → Export). @returns {Promise<{ ok: true, data: any } | { ok: false, message: string }>} */
export async function exportAll() {
  try {
    const r = await call('export.all', {});
    return r.ok ? { ok: true, data: r.data } : { ok: false, message: r.errors.map((e) => e.message).join('; ') };
  } catch (e) {
    return { ok: false, message: isOffline(e) ? "You're offline: export needs a connection." : `${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Forgets everything on this phone (signing out). */
export async function forget() {
  await db.clearAll();
  take({});
  data.balance = 0;
  data.streaks = [];
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
