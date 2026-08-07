import { StorageSerializationError } from '../errors.js';

export const rawStringCodec = {
  name: 'raw-string',

  serialize(value: unknown): unknown {
    if (typeof value !== 'string') {
      throw new StorageSerializationError(
        'Raw string codec can only serialize string values.'
      );
    }

    return value;
  },

  deserialize(payload: unknown): string {
    if (typeof payload !== 'string') {
      throw new StorageSerializationError(
        'Raw string codec can only deserialize string values.'
      );
    }

    return payload;
  },
};
