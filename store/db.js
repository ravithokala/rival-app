// @ts-check

/**
 * This phone's copy of the data, in IndexedDB (ADR-003). The sheet is the master copy; this one
 * lets the app open at once and be viewed offline. Stores:
 *   settings  rows as the server sends them (key, value, updated_at)
 *   meta      { key, value }: last refresh time, who is signed in, the sheet link
 * The database name is this app's own: the other apps on this origin use other names.
 * Milestone 2 adds a store per habit tab (a version bump).
 */

const NAME = 'the-rival';
const VERSION = 1;
const STORES = ['settings', 'meta'];

/** @type {Promise<IDBDatabase>|null} */
let opening = null;

/** @returns {Promise<IDBDatabase>} */
function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'key' });
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
 * @returns {Promise<{ settings: Setting[], meta: Record<string, any> }>}
 */
export async function loadAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readonly');
  const [settings, meta] = await Promise.all(STORES.map((s) => done(tx.objectStore(s).getAll())));
  return { settings, meta: Object.fromEntries(meta.map((/** @type {any} */ m) => [m.key, m.value])) };
}

/**
 * Replaces the whole copy with what the server sent, in one transaction.
 * @param {{ settings: Setting[] }} rows
 */
export function replaceRows(rows) {
  return transact(['settings'], 'readwrite', (tx) => {
    const os = tx.objectStore('settings');
    os.clear();
    rows.settings.forEach((r) => os.put(r));
  });
}

/** @param {Record<string, unknown>} values */
export function setMeta(values) {
  return transact(['meta'], 'readwrite', (tx) => Object.entries(values).forEach(([key, value]) => tx.objectStore('meta').put({ key, value })));
}

/** Empties everything (sign-out). */
export function clearAll() {
  return transact(STORES, 'readwrite', (tx) => STORES.forEach((s) => tx.objectStore(s).clear()));
}
