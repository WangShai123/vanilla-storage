export const MISSING = Symbol('vanilla-storage.missing');

export interface RawStorageAdapter {
  name: string;
  isAvailable?: () => boolean | Promise<boolean>;
  getRaw: (key: string) => Promise<string | undefined>;
  setRaw: (key: string, value: string) => Promise<void>;
  deleteRaw: (key: string) => Promise<void>;
  clearRaw: (prefix?: string) => Promise<void>;
  keysRaw: (prefix?: string) => Promise<string[]>;
  close?: () => void | Promise<void>;
}

export function hasOwn<K extends PropertyKey>(
  object: unknown,
  key: K
): object is Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function assertKey(key: unknown): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Storage key must be a non-empty string.');
  }

  return key;
}

export function normalizeNamespace(namespace: unknown): string {
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

export function normalizeKeySeparator(separator: unknown): string {
  if (separator === undefined) {
    return '::';
  }

  if (typeof separator !== 'string') {
    throw new TypeError('Storage keySeparator must be a string.');
  }

  return separator;
}

export function normalizeTimestamp(value: unknown, optionName: string): number {
  const timestamp = value instanceof Date ? value.getTime() : value;

  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    throw new TypeError(`${optionName} must be a finite timestamp or Date.`);
  }

  return timestamp;
}

export function normalizeTtl(
  value: unknown,
  optionName = 'ttl'
): number | null {
  if (value === undefined || value === null || value === false) {
    return null;
  }

  if (value === Infinity) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${optionName} must be a non-negative number.`);
  }

  return value;
}

export function uniqueByIdentity<T>(items: T[]): T[] {
  const seen = new Set<unknown>();
  const result: T[] = [];

  for (const item of items) {
    const identity =
      typeof item === 'string'
        ? item
        : ((item as { name?: string } | null)?.name ?? item);

    if (!seen.has(identity)) {
      seen.add(identity);
      result.push(item);
    }
  }

  return result;
}
