import { StorageSerializationError } from '../errors.js';

export const rawStringCodec = {
  name: 'raw-string',

  serialize(value: unknown): string {
    if (typeof value !== 'string') {
      throw new StorageSerializationError(
        'Raw string codec can only serialize string values.'
      );
    }

    return value;
  },

  deserialize(payload: string): string {
    return payload;
  },
};
