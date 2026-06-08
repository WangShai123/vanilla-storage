export class MemoryAdapter {
  constructor(options = {}) {
    this.name = 'memory';
    this.map = options.map || new Map();
  }

  async isAvailable() {
    return true;
  }

  async getRaw(key) {
    return this.map.has(key) ? this.map.get(key) : undefined;
  }

  async setRaw(key, value) {
    this.map.set(key, value);
  }

  async deleteRaw(key) {
    this.map.delete(key);
  }

  async clearRaw(prefix = '') {
    for (const key of this.map.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        this.map.delete(key);
      }
    }
  }

  async keysRaw(prefix = '') {
    return Array.from(this.map.keys()).filter((key) => {
      return !prefix || key.startsWith(prefix);
    });
  }
}
