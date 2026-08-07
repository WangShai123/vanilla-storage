import {
  CookieAdapter,
  IndexedDBAdapter,
  LocalStorageAdapter,
  MemoryAdapter,
  SessionStorageAdapter,
} from '../adapters/index.js';
import { jsonCodec, rawStringCodec } from '../codecs/index.js';
import {
  StorageDataError,
  StorageSerializationError,
  StorageUnavailableError,
} from '../errors.js';
import {
  MISSING,
  type RawStorageAdapter,
  assertKey,
  hasOwn,
  isObject,
  normalizeKeySeparator,
  normalizeNamespace,
  normalizeTimestamp,
  normalizeTtl,
  uniqueByIdentity,
} from '../utils.js';

const RECORD_VERSION = 1;

export interface StorageCodec<T = unknown> {
  name: string;
  serialize(value: T): unknown;
  deserialize(payload: unknown): T;
}

export type BuiltinStorageDriver =
  | 'cookie'
  | 'indexedDB'
  | 'localStorage'
  | 'memory'
  | 'sessionStorage';

export type StorageDriver = string | RawStorageAdapter | StorageAdapterFactory;

export interface StorageAdapterFactoryContext {
  driverOptions: DriverOptions;
  storage: Storage;
}

export type StorageAdapterFactory = (
  context: StorageAdapterFactoryContext
) => RawStorageAdapter;

export interface SetOptions<T = unknown> {
  codec?: string | StorageCodec<T>;
  expiresAt?: Date | number | null | false;
  ttl?: number | null | false;
}

export interface GetOptions<T = unknown> {
  defaultValue?: T;
}

export interface PruneOptions {
  removeInvalid?: boolean;
}

export type DriverOptions = Record<string, unknown>;

export interface StorageOptions {
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

const BUILTIN_ADAPTERS: Record<
  BuiltinStorageDriver,
  (options: DriverOptions) => RawStorageAdapter
> = {
  cookie: (options) => new CookieAdapter(options),
  indexedDB: (options) => new IndexedDBAdapter(options),
  localStorage: (options) => new LocalStorageAdapter(options),
  memory: (options) => new MemoryAdapter(options),
  sessionStorage: (options) => new SessionStorageAdapter(options),
};

const BUILTIN_CODECS: Record<string, StorageCodec> = {
  json: jsonCodec,
  'raw-string': rawStringCodec,
};

export class Storage {
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

  constructor(options: StorageOptions | string = {}) {
    const normalizedOptions: StorageOptions =
      typeof options === 'string' ? { driver: options } : { ...options };

    this.driver = normalizedOptions.driver || 'localStorage';
    this.fallback = normalizeFallback(normalizedOptions.fallback);
    this.namespace = normalizeNamespace(normalizedOptions.namespace);
    this.keySeparator = normalizeKeySeparator(normalizedOptions.keySeparator);
    this.defaultTtl = normalizeTtl(normalizedOptions.ttl);
    this.clock = normalizedOptions.clock || Date.now;
    this.driverOptions = normalizedOptions.driverOptions || {};
    this.adapters = normalizedOptions.adapters || {};
    this.codec = normalizeCodec(normalizedOptions.codec || jsonCodec);
    this.codecs = normalizeCodecs(normalizedOptions.codecs, this.codec);
    this.onDriverError = normalizedOptions.onDriverError;
    this._adapter = null;
    this._adapterPromise = null;
  }

  get prefix(): string {
    if (!this.namespace) {
      return '';
    }

    return `${this.namespace}${this.keySeparator}`;
  }

  get activeDriver(): string | null {
    return this._adapter?.name || null;
  }

  get ready(): Promise<RawStorageAdapter> {
    return this._getAdapter();
  }

  async set<T = unknown>(
    key: string,
    value: T,
    options: SetOptions<T> = {}
  ): Promise<void> {
    const fullKey = this._fullKey(key);
    const adapter = await this._getAdapter();
    const expiration = this._resolveExpiration(options);
    const record = this._encodeRecordWithExpiration(
      value,
      options,
      expiration.expiresAt
    );

    await adapter.setRaw(
      fullKey,
      record,
      expiration.source === 'ttl' ? { expiresAt: expiration.expiresAt } : {}
    );
  }

  async get<T = unknown>(
    key: string,
    options: GetOptions<T> = {}
  ): Promise<T | undefined> {
    const result = await this._read(key, { deserialize: true });

    if (result === MISSING) {
      return hasOwn(options, 'defaultValue') ? options.defaultValue : undefined;
    }

    return result as T;
  }

  async has(key: string): Promise<boolean> {
    return (await this._read(key, { deserialize: false })) !== MISSING;
  }

  async delete(key: string): Promise<void> {
    const adapter = await this._getAdapter();
    await adapter.deleteRaw(this._fullKey(key));
  }

  async remove(key: string): Promise<void> {
    await this.delete(key);
  }

  async clear(): Promise<void> {
    const adapter = await this._getAdapter();
    await adapter.clearRaw(this.prefix);
  }

  async keys(): Promise<string[]> {
    return await this._liveKeys();
  }

  async rawKeys(): Promise<string[]> {
    const adapter = await this._getAdapter();
    const rawKeys = await adapter.keysRaw(this.prefix);

    return rawKeys.map((key) => key.slice(this.prefix.length));
  }

  async values(): Promise<unknown[]> {
    const entries = await this.entries();
    return entries.map((entry) => entry[1]);
  }

  async entries(): Promise<Array<[string, unknown]>> {
    const keys = await this.keys();
    const entries: Array<[string, unknown]> = [];

    for (const key of keys) {
      const value = await this._read(key, { deserialize: true });

      if (value !== MISSING) {
        entries.push([key, value]);
      }
    }

    return entries;
  }

  async size(): Promise<number> {
    return (await this.keys()).length;
  }

  async prune(options: PruneOptions = {}): Promise<number> {
    const adapter = await this._getAdapter();
    const rawKeys = await adapter.keysRaw(this.prefix);
    let deleted = 0;

    for (const rawKey of rawKeys) {
      const raw = await adapter.getRaw(rawKey);

      if (raw === undefined) {
        continue;
      }

      const action = this._inspectRaw(raw, rawKey, {
        removeInvalid: options.removeInvalid === true,
      });

      if (action === 'delete') {
        await adapter.deleteRaw(rawKey);
        deleted += 1;
      }
    }

    return deleted;
  }

  async close(): Promise<void> {
    if (this._adapter?.close) {
      await this._adapter.close();
    }

    this._adapter = null;
    this._adapterPromise = null;
  }

  async _read(
    key: string,
    options: { deserialize: boolean }
  ): Promise<unknown> {
    const fullKey = this._fullKey(key);
    const adapter = await this._getAdapter();
    const raw = await adapter.getRaw(fullKey);

    if (raw === undefined) {
      return MISSING;
    }

    const record = this._decodeRecord(raw, fullKey);

    if (this._isExpired(record)) {
      await adapter.deleteRaw(fullKey);
      return MISSING;
    }

    if (!options.deserialize) {
      return true;
    }

    return this._deserializeRecord(record, fullKey);
  }

  _encodeRecord<T = unknown>(value: T, options: SetOptions<T>): string {
    return this._encodeRecordWithExpiration(
      value,
      options,
      this._resolveExpiresAt(options)
    );
  }

  _encodeRecordWithExpiration<T = unknown>(
    value: T,
    options: SetOptions<T>,
    expiresAt: number | null
  ): string {
    const codec = normalizeCodec(options.codec || this.codec);
    let payload: unknown;

    this.codecs.set(codec.name, codec);

    try {
      payload = codec.serialize(value);
    } catch (cause) {
      if (cause instanceof StorageSerializationError) {
        throw cause;
      }

      throw new StorageSerializationError('Failed to serialize value.', {
        cause,
      });
    }

    if (
      payload === undefined ||
      typeof payload === 'function' ||
      typeof payload === 'symbol'
    ) {
      throw new StorageSerializationError(
        'Storage codec serialize() must return a JSON-compatible value.'
      );
    }

    try {
      return JSON.stringify({
        v: RECORD_VERSION,
        c: codec.name || 'custom',
        e: expiresAt,
        val: payload,
      });
    } catch (cause) {
      throw new StorageSerializationError(
        'Failed to encode storage record as JSON.',
        { cause }
      );
    }
  }

  _decodeRecord(raw: string, fullKey: string): StorageRecord {
    let record: unknown;

    try {
      record = JSON.parse(raw);
    } catch (cause) {
      throw new StorageDataError('Stored record is not valid JSON.', {
        key: fullKey,
        cause,
      });
    }

    if (
      !isObject(record) ||
      record.v !== RECORD_VERSION ||
      !hasOwn(record, 'val') ||
      !hasOwn(record, 'e') ||
      (record.e !== null && typeof record.e !== 'number') ||
      typeof record.c !== 'string'
    ) {
      throw new StorageDataError('Stored record has an unsupported format.', {
        key: fullKey,
        details: record,
      });
    }

    return {
      codec: record.c,
      expiresAt: record.e,
      v: RECORD_VERSION,
      value: record.val,
    };
  }

  _deserializeRecord(record: StorageRecord, fullKey: string): unknown {
    const codec = this.codecs.get(record.codec);

    if (!codec) {
      throw new StorageSerializationError(
        `No codec registered for stored record codec "${record.codec}".`,
        { key: fullKey }
      );
    }

    try {
      return codec.deserialize(record.value);
    } catch (cause) {
      if (cause instanceof StorageSerializationError) {
        throw cause;
      }

      throw new StorageSerializationError('Failed to deserialize value.', {
        key: fullKey,
        cause,
      });
    }
  }

  _inspectRaw(
    raw: string,
    fullKey: string,
    options: { removeInvalid: boolean }
  ): InspectAction {
    try {
      const record = this._decodeRecord(raw, fullKey);
      return this._isExpired(record) ? 'delete' : 'keep';
    } catch (error) {
      if (options.removeInvalid) {
        return 'delete';
      }

      throw error;
    }
  }

  _isExpired(record: StorageRecord): boolean {
    return record.expiresAt !== null && record.expiresAt <= this.clock();
  }

  _resolveExpiresAt(options: SetOptions): number | null {
    return this._resolveExpiration(options).expiresAt;
  }

  _resolveExpiration(options: SetOptions): StorageExpiration {
    if (hasOwn(options, 'expiresAt')) {
      if (options.expiresAt === null || options.expiresAt === false) {
        return { expiresAt: null, source: 'expiresAt' };
      }

      return {
        expiresAt: normalizeTimestamp(options.expiresAt, 'expiresAt'),
        source: 'expiresAt',
      };
    }

    const hasTtl = hasOwn(options, 'ttl') || this.defaultTtl !== null;
    const ttl = hasOwn(options, 'ttl')
      ? normalizeTtl(options.ttl)
      : this.defaultTtl;

    return {
      expiresAt: ttl === null ? null : this.clock() + ttl,
      source: hasTtl ? 'ttl' : 'none',
    };
  }

  _fullKey(key: string): string {
    return `${this.prefix}${assertKey(key)}`;
  }

  async _getAdapter(): Promise<RawStorageAdapter> {
    if (this._adapter) {
      return this._adapter;
    }

    if (!this._adapterPromise) {
      this._adapterPromise = this._selectAdapter();
    }

    this._adapter = await this._adapterPromise;
    return this._adapter;
  }

  async _selectAdapter(): Promise<RawStorageAdapter> {
    const drivers = uniqueByIdentity([this.driver, ...this.fallback]);
    const errors: Array<{ driver: string; error: unknown }> = [];

    for (const driver of drivers) {
      try {
        const adapter = this._createAdapter(driver);
        const available =
          typeof adapter.isAvailable === 'function'
            ? await adapter.isAvailable()
            : true;

        if (available) {
          return adapter;
        }

        errors.push({
          driver: adapter.name,
          error: 'Driver reported unavailable.',
        });
      } catch (error) {
        const name = driverName(driver);
        errors.push({ driver: name, error });
        this.onDriverError?.(error, name);
      }
    }

    throw new StorageUnavailableError(
      'No configured storage driver is usable.',
      {
        details: errors,
      }
    );
  }

  _createAdapter(driver: StorageDriver): RawStorageAdapter {
    if (isAdapter(driver)) {
      return driver;
    }

    if (typeof driver === 'function') {
      const adapter = driver({
        driverOptions: this.driverOptions,
        storage: this,
      });

      if (!isAdapter(adapter)) {
        throw new TypeError('Custom storage driver must return an adapter.');
      }

      return adapter;
    }

    if (typeof driver !== 'string') {
      throw new TypeError(
        'Storage driver must be a string, adapter, or factory.'
      );
    }

    const customAdapter = this.adapters[driver];

    if (customAdapter) {
      return this._createAdapter(customAdapter);
    }

    const createAdapter = BUILTIN_ADAPTERS[driver as BuiltinStorageDriver];

    if (!createAdapter) {
      throw new StorageUnavailableError(
        `Unsupported storage driver: ${driver}`,
        {
          driver,
        }
      );
    }

    return createAdapter(this._driverOptions(driver));
  }

  _driverOptions(driver: string): DriverOptions {
    const options = this.driverOptions || {};
    const nestedKeys = [
      'cookie',
      'indexedDB',
      'localStorage',
      'memory',
      'sessionStorage',
      'shared',
    ];
    const usesNestedOptions = nestedKeys.some((key) => hasOwn(options, key));

    if (!usesNestedOptions) {
      return options;
    }

    const shared = isObject(options.shared) ? options.shared : {};
    const specific = isObject(options[driver]) ? options[driver] : {};

    return { ...shared, ...specific };
  }

  async _liveKeys(): Promise<string[]> {
    const adapter = await this._getAdapter();
    const rawKeys = await adapter.keysRaw(this.prefix);
    const keys: string[] = [];

    for (const rawKey of rawKeys) {
      const raw = await adapter.getRaw(rawKey);

      if (raw === undefined) {
        continue;
      }

      const record = this._decodeRecord(raw, rawKey);

      if (this._isExpired(record)) {
        await adapter.deleteRaw(rawKey);
        continue;
      }

      keys.push(rawKey.slice(this.prefix.length));
    }

    return keys;
  }
}

export function createStorage(options?: StorageOptions | string): Storage {
  return new Storage(options);
}

function normalizeFallback(
  fallback: StorageOptions['fallback']
): StorageDriver[] {
  if (fallback === undefined || fallback === null || fallback === false) {
    return [];
  }

  if (typeof fallback === 'string' || isAdapter(fallback)) {
    return [fallback];
  }

  if (typeof fallback === 'function') {
    return [fallback];
  }

  if (!Array.isArray(fallback)) {
    throw new TypeError('Storage fallback must be a driver or an array.');
  }

  return fallback;
}

function normalizeCodec(codec: string | StorageCodec): StorageCodec {
  if (typeof codec === 'string') {
    const builtin = BUILTIN_CODECS[codec];

    if (!builtin) {
      throw new StorageSerializationError(
        `Unsupported storage codec: ${codec}`
      );
    }

    return builtin;
  }

  if (
    !codec ||
    typeof codec.serialize !== 'function' ||
    typeof codec.deserialize !== 'function'
  ) {
    throw new TypeError(
      'Storage codec must provide serialize(value) and deserialize(value).'
    );
  }

  return {
    name: codec.name || 'custom',
    serialize: codec.serialize.bind(codec),
    deserialize: codec.deserialize.bind(codec),
  };
}

function normalizeCodecs(
  codecs: StorageOptions['codecs'],
  activeCodec: StorageCodec
): Map<string, StorageCodec> {
  const registry = new Map<string, StorageCodec>();

  for (const codec of Object.values(BUILTIN_CODECS)) {
    registry.set(codec.name, codec);
  }

  registry.set(activeCodec.name, activeCodec);

  if (!codecs) {
    return registry;
  }

  const list = Array.isArray(codecs) ? codecs : Object.values(codecs);

  for (const codec of list) {
    const normalized = normalizeCodec(codec);
    registry.set(normalized.name, normalized);
  }

  return registry;
}

function isAdapter(value: unknown): value is RawStorageAdapter {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.getRaw === 'function' &&
    typeof value.setRaw === 'function' &&
    typeof value.deleteRaw === 'function' &&
    typeof value.clearRaw === 'function' &&
    typeof value.keysRaw === 'function'
  );
}

function driverName(driver: StorageDriver): string {
  return typeof driver === 'string' ? driver : driver.name || 'custom';
}
