import {
  StorageDataError,
  StorageUnavailableError,
  toStorageError,
} from '../errors.js';
import type { RawStorageAdapter } from '../utils.js';

export interface CookieAdapterOptions {
  document?: Document;
  domain?: string;
  expires?: Date | number | string;
  maxAge?: number;
  path?: string;
  sameSite?: 'strict' | 'lax' | 'none' | 'Strict' | 'Lax' | 'None';
  secure?: boolean;
}

type CookieDefaults = Omit<CookieAdapterOptions, 'document'>;

const RESERVED_COOKIE_KEYS = new Set([
  'expires',
  'max-age',
  'domain',
  'path',
  'secure',
  'httponly',
  'samesite',
]);

export class CookieAdapter implements RawStorageAdapter {
  name = 'cookie';
  document?: Document;
  defaults: CookieDefaults;

  constructor(options: CookieAdapterOptions = {}) {
    this.document = options.document;
    this.defaults = {
      path: '/',
      sameSite: undefined,
      secure: undefined,
      domain: undefined,
      ...options,
    };
  }

  _getDocument(): Document {
    const doc =
      this.document ||
      (typeof globalThis !== 'undefined' ? globalThis.document : undefined);

    if (!doc?.cookie && doc?.cookie !== '') {
      throw new StorageUnavailableError('document.cookie is not available.', {
        driver: this.name,
      });
    }

    return doc;
  }

  async isAvailable(): Promise<boolean> {
    const key = `__vanilla_storage_test__${Date.now()}_${Math.random()}`;

    try {
      await this.setRaw(key, '1');
      const available = (await this.getRaw(key)) === '1';
      await this.deleteRaw(key);
      return available;
    } catch {
      return false;
    }
  }

  async getRaw(key: string): Promise<string | undefined> {
    try {
      const encodedKey = encodeURIComponent(key);
      const cookies = this._getDocument().cookie.split(';');

      for (const cookie of cookies) {
        const index = cookie.indexOf('=');

        if (index < 0) {
          continue;
        }

        const rawKey = cookie.slice(0, index).trim();
        const rawValue = cookie.slice(index + 1);

        if (rawKey === encodedKey) {
          return decodeURIComponent(rawValue);
        }
      }

      return undefined;
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async setRaw(key: string, value: string): Promise<void> {
    try {
      this._setCookie(key, value, this.defaults);
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async deleteRaw(key: string): Promise<void> {
    try {
      this._setCookie(key, '', {
        ...this.defaults,
        expires: new Date(0),
        maxAge: 0,
      });
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name, key });
    }
  }

  async clearRaw(prefix = ''): Promise<void> {
    const keys = await this.keysRaw(prefix);

    for (const key of keys) {
      await this.deleteRaw(key);
    }
  }

  async keysRaw(prefix = ''): Promise<string[]> {
    try {
      const keys: string[] = [];
      const cookies = this._getDocument().cookie.split(';');

      for (const cookie of cookies) {
        const index = cookie.indexOf('=');

        if (index < 0) {
          continue;
        }

        const rawKey = cookie.slice(0, index).trim();
        const key = decodeURIComponent(rawKey);

        if (!prefix || key.startsWith(prefix)) {
          keys.push(key);
        }
      }

      return keys;
    } catch (cause) {
      throw toStorageError(cause, { driver: this.name });
    }
  }

  _setCookie(key: string, value: string, options: CookieDefaults): void {
    this._validateCookieKey(key);

    let cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;

    if (options.expires) {
      const expires =
        options.expires instanceof Date
          ? options.expires
          : new Date(options.expires);
      cookie += `; Expires=${expires.toUTCString()}`;
    }

    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${Math.floor(options.maxAge)}`;
    }

    if (options.domain) {
      cookie += `; Domain=${options.domain}`;
    }

    if (options.path) {
      cookie += `; Path=${options.path}`;
    }

    if (options.sameSite) {
      const sameSite = normalizeSameSite(options.sameSite);
      cookie += `; SameSite=${sameSite}`;
    }

    if (options.secure) {
      cookie += '; Secure';
    }

    this._getDocument().cookie = cookie;
  }

  _validateCookieKey(key: string): void {
    if (RESERVED_COOKIE_KEYS.has(key.toLowerCase())) {
      throw new StorageDataError(`Cookie key "${key}" is reserved.`, {
        driver: this.name,
        key,
      });
    }

    if (/[\s=;,]/.test(key)) {
      throw new StorageDataError(
        'Cookie key cannot contain whitespace, equals, comma, or semicolon.',
        { driver: this.name, key }
      );
    }
  }
}

function normalizeSameSite(value: CookieAdapterOptions['sameSite']): string {
  const normalized = String(value).toLowerCase();

  if (normalized === 'strict') {
    return 'Strict';
  }

  if (normalized === 'lax') {
    return 'Lax';
  }

  if (normalized === 'none') {
    return 'None';
  }

  throw new StorageDataError(
    'Cookie sameSite must be "strict", "lax", or "none".',
    { driver: 'cookie' }
  );
}
