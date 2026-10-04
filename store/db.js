// @ts-check

/**
 * This phone's copy of the data, in IndexedDB (ADR-003). The sheet is the master copy; this one
 * lets the app open at once and be viewed offline. One store per tab the phone keeps, keyed by the
 * tab's id column, plus meta ({ key, value }: last refresh time, who is signed in, the sheet link).
 * The database name is this app's own: the other apps on this origin use other names.
 * Version 2 added the habit tabs (Milestone 2); version 3 breaks (ADR-018); version 4 weeks and the Rival's lines (ADR-019);
 * version 5 rewards and milestones (3b).
 */

const NAME = 'the-rival';
const VERSION = 5;
/** @type {Record<string, string>} store → key path */
const KEYS = { settings: 'key', rules: 'key', tracks: 'track_id', schedule: 'schedule_id', logs: 'log_id', points: 'point_id', breaks: 'break_id', weeks: 'week_start', lines: 'line_id', rewards: 'reward_id', milestones: 'milestone_id', meta: 'key' };
const STORES = Object.keys(KEYS);
/** The stores holding the server's rows (everything but meta). */
const ROWS = STORES.filter((s) => s !== 'meta');

/** @type {Promise<IDBDatabase>|null} */
let opening = null;

/** @returns {Promise<IDBDatabase>} */
function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: KEYS[name] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
    request.onblocked = () => reject(new Error('Close this app in other tabs, then reload.'));
  });
  return opening;
}

/**
 * Runs `work` in one transaction and resolves when it has committed.
 * @template T
 * @param {string[]} stores
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => T} work
 * @returns {Promise<T>}
 */
async function transact(stores, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const result = work(tx);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('storage write was cancelled'));
  });
}

/**
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
const done = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/**
 * Everything saved on this phone.
 * @returns {Promise<{ rows: Record<string, any[]>, meta: Record<string, any> }>}
 */
export async function loadAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readonly');
  const all = await Promise.all(STORES.map((s) => done(tx.objectStore(s).getAll())));
  const rows = Object.fromEntries(ROWS.map((s) => [s, all[STORES.indexOf(s)]]));
  return { rows, meta: Object.fromEntries(all[STORES.indexOf('meta')].map((/** @type {any} */ m) => [m.key, m.value])) };
}

/**
 * Replaces the whole copy with what the server sent, in one transaction.
 * @param {Record<string, any[]>} rows  store → rows
 */
export function replaceRows(rows) {
  return transact(ROWS, 'readwrite', (tx) => {
    for (const name of ROWS) {
      const os = tx.objectStore(name);
      os.clear();
      (rows[name] ?? []).forEach((r) => os.put(r));
    }
  });
}

/**
 * Saves rows a save returned (a log and its points row).
 * @param {Record<string, any[]>} rows  store → rows
 */
export function putRows(rows) {
  const names = Object.keys(rows).filter((n) => ROWS.includes(n));
  return transact(names, 'readwrite', (tx) => names.forEach((n) => rows[n].forEach((r) => tx.objectStore(n).put(r))));
}

/** @param {Record<string, unknown>} values */
export function setMeta(values) {
  return transact(['meta'], 'readwrite', (tx) => Object.entries(values).forEach(([key, value]) => tx.objectStore('meta').put({ key, value })));
}

/** Empties everything (sign-out). */
export function clearAll() {
  return transact(STORES, 'readwrite', (tx) => STORES.forEach((s) => tx.objectStore(s).clear()));
}
