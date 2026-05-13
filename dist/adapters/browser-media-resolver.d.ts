import { MediaResolver } from '../types.js';

/**
 * Default browser-side {@link MediaResolver}.
 *
 * - Local file paths are not meaningful in a pure browser (no FS access);
 *   returns a 1×1 transparent PNG fallback URL with a warning.
 * - Remote URLs are returned as-is (browser handles via native `img.src`).
 *
 * Per v0.60.0-pre §3.7: errors **resolve** with a fallback URL rather than
 * reject, to prevent NodeView crashes on missing assets.
 */
declare class BrowserMediaResolver implements MediaResolver {
    /** 1×1 transparent PNG used as fallback for missing local assets. */
    static readonly FALLBACK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
    loadLocalImage(_absolutePath: string): Promise<string>;
    loadLocalMedia(_absolutePath: string): Promise<string>;
    loadRemoteMedia(url: string): Promise<string>;
}

export { BrowserMediaResolver };
