// Generated images arrive as bare base64 (b64_json) without a MIME type. Most are PNG, but a
// request may ask for JPEG/WebP, and GPT Image 2.6 can return an animated GIF or an SVG, so the
// type is read from the leading bytes instead of being assumed.

const BASE64_SIGNATURES: Array<[prefix: string, mime: string]> = [
    ["R0lGOD", "image/gif"], // GIF87a / GIF89a
    ["iVBORw0KGgo", "image/png"],
    ["/9j/", "image/jpeg"],
    ["UklGR", "image/webp"], // RIFF....WEBP
    ["PD94bWwg", "image/svg+xml"], // <?xml
    ["PHN2Zy", "image/svg+xml"], // <svg
];

export function base64ImageMime(base64: string, fallback = "image/png") {
    const head = base64.trimStart().slice(0, 16);
    return BASE64_SIGNATURES.find(([prefix]) => head.startsWith(prefix))?.[1] || fallback;
}

export function base64ImageDataUrl(base64: string) {
    return `data:${base64ImageMime(base64)};base64,${base64}`;
}

export function isGifBytes(bytes: Uint8Array) {
    return bytes.length > 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46; // "GIF"
}

/** File extension for an image MIME type ("image/jpeg" → "jpg"); undefined when unknown. */
export function imageMimeExtension(mimeType?: string) {
    const subtype = (mimeType || "").toLowerCase().match(/^image\/([a-z0-9.+-]+)/)?.[1];
    if (!subtype) return undefined;
    if (subtype === "jpeg" || subtype === "pjpeg") return "jpg";
    if (subtype === "svg+xml") return "svg";
    return subtype;
}
