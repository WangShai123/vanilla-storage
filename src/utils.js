export const MISSING = Symbol('vanilla-storage.missing');

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function isObject(value) {
  return value !== null && typeof value === 'object';
}

export function assertKey(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Storage key must be a non-empty string.');
  }

  return key;
}

export function normalizeNamespace(namespace) {
  if (namespace === undefined) {
    return 'vanilla-storage';
  }

  if (namespace === null || namespace === false) {
    return '';
  }

  if (typeof namespace !== 'string') {
    throw new TypeError('Storage namespace must be a string.');
  }

  return namespace;
}

export function normalizeKeySeparator(separator) {
  if (separator === undefined) {
    return '::';
  }

  if (typeof separator !== 'string') {
    throw new TypeError('Storage keySeparator must be a string.');
  }

  return separator;
}

export function normalizeTimestamp(value, optionName) {
  const timestamp = value instanceof Date ? value.getTime() : value;

  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${optionName} must be a finite timestamp or Date.`);
  }

  return timestamp;
}

export function normalizeTtl(value, optionName = 'ttl') {
  if (value === undefined || value === null || value === false) {
    return null;
  }

  if (value === Infinity) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${optionName} must be a non-negative number.`);
  }

  return value;
}

export function uniqueByIdentity(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const identity = typeof item === 'string' ? item : item?.name || item;

    if (!seen.has(identity)) {
      seen.add(identity);
      result.push(item);
    }
  }

  return result;
}
