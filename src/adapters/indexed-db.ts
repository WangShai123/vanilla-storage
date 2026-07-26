import {
  StorageDataError,
  StorageUnavailableError,
  toStorageError,
} from '../errors.js';
import type { RawStorageAdapter } from '../utils.js';

export interface IndexedDBAdapterOptions {
  dbName?: string;
  indexedDB?: IDBFactory;
  storeName?: string;
  version?: number;
}

interface IndexedDBRecord {
  key: string;
  value: string;
}

export class IndexedDBAdapter implements RawStorageAdapter {
  name = 'indexedDB';
  dbName: string;
  storeName: string;
  version: number;
  indexedDB?: IDBFactory;
  db: IDBDatabase | null = null;
  openPromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDBAdapterOptions = {}) {
    this.dbName = options.dbName || 'VanillaStorage';
    this.storeName = options.storeName || 'records';
    this.version = options.version || 1;
    this.indexedDB = options.indexedDB || getIndexedDB();
  }

  async isAvailable(): Promise<boolean> {
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

  async getRaw(key: string): Promise<string | undefined> {
    try {
      return await this._getRecordValue(key);
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async setRaw(key: string, value: string): Promise<void> {
    try {
      await this._writeRecord((store) => store.put({ key, value }));
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async deleteRaw(key: string): Promise<void> {
    try {
      await this._writeRecord((store) => store.delete(key));
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async clearRaw(prefix = ''): Promise<void> {
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

  async keysRaw(prefix = ''): Promise<string[]> {
    const keys = await this._readAllKeys();

    if (!prefix) {
      return keys;
    }

    return keys.filter((key) => key.startsWith(prefix));
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.openPromise = null;
    }
  }

  async _open(): Promise<IDBDatabase> {
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
        if (!this.indexedDB) {
          reject(
            new StorageUnavailableError('indexedDB is not available.', {
              driver: this.name,
            })
          );
          return;
        }

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

  async _getRecordValue(key: string): Promise<string | undefined> {
    const db = await this._open();

    return await new Promise<string | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      let result: string | undefined;

      transaction.oncomplete = () => {
        resolve(result);
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      request.onsuccess = () => {
        const record = request.result as IndexedDBRecord | undefined;
        result = record?.value;
      };
      request.onerror = () => reject(request.error);
    });
  }

  async _writeRecord(
    callback: (store: IDBObjectStore) => IDBRequest | undefined | void
  ): Promise<void> {
    const db = await this._open();

    return await new Promise<void>((resolve, reject) => {
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

  async _readAllKeys(): Promise<string[]> {
    if (
      typeof IDBObjectStore !== 'undefined' &&
      typeof IDBObjectStore.prototype.getAllKeys === 'function'
    ) {
      return await this._requestKeysWithGetAllKeys();
    }

    return await this._requestKeysWithCursor();
  }

  async _requestKeysWithGetAllKeys(): Promise<string[]> {
    const db = await this._open();

    return await new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();
      let result: string[] = [];

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      request.onsuccess = () => {
        result = request.result.filter((key) => typeof key === 'string');
      };
      request.onerror = () => reject(request.error);
    });
  }

  async _requestKeysWithCursor(): Promise<string[]> {
    const db = await this._open();

    return await new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const keys: string[] = [];
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

function getIndexedDB(): IDBFactory | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  return globalThis.indexedDB;
}
