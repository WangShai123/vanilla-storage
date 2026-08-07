# vanilla-storage

A small async storage abstraction for browser storage drivers.

## Install

npm:

```bash
npm install vanilla-create-storage
```

script:

```html
<!-- umd: GlobalName: vanillaStorage -->
<script src="https://unpkg.com/vanilla-create-storage/dist/index.umd.js"></script>
<script>
  const { createStorage } = vanillaStorage;
</script>

<!-- es module -->
<script type="module">
  import { createStorage } from 'https://unpkg.com/vanilla-create-storage/dist/index.js';
</script>
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
await storage.remove(key);
await storage.clear();
await storage.keys();
await storage.rawKeys();
await storage.values();
await storage.entries();
await storage.size();
await storage.prune(options);
await storage.close();
```

## Drivers

- `localStorage`
- `sessionStorage`
- `indexedDB`
- `cookie`
- `memory`

## Translations

- [中文](README_zh.md)

## Documentation

- [Documentation](docs/en.md)
