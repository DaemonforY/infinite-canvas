import { applyAdjustments, rotatedSize, type Adjustments, type Geometry } from "./adjustments";

export function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Remote images (e.g. prompt-library covers via the same-origin relay) must not taint the canvas.
        if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image load failed"));
        img.src = src;
    });
}

/**
 * Draws the image with rotation / flips and applies the adjustments.
 * `maxLongEdge` downsamples for fast previews; omit it to render at full resolution for export.
 */
export function renderEdited(img: HTMLImageElement, geometry: Geometry, adjustments: Adjustments, maxLongEdge?: number, target?: HTMLCanvasElement): HTMLCanvasElement {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = maxLongEdge ? Math.min(1, maxLongEdge / Math.max(srcW, srcH)) : 1;
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const out = rotatedSize(w, h, geometry.rotate);

    const canvas = target || document.createElement("canvas");
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas unavailable");
    ctx.save();
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((geometry.rotate * Math.PI) / 180);
    ctx.scale(geometry.flipH ? -1 : 1, geometry.flipV ? -1 : 1);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    const pixels = ctx.getImageData(0, 0, out.width, out.height);
    applyAdjustments(pixels, adjustments);
    ctx.putImageData(pixels, 0, 0);
    return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
    const type = mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export failed"))), type, 0.92));
}

/** Guesses the source format so edits keep it (JPEG stays JPEG, everything else becomes PNG). */
export function mimeTypeOf(src: string, fallback = "image/png"): string {
    const match = /^data:(image\/[a-z+]+);/i.exec(src);
    if (match) return match[1].toLowerCase();
    if (/\.jpe?g(\?|$)/i.test(src)) return "image/jpeg";
    if (/\.webp(\?|$)/i.test(src)) return "image/webp";
    return fallback;
}
