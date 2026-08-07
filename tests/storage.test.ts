import { describe, expect, it } from 'vite-plus/test';

import {
  StorageUnavailableError,
  createStorage,
  rawStringCodec,
} from '../src/index.js';

describe('createStorage', () => {
  it('stores and reads JSON values with the memory driver', async () => {
    const storage = createStorage({ driver: 'memory', namespace: 'unit' });

    await storage.set('user', { id: 1, name: 'Ada' });

    expect(await storage.get('user')).toEqual({ id: 1, name: 'Ada' });
    expect(await storage.has('user')).toBe(true);
    expect(await storage.keys()).toEqual(['user']);
    expect(await storage.size()).toBe(1);
  });

  it('returns defaultValue for missing records', async () => {
    const storage = createStorage({ driver: 'memory', namespace: 'unit' });

    expect(await storage.get('missing')).toBeUndefined();
    expect(await storage.get('missing', { defaultValue: null })).toBeNull();
  });

  it('stores JSON codec payload without nested JSON escaping', async () => {
    const map = new Map<string, string>();
    const storage = createStorage({
      driver: 'memory',
      driverOptions: { map },
      namespace: 'unit',
    });

    await storage.set('locale', 'zh_CN');

    const raw = map.get('unit::locale');

    expect(raw).toBeDefined();
    expect(raw).not.toContain('\\"');
    expect(JSON.parse(raw as string).value).toEqual({
      type: 'json',
      value: 'zh_CN',
    });
  });

  it('stores cookie JSON payload with a single JSON encoding layer', async () => {
    const document = createCookieDocument();
    const storage = createStorage({
      driver: 'cookie',
      driverOptions: { document },
      namespace: 'unit',
    });

    await storage.set('locale', 'zh_CN');

    const rawCookie = document.cookie;
    const rawValue = rawCookie.slice(rawCookie.indexOf('=') + 1);
    const decoded = decodeURIComponent(rawValue);

    expect(decoded).not.toContain('\\"');
    expect(JSON.parse(decoded).value).toEqual({
      type: 'json',
      value: 'zh_CN',
    });
    expect(await storage.get('locale')).toBe('zh_CN');
  });

  it('writes ttl to cookie expires when cookie expires is not configured', async () => {
    const now = Date.UTC(2030, 0, 1);
    const ttl = 60_000;
    const document = createCookieDocument();
    const storage = createStorage({
      clock: () => now,
      driver: 'cookie',
      driverOptions: { document },
      namespace: 'unit',
      ttl,
    });

    await storage.set('token', 'abc');

    expect(document.writes[document.writes.length - 1]).toContain(
      `Expires=${new Date(now + ttl).toUTCString()}`
    );
  });

  it('treats undefined cookie expires as not configured', async () => {
    const now = Date.UTC(2030, 0, 1);
    const ttl = 60_000;
    const document = createCookieDocument();
    const storage = createStorage({
      clock: () => now,
      driver: 'cookie',
      driverOptions: { document, expires: undefined },
      namespace: 'unit',
      ttl,
    });

    await storage.set('token', 'abc');

    expect(document.writes[document.writes.length - 1]).toContain(
      `Expires=${new Date(now + ttl).toUTCString()}`
    );
  });

  it('keeps explicit cookie expires when storage ttl is configured', async () => {
    const now = Date.UTC(2030, 0, 1);
    const ttl = 60_000;
    const expires = new Date(now + 120_000);
    const document = createCookieDocument();
    const storage = createStorage({
      clock: () => now,
      driver: 'cookie',
      driverOptions: { document, expires },
      namespace: 'unit',
      ttl,
    });

    await storage.set('token', 'abc');

    expect(document.writes[document.writes.length - 1]).toContain(
      `Expires=${expires.toUTCString()}`
    );
    expect(document.writes[document.writes.length - 1]).not.toContain(
      `Expires=${new Date(now + ttl).toUTCString()}`
    );
  });

  it('reads legacy JSON codec string payloads', async () => {
    const map = new Map<string, string>();
    const storage = createStorage({
      driver: 'memory',
      driverOptions: { map },
      namespace: 'unit',
    });

    map.set(
      'unit::locale',
      JSON.stringify({
        v: 1,
        codec: 'json',
        expiresAt: null,
        value: '{"type":"json","value":"zh_CN"}',
      })
    );

    expect(await storage.get('locale')).toBe('zh_CN');
  });

  it('removes expired records lazily', async () => {
    let now = 1_000;
    const storage = createStorage({
      clock: () => now,
      driver: 'memory',
      namespace: 'unit',
    });

    await storage.set('token', 'abc', { ttl: 10 });
    expect(await storage.get('token')).toBe('abc');

    now = 1_011;

    expect(await storage.get('token')).toBeUndefined();
    expect(await storage.has('token')).toBe(false);
    expect(await storage.keys()).toEqual([]);
  });

  it('clear only removes records in the configured namespace', async () => {
    const map = new Map();
    const first = createStorage({
      driver: 'memory',
      driverOptions: { map },
      namespace: 'first',
    });
    const second = createStorage({
      driver: 'memory',
      driverOptions: { map },
      namespace: 'second',
    });

    await first.set('a', 1);
    await second.set('a', 2);
    await first.clear();

    expect(await first.get('a')).toBeUndefined();
    expect(await second.get('a')).toBe(2);
  });

  it('uses explicit fallback when primary driver is unavailable', async () => {
    const unavailable = {
      name: 'unavailable',
      async isAvailable() {
        return false;
      },
      async getRaw() {
        return undefined;
      },
      async setRaw() {},
      async deleteRaw() {},
      async clearRaw() {},
      async keysRaw() {
        return [];
      },
    };

    const storage = createStorage({
      driver: unavailable,
      fallback: ['memory'],
      namespace: 'unit',
    });

    await storage.set('a', 1);

    expect(storage.activeDriver).toBe('memory');
    expect(await storage.get('a')).toBe(1);
  });

  it('throws when no configured driver is usable', async () => {
    const storage = createStorage({
      driver: 'localStorage',
      fallback: [],
      namespace: 'unit',
    });

    await expect(storage.ready).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('supports raw string codec', async () => {
    const storage = createStorage({
      codec: rawStringCodec,
      driver: 'memory',
      namespace: 'unit',
    });

    await storage.set('message', 'hello');

    expect(await storage.get('message')).toBe('hello');
  });
});

function createCookieDocument(): Document & { writes: string[] } {
  const jar = new Map<string, string>();
  const writes: string[] = [];

  return {
    writes,
    get cookie() {
      return Array.from(jar.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    },
    set cookie(value: string) {
      writes.push(value);

      const [pair = '', ...attributes] = value.split(';');
      const index = pair.indexOf('=');

      if (index < 0) {
        return;
      }

      const key = pair.slice(0, index);
      const storedValue = pair.slice(index + 1);
      const shouldDelete = attributes.some((attribute) => {
        const normalized = attribute.trim().toLowerCase();
        return (
          normalized === 'max-age=0' ||
          normalized === 'expires=thu, 01 jan 1970 00:00:00 gmt'
        );
      });

      if (shouldDelete) {
        jar.delete(key);
      } else {
        jar.set(key, storedValue);
      }
    },
  } as unknown as Document & { writes: string[] };
}
