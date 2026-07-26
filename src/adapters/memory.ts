import type { RawStorageAdapter } from '../utils.js';

export interface MemoryAdapterOptions {
  map?: Map<string, string>;
}

export class MemoryAdapter implements RawStorageAdapter {
  name = 'memory';
  map: Map<string, string>;

  constructor(options: MemoryAdapterOptions = {}) {
    this.map = options.map || new Map();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getRaw(key: string): Promise<string | undefined> {
    return this.map.has(key) ? this.map.get(key) : undefined;
  }

  async setRaw(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async deleteRaw(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clearRaw(prefix = ''): Promise<void> {
    for (const key of this.map.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        this.map.delete(key);
      }
    }
  }

  async keysRaw(prefix = ''): Promise<string[]> {
    return Array.from(this.map.keys()).filter((key) => {
      return !prefix || key.startsWith(prefix);
    });
  }
}
