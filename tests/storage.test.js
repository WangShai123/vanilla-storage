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
      async getRaw() {},
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
