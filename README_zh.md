# vanilla-storage

一个轻量级的异步存储抽象层，用于浏览器存储驱动。

## 安装

npm:

```bash
npm install vanilla-create-storage
```

script:

```html
<!-- umd: 全局变量 storage -->
<script src="https://unpkg.com/vanilla-create-storage/dist/index.umd.js"></script>
<script>
  const { createStorage } = storage;
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
await storage.clear();
await storage.keys();
await storage.values();
await storage.entries();
await storage.size();
await storage.prune();
await storage.close();
```

## 配置选项

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

- `driver`: `'localStorage'`、`'sessionStorage'`、`'indexedDB'`、`'cookie'`、`'memory'`，或适配器/适配器工厂函数。
- `namespace`: 用于隔离数据的键前缀。设置为 `null` 可禁用命名空间。
- `fallback`: 显式的降级驱动列表。除非明确配置，否则库不会静默降级。
- `ttl`: 默认存活时间（以毫秒为单位）。
- `codec`: `'json'`、`'raw-string'`，或自定义编解码器。
- `driverOptions`: 传递给适配器的选项。

## 驱动选项

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

你也可以为每个驱动分别配置选项：

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

## 设计理念

- 所有公共方法都是异步的，包括同步的浏览器存储驱动。
- 存储的记录在所有驱动中使用一致的封装格式。
- `clear()` 仅删除已配置命名空间内的键。
- 过期记录在读取时惰性删除，也可以使用 `prune()` 主动清理。
- 降级机制是显式的，因此容量和持久化语义不会静默改变。

## 翻译

- [English](README.md)
