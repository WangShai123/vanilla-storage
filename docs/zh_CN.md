# vanilla-storage 中文文档

`vanilla-storage` 是一个面向浏览器存储的异步统一 API。

它把 `localStorage`、`sessionStorage`、`IndexedDB`、`cookie` 和内存存储封装成一致的读写模型，并内置命名空间、TTL、codec、显式 fallback 和过期清理能力。

## 安装

```bash
npm install vanilla-create-storage
```

ESM:

```js
import { createStorage } from 'vanilla-create-storage';
```

UMD:

```html
<script src="https://unpkg.com/vanilla-create-storage/dist/index.umd.js"></script>
<script>
  // 全局变量 vanillaStorage
  const { createStorage } = vanillaStorage;
</script>
```

## 快速开始

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

## 核心概念

- 所有公开方法都是异步方法。
- 所有 driver 都存储同一种 record 结构，便于跨 driver fallback 和调试。
- `namespace` 用于隔离不同业务的数据，默认值是 `vanilla-storage`。
- `ttl` 单位始终是毫秒，存储 record 中的过期时间也是毫秒时间戳。
- `codec` 负责把业务值转换成可 JSON 持久化的 payload。
- 默认 JSON codec 不支持持久化 `undefined`，需要表达空值时应使用 `null`。
- 当底层 driver 是同步的 `localStorage` 或 `cookie` 时，推荐使用 `void`.

## 创建 storage

```js
const storage = createStorage(options);
```

也可以只传 driver 名称：

```js
const storage = createStorage('localStorage');
```

默认配置等价于：

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

## 实例属性

### `storage.prefix`

当前 namespace 前缀。默认是：

```txt
vanilla-storage::
```

如果 `namespace` 设置为 `null` 或 `false`，则 `prefix` 为空字符串。

### `storage.activeDriver`

当前实际选中的 driver 名称。

在第一次访问 driver 之前为 `null`。当 `ready`、`set()`、`get()` 等方法触发 driver
选择后，它会返回实际可用的 driver，例如 `indexedDB`、`localStorage` 或 `memory`。

### `storage.ready`

返回当前 adapter 的 Promise。

```js
const adapter = await storage.ready;
```

如果主 driver 和所有 fallback 都不可用，会抛出 `StorageUnavailableError`。

## API 详解

### `set(key, value, options?)`

写入一个值。

```js
await storage.set('user', { id: 1 });
await storage.set('token', 'abc', { ttl: 300_000 });
await storage.set('raw', 'hello', { codec: 'raw-string' });
```

参数：

- `key`: 非空字符串。最终底层 key 会加上 namespace 前缀。
- `value`: 要存储的业务值。
- `options.ttl`: 当前记录的存活时间，单位为毫秒。
- `options.expiresAt`: 当前记录的绝对过期时间，可以是毫秒时间戳或 `Date`。
- `options.codec`: 当前写入使用的 codec 名称或 codec 对象。

返回值：

- `Promise<void>`。

行为：

- 如果同时提供 `expiresAt` 和 `ttl`，优先使用 `expiresAt`。
- `expiresAt: null`、`expiresAt: false`、`ttl: null`、`ttl: false` 表示不过期。
- 默认 JSON codec 不允许写入 `undefined`、函数或 symbol。
- 写入时会先解析可用 driver；如果当前 driver 不可用，会尝试显式配置的
  fallback。

### `get(key, options?)`

读取一个值。

```js
const user = await storage.get('user');
const token = await storage.get('token', { defaultValue: null });
```

参数：

- `key`: 非空字符串。
- `options.defaultValue`: key 不存在或已过期时返回的默认值。

返回值：

- `Promise<T | undefined>`。
- 如果 key 不存在且没有传 `defaultValue`，返回 `undefined`。

行为：

- 如果记录已过期，会先删除该记录，然后按缺失值处理。
- 如果 record 结构损坏，会抛出 `StorageDataError`。
- 如果找不到对应 codec，会抛出 `StorageSerializationError`。

### `has(key)`

判断 key 是否存在且未过期。

```js
const exists = await storage.has('token');
```

返回值：

- `Promise<boolean>`。

行为：

- 已过期记录会被惰性删除，并返回 `false`。
- 只检查当前 namespace 下的完整 key。

### `delete(key)`

删除一个 key。

```js
await storage.delete('token');
```

返回值：

- `Promise<void>`。

行为：

- 只删除当前 namespace 下对应的 key。
- key 不存在时不会抛错。

### `remove(key)`

`delete(key)` 的别名。

```js
await storage.remove('token');
```

返回值：

- `Promise<void>`。

### `clear()`

清理当前 namespace 下的所有 key。

```js
await storage.clear();
```

返回值：

- `Promise<void>`。

行为：

- 默认只删除当前 namespace 下的 key。
- 如果 `namespace` 设置为 `null` 或 `false`，prefix 为空，会清理当前 adapter 可见
  的所有 key。

### `keys()`

返回当前 namespace 下所有未过期记录的业务 key。

```js
const keys = await storage.keys();
```

返回值：

- `Promise<string[]>`。

行为：

- 返回值会去掉 namespace 前缀。
- 已过期记录会被删除，不会出现在结果中。
- 如果遇到损坏 record，会抛出 `StorageDataError`。

### `rawKeys()`

返回当前 namespace 下底层 key 去掉 namespace 前缀后的结果。

```js
const keys = await storage.rawKeys();
```

返回值：

- `Promise<string[]>`。

区别：

- `rawKeys()` 只读取底层 adapter 的 key 列表，不解析 record，也不会清理过期记录。
- `keys()` 会读取 record、判断过期并清理过期数据。

### `values()`

返回当前 namespace 下所有未过期记录的值。

```js
const values = await storage.values();
```

返回值：

- `Promise<unknown[]>`。

行为：

- 内部基于 `entries()` 实现。
- 已过期记录不会出现在结果中。

### `entries()`

返回当前 namespace 下所有未过期记录的键值对。

```js
const entries = await storage.entries();
```

返回值：

- `Promise<Array<[string, unknown]>>`。

行为：

- key 不包含 namespace 前缀。
- value 是经过 codec 反序列化后的业务值。

### `size()`

返回当前 namespace 下未过期记录数量。

```js
const count = await storage.size();
```

返回值：

- `Promise<number>`。

行为：

- 内部基于 `keys()` 实现。
- 已过期记录会被清理后排除。

### `prune(options?)`

主动清理当前 namespace 下的过期记录。

```js
const deleted = await storage.prune();
const deletedWithInvalid = await storage.prune({ removeInvalid: true });
```

参数：

- `options.removeInvalid`: 是否删除损坏或不支持格式的 record。

返回值：

- `Promise<number>`，表示删除的记录数量。

行为：

- 默认只删除过期记录。
- 默认遇到损坏 record 会抛出错误。
- 设置 `removeInvalid: true` 后，损坏 record 会被删除并计入返回数量。

### `close()`

关闭当前 adapter。

```js
await storage.close();
```

返回值：

- `Promise<void>`。

行为：

- 如果当前 adapter 实现了 `close()`，会调用它。
- 会清空内部 adapter 缓存；后续再调用 `set()`、`get()` 等方法会重新选择 driver。
- 主要用于 IndexedDB 或自定义 adapter 的资源释放。

## 配置项

### `driver`

默认值：`'localStorage'`。

可选值：

- `'localStorage'`
- `'sessionStorage'`
- `'indexedDB'`
- `'cookie'`
- `'memory'`
- 自定义 adapter 对象
- 自定义 adapter factory

### `namespace`

默认值：`'vanilla-storage'`。

用于给底层 key 添加前缀，隔离不同业务数据。

```js
createStorage({ namespace: 'app' });
```

业务 key `token` 会被存成：

```txt
app::token
```

设置为 `null` 或 `false` 可禁用 namespace。

### `keySeparator`

默认值：`'::'`。

用于拼接 namespace 和业务 key。

### `fallback`

默认值：`[]`。

显式 fallback driver 列表。

```js
createStorage({
  driver: 'indexedDB',
  fallback: ['localStorage', 'memory'],
});
```

库不会静默降级。只有配置了 fallback，主 driver 不可用时才会尝试下一个 driver。

### `ttl`

默认值：`null`。

所有记录的默认存活时间，单位为毫秒。

```js
createStorage({ ttl: 60_000 });
```

`ttl: null`、`ttl: false`、`ttl: Infinity` 都表示默认不过期。

### `codec`

默认值：`'json'`。

设置默认 codec。可以传内置 codec 名称，也可以传 codec 对象。

### `codecs`

注册额外 codec。

```js
createStorage({
  codecs: [
    {
      name: 'upper',
      serialize(value) {
        return String(value).toUpperCase();
      },
      deserialize(payload) {
        return String(payload).toLowerCase();
      },
    },
  ],
});
```

读取已有 record 时，必须能在 registry 中找到对应 `c` 字段的 codec。

### `adapters`

注册额外 driver 名称。

```js
createStorage({
  driver: 'custom',
  adapters: {
    custom: myAdapter,
  },
});
```

### `driverOptions`

传给 adapter 的选项。

可以直接传给当前 driver：

```js
createStorage({
  driver: 'cookie',
  driverOptions: {
    path: '/',
    sameSite: 'lax',
  },
});
```

也可以按 driver 分组：

```js
createStorage({
  driver: 'indexedDB',
  fallback: ['localStorage', 'cookie'],
  driverOptions: {
    shared: {},
    indexedDB: { dbName: 'AppStorage' },
    localStorage: {},
    cookie: { path: '/', sameSite: 'lax' },
  },
});
```

当存在 `shared`、`cookie`、`indexedDB`、`localStorage`、`sessionStorage` 或
`memory` 任意分组键时，库会启用分组模式，并把 `shared` 与当前 driver 的专属选项
合并。

### `clock`

默认值：`Date.now`。

返回当前毫秒时间戳。主要用于测试或自定义时间来源。

### `onDriverError`

当某个 driver 创建或可用性检查失败时触发。

```js
createStorage({
  driver: 'indexedDB',
  fallback: ['localStorage'],
  onDriverError(error, driver) {
    console.warn(driver, error);
  },
});
```

## 写入和读取选项

### `SetOptions`

```ts
interface SetOptions<T = unknown> {
  codec?: string | StorageCodec<T>;
  expiresAt?: Date | number | null | false;
  ttl?: number | null | false;
}
```

优先级：

1. `expiresAt`
2. 当前 `set()` 的 `ttl`
3. storage 默认 `ttl`
4. 不过期

### `GetOptions`

```ts
interface GetOptions<T = unknown> {
  defaultValue?: T;
}
```

`defaultValue` 只在 key 缺失或已过期时返回。存储值本身为 `null`、`false`、`0` 或
空字符串时，不会触发 `defaultValue`。

### `PruneOptions`

```ts
interface PruneOptions {
  removeInvalid?: boolean;
}
```

`removeInvalid: true` 会删除无法解析、不符合当前 record 格式或版本不支持的记录。

## 驱动和驱动选项

### `localStorage`

使用浏览器 `localStorage`。

选项：

- `storage`: 指定一个 `Storage` 实例。
- `window`: 指定包含 `localStorage` 的 window-like 对象。

### `sessionStorage`

使用浏览器 `sessionStorage`。

选项：

- `storage`: 指定一个 `Storage` 实例。
- `window`: 指定包含 `sessionStorage` 的 window-like 对象。

### `indexedDB`

使用 IndexedDB 存储字符串 record。

选项：

- `dbName`: 数据库名称，默认 `VanillaStorage`。
- `storeName`: object store 名称，默认 `records`。
- `version`: 数据库版本，默认 `1`。
- `indexedDB`: 指定 `IDBFactory`。

### `cookie`

使用 `document.cookie`。

选项：

- `document`: 指定 document-like 对象。
- `domain`: cookie Domain。
- `expires`: cookie Expires，可以是 `Date`、时间戳或日期字符串。
- `maxAge`: cookie Max-Age，单位是秒。
- `path`: cookie Path，默认 `/`。
- `sameSite`: `strict`、`lax` 或 `none`，大小写均可。
- `secure`: 是否追加 Secure。

### `memory`

使用内存 `Map`。

选项：

- `map`: 指定 `Map<string, string>`，便于测试或多实例共享内存。

### 自定义 adapter

adapter 需要实现：

```ts
interface RawStorageAdapter {
  name: string;
  isAvailable?: () => boolean | Promise<boolean>;
  getRaw: (key: string) => Promise<string | undefined>;
  setRaw: (
    key: string,
    value: string,
    options?: RawStorageSetOptions
  ) => Promise<void>;
  deleteRaw: (key: string) => Promise<void>;
  clearRaw: (prefix?: string) => Promise<void>;
  keysRaw: (prefix?: string) => Promise<string[]>;
  close?: () => void | Promise<void>;
}
```

adapter 只负责原始字符串读写，不需要处理 codec、namespace、TTL 或 record 格式。

## Codec

### JSON codec

默认 codec。

行为：

- 存储普通 JSON-compatible 值。
- `val` 直接等于业务值，不再嵌套 `{ type: 'json', value }`。
- 不支持 `undefined`、函数和 symbol。
- 遇到循环引用、`BigInt` 等 `JSON.stringify` 不支持的值会抛出
  `StorageSerializationError`。

示例 record：

```json
{ "v": 1, "c": "json", "e": null, "val": { "id": 1, "name": "Ada" } }
```

### Raw string codec

只接受字符串。

```js
const storage = createStorage({
  codec: 'raw-string',
});

await storage.set('message', 'hello');
```

如果写入非字符串，会抛出 `StorageSerializationError`。

### 自定义 codec

```ts
interface StorageCodec<T = unknown> {
  name: string;
  serialize(value: T): unknown;
  deserialize(payload: unknown): T;
}
```

`serialize()` 必须返回 JSON-compatible 值，不能返回 `undefined`、函数或 symbol。

## 存储数据结构

底层所有 driver 存储的都是一个 JSON 字符串：

```json
{ "v": 1, "c": "json", "e": 1786700245485, "val": "zh_CN" }
```

字段含义：

- `v`: record 结构版本号。当前为 `1`。
- `c`: codec 名称。读取时用它找到对应 codec。
- `e`: 过期时间，单位为毫秒时间戳；不过期时为 `null`。
- `val`: codec 序列化后的 payload。默认 JSON codec 下它就是业务值本身。

设计约束：

- 只进行一层 JSON 编码。
- 不再使用 `val.type` 或 `{ type: 'json', value }` 包装。
- cookie driver 写入前还会对整个 record 字符串执行 `encodeURIComponent`。
- 服务端读取 cookie 时，应先 URL decode，再 JSON decode。

## Cookie 过期策略

storage 层有自己的过期时间，写在 record 的 `e` 字段中，单位是毫秒。

```json
{ "v": 1, "c": "json", "e": 1893456060000, "val": "abc" }
```

读取时，如果 `e <= Date.now()`，记录会被删除并视为不存在。

cookie driver 还有浏览器自己的 cookie 过期机制：

- `expires`: cookie 的 `Expires` 属性，格式是 HTTP-date，不是秒数。
- `maxAge`: cookie 的 `Max-Age` 属性，单位是秒。
- `ttl`: storage 选项，单位始终是毫秒。

当使用 cookie driver 时，如果记录过期来源是 `ttl`，并且没有显式配置 cookie
`expires`，库会自动把 `ttl` 计算成绝对毫秒时间戳，再写成 cookie `Expires` 日期。

```js
const now = Date.UTC(2030, 0, 1);

const storage = createStorage({
  driver: 'cookie',
  clock: () => now,
  ttl: 60_000,
});

await storage.set('token', 'abc');
```

写出的 cookie 属性会包含：

```txt
Expires=Tue, 01 Jan 2030 00:01:00 GMT
```

注意：

- 这里没有把 `60_000` 当作秒。
- `ttl` 不会直接写入 `Max-Age`。
- 如果显式配置了 cookie `expires`，它优先于由 `ttl` 自动生成的 `Expires`。
- 如果显式配置了 cookie `maxAge`，它会作为 cookie 选项原样写入，单位按 cookie
  标准为秒。
- 如果使用 `expiresAt` 而不是 `ttl`，record 的 `e` 会更新，但不会自动覆盖 cookie
  自身的 `Expires`。

## 错误类型

### `VanillaStorageError`

库内错误的基类。

### `StorageUnavailableError`

没有可用 driver，或指定 driver 不支持当前环境时抛出。

### `StorageSerializationError`

序列化或反序列化失败时抛出。

常见原因：

- JSON codec 写入了 `undefined`、函数、symbol、`BigInt` 或循环引用。
- 读取记录时找不到对应 codec。
- custom codec 返回了非 JSON-compatible payload。

### `StorageDataError`

底层存储中的 record 格式不符合当前协议时抛出。

常见原因：

- record 不是合法 JSON。
- `v` 不是当前支持的版本。
- 缺少 `c`、`e` 或 `val` 字段。
- cookie key 使用了非法字符或保留名。

### `StorageQuotaError`

底层存储容量不足时可能抛出。

## 设计原则

- 统一 API：不同 driver 使用同一组异步方法。
- 显式 fallback：不自动改变持久化和容量语义。
- 单层编码：record 只 JSON stringify 一次，降低 cookie 和服务端联调成本。
- 紧凑结构：record 字段使用 `v/c/e/val`，减少 cookie 和 storage 占用。
- 可演进协议：保留 `v`，未来结构升级时可以安全拒绝或迁移。
