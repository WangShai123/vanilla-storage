import { StorageSerializationError } from '../errors.js';

export const rawStringCodec = {
  name: 'raw-string',

  serialize(value) {
    if (typeof value !== 'string') {
      throw new StorageSerializationError(
        'Raw string codec can only serialize string values.'
      );
    }

    return value;
  },

  deserialize(payload) {
    return payload;
  },
};
