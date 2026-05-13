// src/adapters/browser-media-resolver.ts
var BrowserMediaResolver = class _BrowserMediaResolver {
  /** 1×1 transparent PNG used as fallback for missing local assets. */
  static FALLBACK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
  async loadLocalImage(_absolutePath) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[BrowserMediaResolver] loadLocalImage called with local path; returning fallback PNG");
    }
    return _BrowserMediaResolver.FALLBACK_PNG;
  }
  async loadLocalMedia(_absolutePath) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[BrowserMediaResolver] loadLocalMedia called with local path; returning empty fallback");
    }
    return _BrowserMediaResolver.FALLBACK_PNG;
  }
  async loadRemoteMedia(url) {
    return url;
  }
};
export {
  BrowserMediaResolver
};
//# sourceMappingURL=browser-media-resolver.js.map