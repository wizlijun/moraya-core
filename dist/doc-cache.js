// src/doc-cache.ts
var LRUDocCache = class {
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    if (maxEntries < 1) throw new RangeError("docCache maxEntries must be \u2265 1");
  }
  maxEntries;
  map = /* @__PURE__ */ new Map();
  get size() {
    return this.map.size;
  }
  get(hash) {
    const v = this.map.get(hash);
    if (v !== void 0) {
      this.map.delete(hash);
      this.map.set(hash, v);
    }
    return v;
  }
  set(hash, doc) {
    if (this.map.has(hash)) {
      this.map.delete(hash);
    }
    this.map.set(hash, doc);
    if (this.map.size > this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== void 0) {
        this.map.delete(firstKey);
      }
    }
  }
  clear() {
    this.map.clear();
  }
};
function createDocCache(maxEntries = 10) {
  return new LRUDocCache(maxEntries);
}
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = hash * 33 ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}
export {
  createDocCache,
  djb2Hash
};
//# sourceMappingURL=doc-cache.js.map