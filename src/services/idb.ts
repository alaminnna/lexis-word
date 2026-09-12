// Minimal promise-based IndexedDB wrapper (idb-keyval style) for the
// dictionary cache and rolling event log. Progress + settings live in
// localStorage (synchronous, precious, debounced writes).

const DB_NAME = 'lexis';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('dict')) db.createObjectStore('dict');
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(store, mode);
        let request: IDBRequest<T>;
        try {
          request = run(transaction.objectStore(store));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('IndexedDB request failed'));
          return;
        }
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
    (err: unknown) => Promise.reject(err instanceof Error ? err : new Error('IndexedDB unavailable')),
  );
}

export const idb = {
  get<T>(store: string, key: string): Promise<T | undefined> {
    return tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  },
  set(store: string, key: string, value: unknown): Promise<void> {
    return tx(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined);
  },
  del(store: string, key: string): Promise<void> {
    return tx(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
  },
  keys(store: string): Promise<string[]> {
    return tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((keys) =>
      keys.filter((k): k is string => typeof k === 'string'),
    );
  },
  clear(store: string): Promise<void> {
    return tx(store, 'readwrite', (s) => s.clear()).then(() => undefined);
  },
  /** False when IndexedDB is unavailable (private mode, unsupported browser). */
  async available(): Promise<boolean> {
    try {
      await db();
      return true;
    } catch {
      dbPromise = null;
      return false;
    }
  },
};
