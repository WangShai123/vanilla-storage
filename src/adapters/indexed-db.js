import {
  StorageDataError,
  StorageUnavailableError,
  toStorageError,
} from '../errors.js';

export class IndexedDBAdapter {
  constructor(options = {}) {
    this.name = 'indexedDB';
    this.dbName = options.dbName || 'VanillaStorage';
    this.storeName = options.storeName || 'records';
    this.version = options.version || 1;
    this.indexedDB = options.indexedDB || getIndexedDB();
    this.db = null;
    this.openPromise = null;
  }

  async isAvailable() {
    if (!this.indexedDB) {
      return false;
    }

    try {
      await this._open();
      return true;
    } catch {
      return false;
    }
  }

  async getRaw(key) {
    try {
      return await this._getRecordValue(key);
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async setRaw(key, value) {
    try {
      await this._writeRecord((store) => store.put({ key, value }));
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async deleteRaw(key) {
    try {
      await this._writeRecord((store) => store.delete(key));
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async clearRaw(prefix = '') {
    if (!prefix) {
      await this._writeRecord((store) => store.clear());
      return;
    }

    const keys = await this.keysRaw(prefix);
    await this._writeRecord((store) => {
      for (const key of keys) {
        store.delete(key);
      }
    });
  }

  async keysRaw(prefix = '') {
    const keys = await this._readAllKeys();

    if (!prefix) {
      return keys;
    }

    return keys.filter((key) => key.startsWith(prefix));
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.openPromise = null;
    }
  }

  async _open() {
    if (this.db) {
      return this.db;
    }

    if (!this.indexedDB) {
      throw new StorageUnavailableError('indexedDB is not available.', {
        driver: this.name,
      });
    }

    if (!this.openPromise) {
      this.openPromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'key' });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          this.db.onversionchange = () => {
            void this.close();
          };
          resolve(this.db);
        };

        request.onerror = () => {
          reject(request.error);
        };

        request.onblocked = () => {
          reject(
            new StorageDataError(
              'IndexedDB upgrade is blocked by another open connection.',
              { driver: this.name }
            )
          );
        };
      });
    }

    return this.openPromise;
  }

  async _getRecordValue(key) {
    const db = await this._open();

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      let result;

      transaction.oncomplete = () => {
        resolve(result);
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      request.onsuccess = () => {
        result =
          request.result && request.result.value !== undefined
            ? request.result.value
            : undefined;
      };
      request.onerror = () => reject(request.error);
    });
  }

  async _writeRecord(callback) {
    const db = await this._open();

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      transaction.oncomplete = () => resolve(undefined);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      try {
        const request = callback(store);

        if (request) {
          request.onerror = () => reject(request.error);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  async _readAllKeys() {
    if (
      typeof IDBObjectStore !== 'undefined' &&
      IDBObjectStore.prototype.getAllKeys
    ) {
      return await this._requestKeysWithGetAllKeys();
    }

    return await this._requestKeysWithCursor();
  }

  async _requestKeysWithGetAllKeys() {
    const db = await this._open();

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();
      let result = [];

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      request.onsuccess = () => {
        result = request.result.filter((key) => typeof key === 'string');
      };
      request.onerror = () => reject(request.error);
    });
  }

  async _requestKeysWithCursor() {
    const db = await this._open();

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const keys = [];
      const request = store.openCursor();

      transaction.oncomplete = () => resolve(keys);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          return;
        }

        if (typeof cursor.key === 'string') {
          keys.push(cursor.key);
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }
}

function getIndexedDB() {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  return globalThis.indexedDB;
}
