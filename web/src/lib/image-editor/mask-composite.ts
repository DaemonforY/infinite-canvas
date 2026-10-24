/**
 * Mask edits (局部重绘 / 擦除) send the whole picture to the image model, which redraws all of it, so
 * colours, faces and details outside the painted area drift. compositeMaskedRegion keeps the original
 * pixels everywhere except the painted area (slightly grown and feathered so the seam doesn't show),
 * where it takes the model's result.
 */

import { loadImageElement } from "./render";

/**
 * Grows and softens a selection: a separable box blur of `radius` px (two passes, close to a gaussian)
 * followed by a gain, so the result is fully opaque inside and just past the painted edge and fades out
 * over about `radius` px beyond it. Works on one alpha byte per pixel.
 */
export function featherAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number, gain = 2): Uint8ClampedArray {
    const r = Math.max(0, Math.round(radius));
    let current = new Float32Array(alpha.length);
    for (let i = 0; i < alpha.length; i++) current[i] = alpha[i];
    if (r > 0) {
        const tmp = new Float32Array(alpha.length);
        for (let pass = 0; pass < 2; pass++) {
            boxBlurRows(current, tmp, width, height, r);
            boxBlurCols(tmp, current, width, height, r);
        }
    }
    const out = new Uint8ClampedArray(alpha.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.min(255, current[i] * gain);
    return out;
}

function boxBlurRows(src: Float32Array, dst: Float32Array, width: number, height: number, r: number) {
    const size = r * 2 + 1;
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let sum = 0;
        for (let x = -r; x <= r; x++) sum += src[row + Math.min(width - 1, Math.max(0, x))];
        for (let x = 0; x < width; x++) {
            dst[row + x] = sum / size;
            sum += src[row + Math.min(width - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
        }
    }
}

function boxBlurCols(src: Float32Array, dst: Float32Array, width: number, height: number, r: number) {
    const size = r * 2 + 1;
    for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) sum += src[Math.min(height - 1, Math.max(0, y)) * width + x];
        for (let y = 0; y < height; y++) {
            dst[y * width + x] = sum / size;
            sum += src[Math.min(height - 1, y + r + 1) * width + x] - src[Math.max(0, y - r) * width + x];
        }
    }
}

/** Blends `result` into `original` by `mask` (0–255 per pixel). All RGBA buffers of the same size. */
export function blendByMask(original: Uint8ClampedArray, result: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray {
    const out = new Uint8ClampedArray(original.length);
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
        const a = mask[p] / 255;
        out[i] = original[i] + (result[i] - original[i]) * a;
        out[i + 1] = original[i + 1] + (result[i + 1] - original[i + 1]) * a;
        out[i + 2] = original[i + 2] + (result[i + 2] - original[i + 2]) * a;
        out[i + 3] = original[i + 3] + (result[i + 3] - original[i + 3]) * a;
    }
    return out;
}

/**
 * Where to draw the model's result over a w×h original: stretched when the aspect ratios match within 3 %
 * (the model rounds sizes to multiples of 16 / its own presets), otherwise scaled to cover and centred.
 */
export function resultPlacement(resultW: number, resultH: number, w: number, h: number): { x: number; y: number; width: number; height: number } {
    const ratio = resultW / resultH / (w / h);
    if (Math.abs(ratio - 1) <= 0.03) return { x: 0, y: 0, width: w, height: h };
    const scale = Math.max(w / resultW, h / resultH);
    const width = resultW * scale;
    const height = resultH * scale;
    return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

function context2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas unavailable");
    return [canvas, ctx];
}

/**
 * Original pixels everywhere, the model's result inside the painted region. `regionUrl` is the
 * selection (any colour, its alpha marks the painted area) at any resolution. Returns a PNG data URL
 * the size of the original. Throws when an image can't be read (e.g. a cross-origin canvas taint), so
 * callers can fall back to the raw result.
 */
export async function compositeMaskedRegion(originalUrl: string, resultUrl: string, regionUrl: string): Promise<string> {
    const [original, result, region] = await Promise.all([loadImageElement(originalUrl), loadImageElement(resultUrl), loadImageElement(regionUrl)]);
    const w = original.naturalWidth || original.width;
    const h = original.naturalHeight || original.height;

    const [outCanvas, outCtx] = context2d(w, h);
    outCtx.drawImage(original, 0, 0, w, h);
    const originalPixels = outCtx.getImageData(0, 0, w, h);

    const [, resultCtx] = context2d(w, h);
    const place = resultPlacement(result.naturalWidth || result.width, result.naturalHeight || result.height, w, h);
    resultCtx.imageSmoothingQuality = "high";
    resultCtx.drawImage(result, place.x, place.y, place.width, place.height);
    const resultPixels = resultCtx.getImageData(0, 0, w, h);

    const [, maskCtx] = context2d(w, h);
    maskCtx.drawImage(region, 0, 0, w, h);
    const maskRgba = maskCtx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8ClampedArray(w * h);
    for (let p = 0, i = 3; p < alpha.length; p++, i += 4) alpha[p] = maskRgba[i];
    const feathered = featherAlpha(alpha, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.006)));

    const merged = outCtx.createImageData(w, h);
    merged.data.set(blendByMask(originalPixels.data, resultPixels.data, feathered));
    outCtx.putImageData(merged, 0, 0);
    return outCanvas.toDataURL("image/png");
}

/**
 * compositeMaskedRegion for mask-edit results, falling back to the model's whole picture when the
 * images can't be read (a mask edit should never fail just because the merge couldn't run).
 */
export async function keepOriginalOutside(originalUrl: string, resultUrl: string, regionUrl: string | undefined): Promise<string> {
    if (!regionUrl || !originalUrl) return resultUrl;
    try {
        return await compositeMaskedRegion(originalUrl, resultUrl, regionUrl);
    } catch (error) {
        console.warn("mask composite skipped", error);
        return resultUrl;
    }
}
