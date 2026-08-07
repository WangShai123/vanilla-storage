//#region src/utils.d.ts
interface RawStorageAdapter {
  name: string;
  isAvailable?: () => boolean | Promise<boolean>;
  getRaw: (key: string) => Promise<string | undefined>;
  setRaw: (key: string, value: string, options?: RawStorageSetOptions) => Promise<void>;
  deleteRaw: (key: string) => Promise<void>;
  clearRaw: (prefix?: string) => Promise<void>;
  keysRaw: (prefix?: string) => Promise<string[]>;
  close?: () => void | Promise<void>;
}
interface RawStorageSetOptions {
  expiresAt?: number | null;
}
//#endregion
//#region src/adapters/cookie.d.ts
interface CookieAdapterOptions {
  document?: Document;
  domain?: string;
  expires?: Date | number | string;
  maxAge?: number;
  path?: string;
  sameSite?: 'strict' | 'lax' | 'none' | 'Strict' | 'Lax' | 'None';
  secure?: boolean;
}
type CookieDefaults = Omit<CookieAdapterOptions, 'document'>;
declare class CookieAdapter implements RawStorageAdapter {
  name: string;
  document?: Document;
  defaults: CookieDefaults;
  constructor(options?: CookieAdapterOptions);
  _getDocument(): Document;
  isAvailable(): Promise<boolean>;
  getRaw(key: string): Promise<string | undefined>;
  setRaw(key: string, value: string, options?: RawStorageSetOptions): Promise<void>;
  deleteRaw(key: string): Promise<void>;
  clearRaw(prefix?: string): Promise<void>;
  keysRaw(prefix?: string): Promise<string[]>;
  _setCookie(key: string, value: string, options: CookieDefaults): void;
  _resolveSetOptions(options: RawStorageSetOptions): CookieDefaults;
  _validateCookieKey(key: string): void;
}
//#endregion
//#region src/adapters/indexed-db.d.ts
interface IndexedDBAdapterOptions {
  dbName?: string;
  indexedDB?: IDBFactory;
  storeName?: string;
  version?: number;
}
declare class IndexedDBAdapter implements RawStorageAdapter {
  name: string;
  dbName: string;
  storeName: string;
  version: number;
  indexedDB?: IDBFactory;
  db: IDBDatabase | null;
  openPromise: Promise<IDBDatabase> | null;
  constructor(options?: IndexedDBAdapterOptions);
  isAvailable(): Promise<boolean>;
  getRaw(key: string): Promise<string | undefined>;
  setRaw(key: string, value: string): Promise<void>;
  deleteRaw(key: string): Promise<void>;
  clearRaw(prefix?: string): Promise<void>;
  keysRaw(prefix?: string): Promise<string[]>;
  close(): Promise<void>;
  _open(): Promise<IDBDatabase>;
  _getRecordValue(key: string): Promise<string | undefined>;
  _writeRecord(callback: (store: IDBObjectStore) => IDBRequest | undefined | void): Promise<void>;
  _readAllKeys(): Promise<string[]>;
  _requestKeysWithGetAllKeys(): Promise<string[]>;
  _requestKeysWithCursor(): Promise<string[]>;
}
//#endregion
//#region src/adapters/memory.d.ts
interface MemoryAdapterOptions {
  map?: Map<string, string>;
}
declare class MemoryAdapter implements RawStorageAdapter {
  name: string;
  map: Map<string, string>;
  constructor(options?: MemoryAdapterOptions);
  isAvailable(): Promise<boolean>;
  getRaw(key: string): Promise<string | undefined>;
  setRaw(key: string, value: string): Promise<void>;
  deleteRaw(key: string): Promise<void>;
  clearRaw(prefix?: string): Promise<void>;
  keysRaw(prefix?: string): Promise<string[]>;
}
//#endregion
//#region src/adapters/web-storage.d.ts
interface WebStorageAdapterOptions {
  storage?: globalThis.Storage;
  window?: Window & Record<string, globalThis.Storage | undefined>;
}
declare class WebStorageAdapter implements RawStorageAdapter {
  name: string;
  type: 'localStorage' | 'sessionStorage';
  storage: globalThis.Storage | null;
  window?: Window & Record<string, globalThis.Storage | undefined>;
  constructor(type?: 'localStorage' | 'sessionStorage', options?: WebStorageAdapterOptions);
  _getStorage(): globalThis.Storage;
  isAvailable(): Promise<boolean>;
  getRaw(key: string): Promise<string | undefined>;
  setRaw(key: string, value: string): Promise<void>;
  deleteRaw(key: string): Promise<void>;
  clearRaw(prefix?: string): Promise<void>;
  keysRaw(prefix?: string): Promise<string[]>;
}
declare class LocalStorageAdapter extends WebStorageAdapter {
  constructor(options?: WebStorageAdapterOptions);
}
declare class SessionStorageAdapter extends WebStorageAdapter {
  constructor(options?: WebStorageAdapterOptions);
}
//#endregion
//#region src/codecs/json.d.ts
declare const jsonCodec: {
  name: string;
  serialize(value: unknown): unknown;
  deserialize(payload: unknown): unknown;
};
//#endregion
//#region src/codecs/raw-string.d.ts
declare const rawStringCodec: {
  name: string;
  serialize(value: unknown): unknown;
  deserialize(payload: unknown): string;
};
//#endregion
//#region src/core/storage.d.ts
declare const RECORD_VERSION = 1;
interface StorageCodec<T = unknown> {
  name: string;
  serialize(value: T): unknown;
  deserialize(payload: unknown): T;
}
type BuiltinStorageDriver = 'cookie' | 'indexedDB' | 'localStorage' | 'memory' | 'sessionStorage';
type StorageDriver = string | RawStorageAdapter | StorageAdapterFactory;
interface StorageAdapterFactoryContext {
  driverOptions: DriverOptions;
  storage: Storage;
}
type StorageAdapterFactory = (context: StorageAdapterFactoryContext) => RawStorageAdapter;
interface SetOptions<T = unknown> {
  codec?: string | StorageCodec<T>;
  expiresAt?: Date | number | null | false;
  ttl?: number | null | false;
}
interface GetOptions<T = unknown> {
  defaultValue?: T;
}
interface PruneOptions {
  removeInvalid?: boolean;
}
type DriverOptions = Record<string, unknown>;
interface StorageOptions {
  adapters?: Record<string, StorageDriver>;
  clock?: () => number;
  codec?: string | StorageCodec;
  codecs?: Record<string, StorageCodec> | StorageCodec[];
  driver?: StorageDriver;
  driverOptions?: DriverOptions;
  fallback?: StorageDriver | StorageDriver[] | null | false;
  keySeparator?: string;
  namespace?: string | null | false;
  onDriverError?: (error: unknown, driver: string) => void;
  ttl?: number | null | false;
}
interface StorageRecord {
  codec: string;
  expiresAt: number | null;
  v: typeof RECORD_VERSION;
  value: unknown;
}
interface StorageExpiration {
  expiresAt: number | null;
  source: 'expiresAt' | 'none' | 'ttl';
}
type InspectAction = 'delete' | 'keep';
declare class Storage {
  driver: StorageDriver;
  fallback: StorageDriver[];
  namespace: string;
  keySeparator: string;
  defaultTtl: number | null;
  clock: () => number;
  driverOptions: DriverOptions;
  adapters: Record<string, StorageDriver>;
  codec: StorageCodec;
  codecs: Map<string, StorageCodec>;
  onDriverError?: (error: unknown, driver: string) => void;
  _adapter: RawStorageAdapter | null;
  _adapterPromise: Promise<RawStorageAdapter> | null;
  constructor(options?: StorageOptions | string);
  get prefix(): string;
  get activeDriver(): string | null;
  get ready(): Promise<RawStorageAdapter>;
  set<T = unknown>(key: string, value: T, options?: SetOptions<T>): Promise<void>;
  get<T = unknown>(key: string, options?: GetOptions<T>): Promise<T | undefined>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  rawKeys(): Promise<string[]>;
  values(): Promise<unknown[]>;
  entries(): Promise<Array<[string, unknown]>>;
  size(): Promise<number>;
  prune(options?: PruneOptions): Promise<number>;
  close(): Promise<void>;
  _read(key: string, options: {
    deserialize: boolean;
  }): Promise<unknown>;
  _encodeRecord<T = unknown>(value: T, options: SetOptions<T>): string;
  _encodeRecordWithExpiration<T = unknown>(value: T, options: SetOptions<T>, expiresAt: number | null): string;
  _decodeRecord(raw: string, fullKey: string): StorageRecord;
  _deserializeRecord(record: StorageRecord, fullKey: string): unknown;
  _inspectRaw(raw: string, fullKey: string, options: {
    removeInvalid: boolean;
  }): InspectAction;
  _isExpired(record: StorageRecord): boolean;
  _resolveExpiresAt(options: SetOptions): number | null;
  _resolveExpiration(options: SetOptions): StorageExpiration;
  _fullKey(key: string): string;
  _getAdapter(): Promise<RawStorageAdapter>;
  _selectAdapter(): Promise<RawStorageAdapter>;
  _createAdapter(driver: StorageDriver): RawStorageAdapter;
  _driverOptions(driver: string): DriverOptions;
  _liveKeys(): Promise<string[]>;
}
declare function createStorage(options?: StorageOptions | string): Storage;
//#endregion
//#region src/errors.d.ts
interface VanillaStorageErrorOptions {
  code?: string;
  driver?: string;
  key?: string;
  details?: unknown;
  cause?: unknown;
}
declare class VanillaStorageError extends Error {
  code: string;
  driver?: string;
  key?: string;
  details?: unknown;
  cause?: unknown;
  constructor(message: string, options?: VanillaStorageErrorOptions);
}
declare class StorageUnavailableError extends VanillaStorageError {
  constructor(message: string, options?: VanillaStorageErrorOptions);
}
declare class StorageQuotaError extends VanillaStorageError {
  constructor(message: string, options?: VanillaStorageErrorOptions);
}
declare class StorageSerializationError extends VanillaStorageError {
  constructor(message: string, options?: VanillaStorageErrorOptions);
}
declare class StorageDataError extends VanillaStorageError {
  constructor(message: string, options?: VanillaStorageErrorOptions);
}
//#endregion
export { type BuiltinStorageDriver, CookieAdapter, type CookieAdapterOptions, type DriverOptions, type GetOptions, IndexedDBAdapter, type IndexedDBAdapterOptions, LocalStorageAdapter, MemoryAdapter, type MemoryAdapterOptions, type PruneOptions, SessionStorageAdapter, type SetOptions, Storage, type StorageAdapterFactory, type StorageAdapterFactoryContext, type StorageCodec, StorageDataError, type StorageDriver, type StorageOptions, StorageQuotaError, StorageSerializationError, StorageUnavailableError, VanillaStorageError, WebStorageAdapter, type WebStorageAdapterOptions, createStorage, jsonCodec, rawStringCodec };