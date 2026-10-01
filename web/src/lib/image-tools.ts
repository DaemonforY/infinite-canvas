// Image toolbox (compress / convert / resize / watermark), run entirely in the browser: nothing is uploaded.
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
    /** Text drawn on the image; empty text means none. */
    watermark?: ImageWatermark;
};
export type WatermarkPosition = "tl" | "tc" | "tr" | "ml" | "c" | "mr" | "bl" | "bc" | "br" | "tile";
export type ImageWatermark = {
    text: string;
    color: string;
    /** 0.1–1. */
    opacity: number;
    /** Font size as a percentage of the image's short edge (1–20). */
    size: number;
    position: WatermarkPosition;
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
export const DEFAULT_WATERMARK: ImageWatermark = { text: "", color: "#ffffff", opacity: 0.6, size: 4, position: "br" };

export function hasWatermark(watermark?: ImageWatermark): watermark is ImageWatermark {
    return Boolean(watermark?.text.trim());
}

/** Font size in pixels for a watermark on a width × height image. */
export function watermarkFontSize(width: number, height: number, size: number) {
    return Math.max(10, Math.round((Math.min(width, height) * Math.min(20, Math.max(1, size))) / 100));
}

/** Top-left corner of a block of text placed at one of the nine positions, `margin` away from the edges. */
export function watermarkOrigin(width: number, height: number, blockWidth: number, blockHeight: number, margin: number, position: Exclude<WatermarkPosition, "tile">) {
    const column = position === "tl" || position === "ml" || position === "bl" ? 0 : position === "tc" || position === "c" || position === "bc" ? 1 : 2;
    const row = position[0] === "t" ? 0 : position[0] === "b" ? 2 : 1;
    const x = column === 0 ? margin : column === 1 ? (width - blockWidth) / 2 : width - blockWidth - margin;
    const y = row === 0 ? margin : row === 1 ? (height - blockHeight) / 2 : height - blockHeight - margin;
    return { x: Math.round(x), y: Math.round(y) };
}

export function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, watermark: ImageWatermark) {
    const lines = watermark.text.trim().split(/\r?\n/).slice(0, 5);
    const fontSize = watermarkFontSize(width, height, watermark.size);
    const lineHeight = Math.round(fontSize * 1.25);
    ctx.save();
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = "top";
    ctx.globalAlpha = Math.min(1, Math.max(0.05, watermark.opacity));
    ctx.fillStyle = watermark.color;
    // A soft shadow keeps light text readable on light photos (and dark text on dark ones).
    ctx.shadowColor = isLightColor(watermark.color) ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)";
    ctx.shadowBlur = Math.max(2, fontSize * 0.12);
    const blockWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const blockHeight = lineHeight * lines.length;
    if (watermark.position === "tile") {
        ctx.translate(width / 2, height / 2);
        ctx.rotate(-Math.PI / 6);
        const stepX = blockWidth + fontSize * 4;
        const stepY = blockHeight + fontSize * 3;
        const reach = Math.hypot(width, height) / 2 + Math.max(stepX, stepY);
        for (let y = -reach, row = 0; y < reach; y += stepY, row += 1) {
            for (let x = -reach + (row % 2 ? stepX / 2 : 0); x < reach; x += stepX) {
                lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
            }
        }
    } else {
        const origin = watermarkOrigin(width, height, blockWidth, blockHeight, Math.round(fontSize * 0.8), watermark.position);
        const align = watermark.position.endsWith("l") ? "left" : watermark.position.endsWith("r") ? "right" : "center";
        lines.forEach((line, index) => {
            const lineWidth = ctx.measureText(line).width;
            const x = align === "left" ? origin.x : align === "right" ? origin.x + blockWidth - lineWidth : origin.x + (blockWidth - lineWidth) / 2;
            ctx.fillText(line, x, origin.y + index * lineHeight);
        });
    }
    ctx.restore();
}

export function isLightColor(color: string) {
    const hex = color.replace("#", "");
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex.slice(0, 6);
    const value = Number.parseInt(full, 16);
    if (Number.isNaN(value)) return true;
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

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

async function encode(bitmap: ImageBitmap, width: number, height: number, type: string, quality: number, watermark?: ImageWatermark): Promise<Blob> {
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
    if (hasWatermark(watermark)) drawWatermark(ctx, width, height, watermark);
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
        const watermark = hasWatermark(options.watermark) ? options.watermark : undefined;
        let blob = await encode(bitmap, width, height, type, options.quality, watermark);
        if (options.targetBytes > 0) {
            for (const quality of lossy ? qualitySteps(options.quality).slice(1) : []) {
                if (blob.size <= options.targetBytes) break;
                blob = await encode(bitmap, width, height, type, quality, watermark);
            }
            for (let attempt = 0; attempt < 6 && blob.size > options.targetBytes && Math.max(width, height) > 256; attempt += 1) {
                const scale = Math.max(0.5, Math.min(0.9, Math.sqrt(options.targetBytes / blob.size)));
                width = Math.max(1, Math.floor(width * scale));
                height = Math.max(1, Math.floor(height * scale));
                blob = await encode(bitmap, width, height, type, lossy ? Math.min(options.quality, 0.8) : 1, watermark);
            }
        }
        const kept = !watermark && type === source.type && width === sourceWidth && height === sourceHeight && blob.size >= source.size;
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

/** Keeps an image inside what the server tools accept (long edge, file size) before uploading it. */
export async function fitForUpload(source: Blob, name: string, maxEdge: number, maxBytes: number): Promise<Blob> {
    const bitmap = await decodeImage(source, name);
    const edge = Math.max(bitmap.width, bitmap.height);
    bitmap.close();
    if (edge <= maxEdge && source.size <= maxBytes && !isHeicFile({ name, type: source.type })) return source;
    return (await processImage(source, name, { format: "original", quality: 0.92, resize: { mode: "longEdge", value: maxEdge }, targetBytes: maxBytes })).blob;
}

/** Puts a cut-out (transparent PNG) on a solid colour; no colour keeps it transparent. */
export async function applyBackground(cutout: Blob, color: string): Promise<Blob> {
    if (!color) return cutout;
    const bitmap = await createImageBitmap(cutout);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("export failed");
    return blob;
}
