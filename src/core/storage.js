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

const BUILTIN_ADAPTERS = {
  cookie: (options) => new CookieAdapter(options),
  indexedDB: (options) => new IndexedDBAdapter(options),
  localStorage: (options) => new LocalStorageAdapter(options),
  memory: (options) => new MemoryAdapter(options),
  sessionStorage: (options) => new SessionStorageAdapter(options),
};

const BUILTIN_CODECS = {
  json: jsonCodec,
  'raw-string': rawStringCodec,
};

export class Storage {
  constructor(options = {}) {
    const normalizedOptions =
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

  get prefix() {
    if (!this.namespace) {
      return '';
    }

    return `${this.namespace}${this.keySeparator}`;
  }

  get activeDriver() {
    return this._adapter?.name || null;
  }

  get ready() {
    return this._getAdapter();
  }

  async set(key, value, options = {}) {
    const fullKey = this._fullKey(key);
    const adapter = await this._getAdapter();
    const record = this._encodeRecord(value, options);

    await adapter.setRaw(fullKey, record);
  }

  async get(key, options = {}) {
    const result = await this._read(key, { deserialize: true });

    if (result === MISSING) {
      return hasOwn(options, 'defaultValue') ? options.defaultValue : undefined;
    }

    return result;
  }

  async has(key) {
    return (await this._read(key, { deserialize: false })) !== MISSING;
  }

  async delete(key) {
    const adapter = await this._getAdapter();
    await adapter.deleteRaw(this._fullKey(key));
  }

  async remove(key) {
    await this.delete(key);
  }

  async clear() {
    const adapter = await this._getAdapter();
    await adapter.clearRaw(this.prefix);
  }

  async keys() {
    return await this._liveKeys();
  }

  async rawKeys() {
    const adapter = await this._getAdapter();
    const rawKeys = await adapter.keysRaw(this.prefix);

    return rawKeys.map((key) => key.slice(this.prefix.length));
  }

  async values() {
    const entries = await this.entries();
    return entries.map((entry) => entry[1]);
  }

  async entries() {
    const keys = await this.keys();
    const entries = [];

    for (const key of keys) {
      const value = await this._read(key, { deserialize: true });

      if (value !== MISSING) {
        entries.push([key, value]);
      }
    }

    return entries;
  }

  async size() {
    return (await this.keys()).length;
  }

  async prune(options = {}) {
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

  async close() {
    if (this._adapter?.close) {
      await this._adapter.close();
    }

    this._adapter = null;
    this._adapterPromise = null;
  }

  async _read(key, options) {
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

  _encodeRecord(value, options) {
    const codec = normalizeCodec(options.codec || this.codec);
    const expiresAt = this._resolveExpiresAt(options);
    let payload;

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

    if (typeof payload !== 'string') {
      throw new StorageSerializationError(
        'Storage codec serialize() must return a string.'
      );
    }

    return JSON.stringify({
      v: RECORD_VERSION,
      codec: codec.name || 'custom',
      expiresAt,
      value: payload,
    });
  }

  _decodeRecord(raw, fullKey) {
    let record;

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
      typeof record.value !== 'string' ||
      !hasOwn(record, 'expiresAt')
    ) {
      throw new StorageDataError('Stored record has an unsupported format.', {
        key: fullKey,
        details: record,
      });
    }

    return record;
  }

  _deserializeRecord(record, fullKey) {
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

  _inspectRaw(raw, fullKey, options) {
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

  _isExpired(record) {
    return record.expiresAt !== null && record.expiresAt <= this.clock();
  }

  _resolveExpiresAt(options) {
    if (hasOwn(options, 'expiresAt')) {
      if (options.expiresAt === null || options.expiresAt === false) {
        return null;
      }

      return normalizeTimestamp(options.expiresAt, 'expiresAt');
    }

    const ttl = hasOwn(options, 'ttl')
      ? normalizeTtl(options.ttl)
      : this.defaultTtl;

    return ttl === null ? null : this.clock() + ttl;
  }

  _fullKey(key) {
    return `${this.prefix}${assertKey(key)}`;
  }

  async _getAdapter() {
    if (this._adapter) {
      return this._adapter;
    }

    if (!this._adapterPromise) {
      this._adapterPromise = this._selectAdapter();
    }

    this._adapter = await this._adapterPromise;
    return this._adapter;
  }

  async _selectAdapter() {
    const drivers = uniqueByIdentity([this.driver, ...this.fallback]);
    const errors = [];

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
        const name =
          typeof driver === 'string' ? driver : driver?.name || 'custom';
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

  _createAdapter(driver) {
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

    const createAdapter = BUILTIN_ADAPTERS[driver];

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

  _driverOptions(driver) {
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

    return {
      ...options.shared,
      ...options[driver],
    };
  }

  async _liveKeys() {
    const adapter = await this._getAdapter();
    const rawKeys = await adapter.keysRaw(this.prefix);
    const keys = [];

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

export function createStorage(options) {
  return new Storage(options);
}

function normalizeFallback(fallback) {
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

function normalizeCodec(codec) {
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

function normalizeCodecs(codecs, activeCodec) {
  const registry = new Map();

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

function isAdapter(value) {
  return (
    value &&
    typeof value.getRaw === 'function' &&
    typeof value.setRaw === 'function' &&
    typeof value.deleteRaw === 'function' &&
    typeof value.clearRaw === 'function' &&
    typeof value.keysRaw === 'function'
  );
}
