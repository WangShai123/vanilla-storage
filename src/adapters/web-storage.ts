import { StorageUnavailableError, toStorageError } from '../errors.js';
import type { RawStorageAdapter } from '../utils.js';

export interface WebStorageAdapterOptions {
  storage?: globalThis.Storage;
  window?: Window & Record<string, globalThis.Storage | undefined>;
}

function createTestKey() {
  return `__vanilla_storage_test__${Date.now()}_${Math.random()}`;
}

export class WebStorageAdapter implements RawStorageAdapter {
  name: string;
  type: 'localStorage' | 'sessionStorage';
  storage: globalThis.Storage | null;
  window?: Window & Record<string, globalThis.Storage | undefined>;

  constructor(
    type: 'localStorage' | 'sessionStorage' = 'localStorage',
    options: WebStorageAdapterOptions = {}
  ) {
    this.name = type;
    this.type = type;
    this.storage = options.storage || null;
    this.window = options.window;
  }

  _getStorage(): globalThis.Storage {
    if (this.storage) {
      return this.storage;
    }

    const root =
      this.window ||
      (typeof globalThis !== 'undefined' ? globalThis : undefined);
    const storage = root?.[this.type];

    if (!storage) {
      throw new StorageUnavailableError(`${this.type} is not available.`, {
        driver: this.name,
      });
    }

    return storage;
  }

  async isAvailable(): Promise<boolean> {
    const testKey = createTestKey();

    try {
      const storage = this._getStorage();
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  async getRaw(key: string): Promise<string | undefined> {
    try {
      const value = this._getStorage().getItem(key);
      return value === null ? undefined : value;
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async setRaw(key: string, value: string): Promise<void> {
    try {
      this._getStorage().setItem(key, value);
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async deleteRaw(key: string): Promise<void> {
    try {
      this._getStorage().removeItem(key);
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async clearRaw(prefix = ''): Promise<void> {
    const storage = this._getStorage();
    const keys = await this.keysRaw(prefix);

    try {
      for (const key of keys) {
        storage.removeItem(key);
      }
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name });
    }
  }

  async keysRaw(prefix = ''): Promise<string[]> {
    const storage = this._getStorage();
    const keys: string[] = [];

    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);

        if (key && (!prefix || key.startsWith(prefix))) {
          keys.push(key);
        }
      }
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name });
    }

    return keys;
  }
}

export class LocalStorageAdapter extends WebStorageAdapter {
  constructor(options: WebStorageAdapterOptions = {}) {
    super('localStorage', options);
  }
}

export class SessionStorageAdapter extends WebStorageAdapter {
  constructor(options: WebStorageAdapterOptions = {}) {
    super('sessionStorage', options);
  }
}
