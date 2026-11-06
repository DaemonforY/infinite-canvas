import { describe, expect, test } from "bun:test";

import { base64ImageDataUrl, base64ImageMime, imageMimeExtension, isGifBytes } from "./image-format";

describe("image-format", () => {
    test("reads the type of a b64_json result from its first bytes", () => {
        expect(base64ImageMime("R0lGODlhAQABAAAAACw=")).toBe("image/gif");
        expect(base64ImageMime("iVBORw0KGgoAAAANSUhEUg")).toBe("image/png");
        expect(base64ImageMime("/9j/4AAQSkZJRg")).toBe("image/jpeg");
        expect(base64ImageMime("UklGRiQAAABXRUJQ")).toBe("image/webp");
        expect(base64ImageMime("PHN2ZyB4bWxucz0")).toBe("image/svg+xml");
        expect(base64ImageMime("AAAA")).toBe("image/png");
        expect(base64ImageDataUrl("R0lGODlhAQAB")).toBe("data:image/gif;base64,R0lGODlhAQAB");
    });

    test("maps MIME types to file extensions", () => {
        expect(imageMimeExtension("image/gif")).toBe("gif");
        expect(imageMimeExtension("image/jpeg")).toBe("jpg");
        expect(imageMimeExtension("image/svg+xml")).toBe("svg");
        expect(imageMimeExtension("")).toBeUndefined();
        expect(isGifBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe(true);
        expect(isGifBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    });
});
