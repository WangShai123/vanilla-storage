# vanilla-storage

A small async storage abstraction for browser storage drivers.

## Install

npm:

```bash
npm install vanilla-create-storage
```

script:

```javascript
// umd: GlobalName: storage
<script src="https://unpkg.com/vanilla-create-storage/dist/index.umd.js"></script>
const { createStorage } = storage;

// es module
import { createStorage } from 'https://unpkg.com/vanilla-create-storage/dist/index.mjs';
```

## Usage

```js
import { createStorage } from 'vanilla-create-storage';

const storage = createStorage({
  driver: 'indexedDB',
  namespace: 'my-app',
  fallback: ['localStorage', 'memory'],
  ttl: 60_000,
});

await storage.set('user', { id: 1, name: 'Ada' });
await storage.set('token', 'abc', { ttl: 5 * 60_000 });

const user = await storage.get('user');
const token = await storage.get('token', { defaultValue: null });

await storage.delete('token');
await storage.clear();
```

## API

```js
const storage = createStorage(options);

await storage.set(key, value, options);
await storage.get(key, options);
await storage.has(key);
await storage.delete(key);
await storage.clear();
await storage.keys();
await storage.values();
await storage.entries();
await storage.size();
await storage.prune();
await storage.close();
```

## Options

```js
createStorage({
  driver: 'localStorage',
  namespace: 'vanilla-storage',
  keySeparator: '::',
  fallback: [],
  ttl: null,
  codec: 'json',
  driverOptions: {},
});
```

- `driver`: `'localStorage'`, `'sessionStorage'`, `'indexedDB'`, `'cookie'`, `'memory'`, an adapter, or an adapter factory.
- `namespace`: key prefix used to isolate data. Set `null` to disable namespacing.
- `fallback`: explicit fallback driver list. The library does not silently downgrade unless configured.
- `ttl`: default time to live in milliseconds.
- `codec`: `'json'`, `'raw-string'`, or a custom codec.
- `driverOptions`: options passed to adapters.

## Driver Options

```js
createStorage({
  driver: 'cookie',
  driverOptions: {
    path: '/',
    sameSite: 'lax',
    secure: true,
  },
});

createStorage({
  driver: 'indexedDB',
  driverOptions: {
    dbName: 'MyAppStorage',
    storeName: 'records',
    version: 1,
  },
});
```

You can also scope options per driver:

```js
createStorage({
  driver: 'indexedDB',
  fallback: ['localStorage'],
  driverOptions: {
    indexedDB: { dbName: 'MyAppStorage' },
    cookie: { path: '/', sameSite: 'lax' },
  },
});
```

## Design

- All public methods are async, including synchronous browser storage drivers.
- Stored records use a consistent envelope across drivers.
- `clear()` only removes keys inside the configured namespace.
- Expired records are lazily removed on read and can be eagerly removed with `prune()`.
- Fallbacks are explicit so capacity and persistence semantics do not change silently.

## Translations

- [中文](README_zh.md)
