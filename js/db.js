/* Хранилище: IndexedDB, с запасным вариантом в localStorage. */
window.DB = (() => {
  const NAME = 'vkusno-db';
  const VERSION = 1;
  const DISHES = 'dishes';
  const META = 'meta';
  const LS_KEY = 'vkusno.data.v1';

  let db = null;
  let mode = 'idb';

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступен'));
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(DISHES)) d.createObjectStore(DISHES, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Не удалось открыть базу'));
      req.onblocked = () => reject(new Error('База занята другой вкладкой'));
    });
  }

  function idbOp(store, kind, fn) {
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(store, kind); }
      catch (e) { return reject(e); }
      const os = tx.objectStore(store);
      let result;
      try {
        const req = fn(os);
        if (req) req.onsuccess = () => { result = req.result; };
      } catch (e) { return reject(e); }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Ошибка транзакции'));
      tx.onabort = () => reject(tx.error || new Error('Транзакция прервана'));
    });
  }

  function lsRead() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || typeof data !== 'object') return { dishes: [], meta: {} };
      if (!Array.isArray(data.dishes)) data.dishes = [];
      if (!data.meta || typeof data.meta !== 'object') data.meta = {};
      return data;
    } catch (e) {
      return { dishes: [], meta: {} };
    }
  }

  function lsWrite(data) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) {
      const err = new Error('STORAGE_FULL');
      err.code = 'STORAGE_FULL';
      throw err;
    }
  }

  async function init() {
    try {
      db = await openIDB();
      mode = 'idb';
    } catch (e) {
      console.warn('[Вкусно?] IndexedDB недоступен, использую localStorage:', e);
      mode = 'ls';
    }
    return mode;
  }

  async function getAll() {
    if (mode === 'idb') {
      const rows = await idbOp(DISHES, 'readonly', (s) => s.getAll());
      return Array.isArray(rows) ? rows : [];
    }
    return lsRead().dishes;
  }

  async function put(dish) {
    if (mode === 'idb') {
      await idbOp(DISHES, 'readwrite', (s) => s.put(dish));
      return dish;
    }
    const data = lsRead();
    const i = data.dishes.findIndex((d) => d.id === dish.id);
    if (i >= 0) data.dishes[i] = dish; else data.dishes.push(dish);
    lsWrite(data);
    return dish;
  }

  async function remove(id) {
    if (mode === 'idb') {
      await idbOp(DISHES, 'readwrite', (s) => s.delete(id));
      return;
    }
    const data = lsRead();
    data.dishes = data.dishes.filter((d) => d.id !== id);
    lsWrite(data);
  }

  async function clear() {
    if (mode === 'idb') {
      await idbOp(DISHES, 'readwrite', (s) => s.clear());
      return;
    }
    const data = lsRead();
    data.dishes = [];
    lsWrite(data);
  }

  async function getMeta(key) {
    if (mode === 'idb') {
      const value = await idbOp(META, 'readonly', (s) => s.get(key));
      return value;
    }
    return lsRead().meta[key];
  }

  async function setMeta(key, value) {
    if (mode === 'idb') {
      await idbOp(META, 'readwrite', (s) => s.put(value, key));
      return;
    }
    const data = lsRead();
    data.meta[key] = value;
    lsWrite(data);
  }

  return { init, getAll, put, remove, clear, getMeta, setMeta, get mode() { return mode; } };
})();
