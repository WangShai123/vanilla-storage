import { StorageSerializationError } from '../errors.js';

export const jsonCodec = {
  name: 'json',

  serialize(value) {
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new StorageSerializationError(
        'JSON codec cannot serialize functions or symbols.'
      );
    }

    if (value === undefined) {
      return '{"type":"undefined"}';
    }

    try {
      return JSON.stringify({ type: 'json', value });
    } catch (cause) {
      throw new StorageSerializationError(
        'Failed to serialize value with JSON codec.',
        { cause }
      );
    }
  },

  deserialize(payload) {
    try {
      const decoded = JSON.parse(payload);

      if (decoded?.type === 'undefined') {
        return undefined;
      }

      if (decoded?.type === 'json') {
        return decoded.value;
      }

      throw new Error('Invalid JSON codec payload.');
    } catch (cause) {
      throw new StorageSerializationError(
        'Failed to deserialize value with JSON codec.',
        { cause }
      );
    }
  },
};
