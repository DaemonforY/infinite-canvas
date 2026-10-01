// Image toolbox (compress / convert / resize), run entirely in the browser: nothing is uploaded.
// Used by the /tools page and by the reference images of the workbenches.

export type ImageToolFormat = "original" | "jpeg" | "webp" | "png";
export type ImageToolResize = { mode: "none" } | { mode: "longEdge"; value: number } | { mode: "percent"; value: number };
export type ImageToolOptions = {
    format: ImageToolFormat;
    /** 0.4–1, for JPEG / WebP. */
    quality: number;
    resize: ImageToolResize;
    /** Shrink until the file is at most this big (0 = no target). */
    targetBytes: number;
};
export type ImageToolResult = {
    blob: Blob;
    name: string;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
    /** Scaled down to the browser's canvas limit. */
    capped: boolean;
    /** Re-encoding did not make it smaller, so the original file is returned. */
    kept: boolean;
};

export const DEFAULT_IMAGE_TOOL_OPTIONS: ImageToolOptions = { format: "original", quality: 0.85, resize: { mode: "none" }, targetBytes: 0 };

/** Safari (and iOS in particular) refuses canvases above ~16.7M pixels. */
export const MAX_CANVAS_PIXELS = 16_777_216;

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export function isHeicFile(file: { name?: string; type?: string }) {
    return HEIC_TYPES.has((file.type || "").toLowerCase()) || /\.(heic|heif)$/i.test(file.name || "");
}

/** Files the tools accept: anything the browser calls an image, plus HEIC photos it may not label. */
export function isImageFile(file: { name?: string; type?: string }) {
    return (file.type || "").startsWith("image/") || isHeicFile(file);
}

export function resolveOutputSize(width: number, height: number, resize: ImageToolResize, maxPixels = MAX_CANVAS_PIXELS) {
    let scale = 1;
    if (resize.mode === "longEdge" && resize.value > 0) scale = Math.min(1, resize.value / Math.max(width, height));
    if (resize.mode === "percent" && resize.value > 0) scale = Math.min(1, resize.value / 100);
    const capped = width * height * scale * scale > maxPixels;
    if (capped) scale = Math.sqrt(maxPixels / (width * height));
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), capped };
}

/** "original" keeps JPEG / PNG / WebP; other sources (HEIC, GIF, BMP…) become JPEG. */
export function resolveOutputType(sourceType: string, format: ImageToolFormat) {
    if (format !== "original") return `image/${format}`;
    const type = sourceType.toLowerCase();
    return type === "image/png" || type === "image/webp" || type === "image/jpeg" ? type : "image/jpeg";
}

export function renameForType(name: string, type: string) {
    const ext = type === "image/jpeg" ? "jpg" : type.split("/")[1] || "png";
    return `${(name || "image").replace(/\.[^./]+$/, "") || "image"}.${ext}`;
}

/** Qualities tried, from the chosen one down, to reach a target size. */
export function qualitySteps(quality: number) {
    const steps = [quality, 0.8, 0.7, 0.6, 0.5].filter((value) => value <= quality);
    return [...new Set(steps.map((value) => Math.round(value * 100) / 100))];
}

export async function decodeImage(blob: Blob, name = ""): Promise<ImageBitmap> {
    try {
        return await createImageBitmap(blob);
    } catch (error) {
        if (!isHeicFile({ name, type: blob.type })) throw error;
        // Only Safari decodes HEIC itself; elsewhere load the decoder on demand (~1MB gzipped).
        const { heicTo } = await import("heic-to");
        return heicTo({ blob, type: "bitmap" });
    }
}

async function encode(bitmap: ImageBitmap, width: number, height: number, type: string, quality: number): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    // JPEG has no transparency: paint white instead of letting it turn black.
    if (type === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("export failed");
    return blob;
}

/** Re-encodes one image with the options; with a target size, lowers quality and then dimensions until it fits. */
export async function processImage(source: Blob, name: string, options: ImageToolOptions): Promise<ImageToolResult> {
    const bitmap = await decodeImage(source, name);
    try {
        const sourceWidth = bitmap.width;
        const sourceHeight = bitmap.height;
        const type = resolveOutputType(source.type || (isHeicFile({ name }) ? "image/heic" : ""), options.format);
        let { width, height, capped } = resolveOutputSize(sourceWidth, sourceHeight, options.resize);
        const lossy = type !== "image/png";
        let blob = await encode(bitmap, width, height, type, options.quality);
        if (options.targetBytes > 0) {
            for (const quality of lossy ? qualitySteps(options.quality).slice(1) : []) {
                if (blob.size <= options.targetBytes) break;
                blob = await encode(bitmap, width, height, type, quality);
            }
            for (let attempt = 0; attempt < 6 && blob.size > options.targetBytes && Math.max(width, height) > 256; attempt += 1) {
                const scale = Math.max(0.5, Math.min(0.9, Math.sqrt(options.targetBytes / blob.size)));
                width = Math.max(1, Math.floor(width * scale));
                height = Math.max(1, Math.floor(height * scale));
                blob = await encode(bitmap, width, height, type, lossy ? Math.min(options.quality, 0.8) : 1);
            }
        }
        const kept = type === source.type && width === sourceWidth && height === sourceHeight && blob.size >= source.size;
        return { blob: kept ? source : blob, name: kept ? name : renameForType(name, type), width, height, sourceWidth, sourceHeight, capped, kept };
    } finally {
        bitmap.close();
    }
}

/** Uploads must be something every browser and the model can read: HEIC photos become JPEG, the rest pass through. */
export async function normalizeImageFile(file: File): Promise<File> {
    if (!isHeicFile(file)) return file;
    const result = await processImage(file, file.name, { ...DEFAULT_IMAGE_TOOL_OPTIONS, format: "jpeg", quality: 0.9 });
    return new File([result.blob], result.name, { type: result.blob.type });
}
