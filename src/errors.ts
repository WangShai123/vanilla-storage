export interface VanillaStorageErrorOptions {
  code?: string;
  driver?: string;
  key?: string;
  details?: unknown;
  cause?: unknown;
}

export class VanillaStorageError extends Error {
  code: string;
  driver?: string;
  key?: string;
  details?: unknown;
  declare cause?: unknown;

  constructor(message: string, options: VanillaStorageErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'STORAGE_ERROR';

    if (options.driver) {
      this.driver = options.driver;
    }

    if (options.key) {
      this.key = options.key;
    }

    if (options.details) {
      this.details = options.details;
    }

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export class StorageUnavailableError extends VanillaStorageError {
  constructor(message: string, options: VanillaStorageErrorOptions = {}) {
    super(message, { ...options, code: 'DRIVER_UNAVAILABLE' });
  }
}

export class StorageQuotaError extends VanillaStorageError {
  constructor(message: string, options: VanillaStorageErrorOptions = {}) {
    super(message, { ...options, code: 'QUOTA_EXCEEDED' });
  }
}

export class StorageSerializationError extends VanillaStorageError {
  constructor(message: string, options: VanillaStorageErrorOptions = {}) {
    super(message, { ...options, code: 'SERIALIZATION_FAILED' });
  }
}

export class StorageDataError extends VanillaStorageError {
  constructor(message: string, options: VanillaStorageErrorOptions = {}) {
    super(message, { ...options, code: 'INVALID_RECORD' });
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  const candidate = error as { code?: number; name?: string } | null;

  return (
    candidate?.name === 'QuotaExceededError' ||
    candidate?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate?.code === 22 ||
    candidate?.code === 1014
  );
}

export function toStorageError(
  error: unknown,
  options: VanillaStorageErrorOptions = {}
): VanillaStorageError {
  if (error instanceof VanillaStorageError) {
    return error;
  }

  if (isQuotaExceededError(error)) {
    return new StorageQuotaError('Storage quota exceeded.', {
      ...options,
      cause: error,
    });
  }

  return new VanillaStorageError(
    error instanceof Error ? error.message : 'Storage operation failed.',
    {
      ...options,
      cause: error,
    }
  );
}
