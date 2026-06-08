import { StorageUnavailableError, toStorageError } from '../errors.js';

function createTestKey() {
  return `__vanilla_storage_test__${Date.now()}_${Math.random()}`;
}

export class WebStorageAdapter {
  constructor(type = 'localStorage', options = {}) {
    this.name = type;
    this.type = type;
    this.storage = options.storage || null;
    this.window = options.window;
  }

  _getStorage() {
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

  async isAvailable() {
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

  async getRaw(key) {
    try {
      const value = this._getStorage().getItem(key);
      return value === null ? undefined : value;
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async setRaw(key, value) {
    try {
      this._getStorage().setItem(key, value);
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async deleteRaw(key) {
    try {
      this._getStorage().removeItem(key);
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async clearRaw(prefix = '') {
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

  async keysRaw(prefix = '') {
    const storage = this._getStorage();
    const keys = [];

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
  constructor(options = {}) {
    super('localStorage', options);
  }
}

export class SessionStorageAdapter extends WebStorageAdapter {
  constructor(options = {}) {
    super('sessionStorage', options);
  }
}
