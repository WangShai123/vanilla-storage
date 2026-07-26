import { StorageSerializationError } from '../errors.js';

export const jsonCodec = {
  name: 'json',

  serialize(value: unknown): string {
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

  deserialize(payload: string): unknown {
    try {
      const decoded = JSON.parse(payload);

      if (isCodecPayload(decoded) && decoded.type === 'undefined') {
        return undefined;
      }

      if (isCodecPayload(decoded) && decoded.type === 'json') {
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

function isCodecPayload(
  value: unknown
): value is { type: 'json' | 'undefined'; value?: unknown } {
  return value !== null && typeof value === 'object' && 'type' in value;
}
