# vanilla-storage English Documentation

`vanilla-storage` is an async unified API for browser storage.

It wraps `localStorage`, `sessionStorage`, `IndexedDB`, `cookie`, and in-memory
storage behind a consistent read/write model, with built-in namespace, TTL,
codec, explicit fallback, and expiration cleanup support.

## Install

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
  // Global variable: vanillaStorage
  const { createStorage } = vanillaStorage;
</script>
```

## Quick Start

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

## Core Concepts

- All public methods are async.
- All drivers store the same record structure, which makes cross-driver fallback
  and debugging easier.
- `namespace` isolates data for different applications or modules. The default
  value is `vanilla-storage`.
- `ttl` is always measured in milliseconds. The expiration timestamp stored in
  the record is also a millisecond timestamp.
- `codec` converts business values into JSON-persistable payloads.
- The default JSON codec does not persist `undefined`. Use `null` when you need
  to represent an empty value.
- When the underlying driver is synchronous, such as `localStorage` or `cookie`,
  using `void` is recommended when you intentionally do not await a call.

## Create Storage

```js
const storage = createStorage(options);
```

You can also pass only the driver name:

```js
const storage = createStorage('localStorage');
```

The default configuration is equivalent to:

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

## Instance Properties

### `storage.prefix`

The current namespace prefix. By default:

```txt
vanilla-storage::
```

If `namespace` is set to `null` or `false`, `prefix` is an empty string.

### `storage.activeDriver`

The name of the driver that is actually selected.

It is `null` before the first driver access. After `ready`, `set()`, `get()`, or
another method triggers driver selection, it returns the active driver name, such
as `indexedDB`, `localStorage`, or `memory`.

### `storage.ready`

Returns a Promise for the current adapter.

```js
const adapter = await storage.ready;
```

If the primary driver and all fallback drivers are unavailable, it throws
`StorageUnavailableError`.

## API Reference

### `set(key, value, options?)`

Writes a value.

```js
await storage.set('user', { id: 1 });
await storage.set('token', 'abc', { ttl: 300_000 });
await storage.set('raw', 'hello', { codec: 'raw-string' });
```

Parameters:

- `key`: A non-empty string. The final raw key is prefixed with the namespace.
- `value`: The business value to store.
- `options.ttl`: The lifetime of this record, in milliseconds.
- `options.expiresAt`: The absolute expiration time for this record, as a
  millisecond timestamp or `Date`.
- `options.codec`: The codec name or codec object to use for this write.

Return value:

- `Promise<void>`.

Behavior:

- If both `expiresAt` and `ttl` are provided, `expiresAt` takes priority.
- `expiresAt: null`, `expiresAt: false`, `ttl: null`, and `ttl: false` mean no
  expiration.
- The default JSON codec does not allow `undefined`, functions, or symbols.
- Writes resolve the available driver first. If the current driver is
  unavailable, explicitly configured fallback drivers are tried.

### `get(key, options?)`

Reads a value.

```js
const user = await storage.get('user');
const token = await storage.get('token', { defaultValue: null });
```

Parameters:

- `key`: A non-empty string.
- `options.defaultValue`: The value returned when the key is missing or expired.

Return value:

- `Promise<T | undefined>`.
- If the key is missing and no `defaultValue` is provided, it returns
  `undefined`.

Behavior:

- If the record is expired, it is deleted first and then treated as missing.
- If the record structure is corrupted, `StorageDataError` is thrown.
- If the matching codec cannot be found, `StorageSerializationError` is thrown.

### `has(key)`

Checks whether a key exists and is not expired.

```js
const exists = await storage.has('token');
```

Return value:

- `Promise<boolean>`.

Behavior:

- Expired records are lazily deleted and return `false`.
- Only the full key in the current namespace is checked.

### `delete(key)`

Deletes a key.

```js
await storage.delete('token');
```

Return value:

- `Promise<void>`.

Behavior:

- Deletes only the matching key in the current namespace.
- Does not throw when the key does not exist.

### `remove(key)`

Alias for `delete(key)`.

```js
await storage.remove('token');
```

Return value:

- `Promise<void>`.

### `clear()`

Clears all keys in the current namespace.

```js
await storage.clear();
```

Return value:

- `Promise<void>`.

Behavior:

- By default, only keys in the current namespace are deleted.
- If `namespace` is set to `null` or `false`, the prefix is empty and all keys
  visible to the current adapter are cleared.

### `keys()`

Returns all non-expired business keys in the current namespace.

```js
const keys = await storage.keys();
```

Return value:

- `Promise<string[]>`.

Behavior:

- Returned keys do not include the namespace prefix.
- Expired records are deleted and do not appear in the result.
- If a corrupted record is encountered, `StorageDataError` is thrown.

### `rawKeys()`

Returns raw adapter keys in the current namespace with the namespace prefix
removed.

```js
const keys = await storage.rawKeys();
```

Return value:

- `Promise<string[]>`.

Difference:

- `rawKeys()` only reads the key list from the underlying adapter. It does not
  parse records or clean up expired records.
- `keys()` reads records, checks expiration, and cleans up expired data.

### `values()`

Returns all non-expired values in the current namespace.

```js
const values = await storage.values();
```

Return value:

- `Promise<unknown[]>`.

Behavior:

- Implemented on top of `entries()`.
- Expired records do not appear in the result.

### `entries()`

Returns all non-expired key-value pairs in the current namespace.

```js
const entries = await storage.entries();
```

Return value:

- `Promise<Array<[string, unknown]>>`.

Behavior:

- Keys do not include the namespace prefix.
- Values are business values deserialized through the codec.

### `size()`

Returns the number of non-expired records in the current namespace.

```js
const count = await storage.size();
```

Return value:

- `Promise<number>`.

Behavior:

- Implemented on top of `keys()`.
- Expired records are cleaned up and excluded.

### `prune(options?)`

Actively removes expired records in the current namespace.

```js
const deleted = await storage.prune();
const deletedWithInvalid = await storage.prune({ removeInvalid: true });
```

Parameters:

- `options.removeInvalid`: Whether to delete corrupted or unsupported records.

Return value:

- `Promise<number>`, the number of records deleted.

Behavior:

- By default, only expired records are deleted.
- By default, corrupted records throw an error.
- With `removeInvalid: true`, corrupted records are deleted and counted in the
  return value.

### `close()`

Closes the current adapter.

```js
await storage.close();
```

Return value:

- `Promise<void>`.

Behavior:

- If the current adapter implements `close()`, it is called.
- Clears the internal adapter cache. Later calls to `set()`, `get()`, or other
  methods select the driver again.
- Mainly useful for IndexedDB or custom adapters that hold resources.

## Options

### `driver`

Default: `'localStorage'`.

Allowed values:

- `'localStorage'`
- `'sessionStorage'`
- `'indexedDB'`
- `'cookie'`
- `'memory'`
- Custom adapter object
- Custom adapter factory

### `namespace`

Default: `'vanilla-storage'`.

Adds a prefix to raw keys to isolate data for different applications or modules.

```js
createStorage({ namespace: 'app' });
```

The business key `token` is stored as:

```txt
app::token
```

Set it to `null` or `false` to disable namespacing.

### `keySeparator`

Default: `'::'`.

Used to join the namespace and business key.

### `fallback`

Default: `[]`.

An explicit fallback driver list.

```js
createStorage({
  driver: 'indexedDB',
  fallback: ['localStorage', 'memory'],
});
```

The library does not silently downgrade. Fallback drivers are tried only when
they are explicitly configured.

### `ttl`

Default: `null`.

The default lifetime for all records, in milliseconds.

```js
createStorage({ ttl: 60_000 });
```

`ttl: null`, `ttl: false`, and `ttl: Infinity` all mean no default expiration.

### `codec`

Default: `'json'`.

Sets the default codec. You can pass a built-in codec name or a codec object.

### `codecs`

Registers additional codecs.

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

When reading an existing record, the registry must contain the codec named by
the record's `c` field.

### `adapters`

Registers additional driver names.

```js
createStorage({
  driver: 'custom',
  adapters: {
    custom: myAdapter,
  },
});
```

### `driverOptions`

Options passed to adapters.

You can pass options directly to the current driver:

```js
createStorage({
  driver: 'cookie',
  driverOptions: {
    path: '/',
    sameSite: 'lax',
  },
});
```

You can also group options by driver:

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

If any grouping key exists among `shared`, `cookie`, `indexedDB`,
`localStorage`, `sessionStorage`, or `memory`, grouped mode is enabled and
`shared` is merged with the options for the active driver.

### `clock`

Default: `Date.now`.

Returns the current millisecond timestamp. This is mainly useful for tests or a
custom time source.

### `onDriverError`

Called when creating a driver or checking its availability fails.

```js
createStorage({
  driver: 'indexedDB',
  fallback: ['localStorage'],
  onDriverError(error, driver) {
    console.warn(driver, error);
  },
});
```

## Write and Read Options

### `SetOptions`

```ts
interface SetOptions<T = unknown> {
  codec?: string | StorageCodec<T>;
  expiresAt?: Date | number | null | false;
  ttl?: number | null | false;
}
```

Priority:

1. `expiresAt`
2. The `ttl` passed to the current `set()`
3. The storage default `ttl`
4. No expiration

### `GetOptions`

```ts
interface GetOptions<T = unknown> {
  defaultValue?: T;
}
```

`defaultValue` is returned only when the key is missing or expired. Stored values
such as `null`, `false`, `0`, or an empty string do not trigger `defaultValue`.

### `PruneOptions`

```ts
interface PruneOptions {
  removeInvalid?: boolean;
}
```

`removeInvalid: true` deletes records that cannot be parsed, do not match the
current record format, or use an unsupported version.

## Drivers and Driver Options

### `localStorage`

Uses browser `localStorage`.

Options:

- `storage`: A specific `Storage` instance.
- `window`: A window-like object that contains `localStorage`.

### `sessionStorage`

Uses browser `sessionStorage`.

Options:

- `storage`: A specific `Storage` instance.
- `window`: A window-like object that contains `sessionStorage`.

### `indexedDB`

Uses IndexedDB to store string records.

Options:

- `dbName`: Database name. Default: `VanillaStorage`.
- `storeName`: Object store name. Default: `records`.
- `version`: Database version. Default: `1`.
- `indexedDB`: A specific `IDBFactory`.

### `cookie`

Uses `document.cookie`.

Options:

- `document`: A document-like object.
- `domain`: Cookie Domain.
- `expires`: Cookie Expires, as a `Date`, timestamp, or date string.
- `maxAge`: Cookie Max-Age, in seconds.
- `path`: Cookie Path. Default: `/`.
- `sameSite`: `strict`, `lax`, or `none`, case-insensitive.
- `secure`: Whether to append Secure.

### `memory`

Uses an in-memory `Map`.

Options:

- `map`: A specific `Map<string, string>`, useful for tests or shared in-memory
  state across instances.

### Custom Adapter

An adapter must implement:

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

Adapters are responsible only for raw string reads and writes. They do not need
to handle codec, namespace, TTL, or the record format.

## Codec

### JSON Codec

The default codec.

Behavior:

- Stores regular JSON-compatible values.
- `val` is the business value directly; it no longer nests
  `{ type: 'json', value }`.
- Does not support `undefined`, functions, or symbols.
- Cyclic references, `BigInt`, and other values unsupported by
  `JSON.stringify` throw `StorageSerializationError`.

Example record:

```json
{ "v": 1, "c": "json", "e": null, "val": { "id": 1, "name": "Ada" } }
```

### Raw String Codec

Accepts strings only.

```js
const storage = createStorage({
  codec: 'raw-string',
});

await storage.set('message', 'hello');
```

Writing a non-string value throws `StorageSerializationError`.

### Custom Codec

```ts
interface StorageCodec<T = unknown> {
  name: string;
  serialize(value: T): unknown;
  deserialize(payload: unknown): T;
}
```

`serialize()` must return a JSON-compatible value. It must not return
`undefined`, a function, or a symbol.

## Stored Record Format

All underlying drivers store a JSON string:

```json
{ "v": 1, "c": "json", "e": 1786700245485, "val": "zh_CN" }
```

Field meanings:

- `v`: Record format version. The current version is `1`.
- `c`: Codec name. It is used to find the matching codec during reads.
- `e`: Expiration time as a millisecond timestamp; `null` means no expiration.
- `val`: The payload serialized by the codec. With the default JSON codec, it is
  the business value itself.

Design constraints:

- Only one JSON encoding layer is used.
- No `val.type` or `{ type: 'json', value }` wrapper is used.
- The cookie driver also applies `encodeURIComponent` to the whole record string
  before writing.
- Server-side cookie readers should URL decode first, then JSON decode.

## Cookie Expiration Strategy

The storage layer has its own expiration timestamp in the record's `e` field, in
milliseconds.

```json
{ "v": 1, "c": "json", "e": 1893456060000, "val": "abc" }
```

When reading, if `e <= Date.now()`, the record is deleted and treated as
missing.

The cookie driver also has the browser's native cookie expiration mechanism:

- `expires`: Cookie `Expires` attribute, formatted as an HTTP-date, not seconds.
- `maxAge`: Cookie `Max-Age` attribute, in seconds.
- `ttl`: Storage option, always in milliseconds.

When using the cookie driver, if the record expiration source is `ttl` and no
cookie `expires` option is explicitly configured, the library converts `ttl` to
an absolute millisecond timestamp and writes it as the cookie `Expires` date.

```js
const now = Date.UTC(2030, 0, 1);

const storage = createStorage({
  driver: 'cookie',
  clock: () => now,
  ttl: 60_000,
});

await storage.set('token', 'abc');
```

The written cookie attributes include:

```txt
Expires=Tue, 01 Jan 2030 00:01:00 GMT
```

Notes:

- `60_000` is not treated as seconds.
- `ttl` is not written directly to `Max-Age`.
- If cookie `expires` is explicitly configured, it takes priority over the
  `Expires` generated from `ttl`.
- If cookie `maxAge` is explicitly configured, it is written as-is. Its unit
  follows the cookie standard: seconds.
- If `expiresAt` is used instead of `ttl`, the record's `e` field is updated,
  but the cookie's own `Expires` attribute is not automatically overwritten.

## Error Types

### `VanillaStorageError`

The base class for library errors.

### `StorageUnavailableError`

Thrown when no driver is available, or when the specified driver is unsupported
in the current environment.

### `StorageSerializationError`

Thrown when serialization or deserialization fails.

Common causes:

- The JSON codec is asked to write `undefined`, a function, a symbol, `BigInt`,
  or a cyclic reference.
- A record is read but the matching codec cannot be found.
- A custom codec returns a non-JSON-compatible payload.

### `StorageDataError`

Thrown when a record in the underlying storage does not match the current
protocol.

Common causes:

- The record is not valid JSON.
- `v` is not the currently supported version.
- The `c`, `e`, or `val` field is missing.
- A cookie key uses invalid characters or a reserved name.

### `StorageQuotaError`

May be thrown when the underlying storage runs out of capacity.

## Design Principles

- Unified API: different drivers use the same async method set.
- Explicit fallback: persistence and capacity semantics are not changed
  silently.
- Single encoding layer: records are JSON stringified only once, reducing cookie
  size and server-side integration friction.
- Compact structure: records use `v/c/e/val` to reduce cookie and storage usage.
- Evolvable protocol: `v` is preserved so future structure changes can be safely
  rejected or migrated.
