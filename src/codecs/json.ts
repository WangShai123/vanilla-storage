import { StorageSerializationError } from '../errors.js';

export const jsonCodec = {
  name: 'json',

  serialize(value: unknown): unknown {
    if (value === undefined) {
      throw new StorageSerializationError(
        'JSON codec cannot serialize undefined. Use null for empty values.'
      );
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new StorageSerializationError(
        'JSON codec cannot serialize functions or symbols.'
      );
    }

    try {
      JSON.stringify(value);
      return value;
    } catch (cause) {
      throw new StorageSerializationError(
        'Failed to serialize value with JSON codec.',
        { cause }
      );
    }
  },

  deserialize(payload: unknown): unknown {
    return payload;
  },
};
