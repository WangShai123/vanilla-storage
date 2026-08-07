# vanilla-storage

一个轻量级的异步存储抽象层，用于浏览器存储驱动。

## 安装

npm:

```bash
npm install vanilla-create-storage
```

script:

```html
<!-- umd: 全局变量 vanillaStorage -->
<script src="https://unpkg.com/vanilla-create-storage/dist/index.umd.js"></script>
<script>
  const { createStorage } = vanillaStorage;
</script>

<!-- esm: 模块导入 -->
<script type="module">
  import { createStorage } from 'https://unpkg.com/vanilla-create-storage/dist/index.js';
</script>
```

## 使用

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

## 驱动器

- `localStorage`
- `sessionStorage`
- `indexedDB`
- `cookie`
- `memory`

## 翻译

- [English](README.md)

## 文档

- [文档](docs/zh_CN.md)
