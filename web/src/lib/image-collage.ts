// Collage: several images joined into one (a long image, a row, or a grid), drawn in the browser.

import { MAX_CANVAS_PIXELS, decodeImage, type ImageToolResult } from "@/lib/image-tools";

export type CollageLayout = "vertical" | "horizontal" | "grid";
export type CollageOptions = {
    layout: CollageLayout;
    /** Grid columns (2–4). */
    columns: number;
    /** Width of a vertical image or a grid, height of a horizontal one. */
    edge: number;
    /** Space between and around the images, in output pixels. */
    gap: number;
    /** "transparent" exports PNG; a colour exports JPEG. */
    background: string;
};
export type CollageCell = { x: number; y: number; width: number; height: number; crop: { sx: number; sy: number; sw: number; sh: number } };
export type CollagePlan = { width: number; height: number; cells: CollageCell[]; scaled: boolean };

export const DEFAULT_COLLAGE_OPTIONS: CollageOptions = { layout: "vertical", columns: 3, edge: 1080, gap: 0, background: "#ffffff" };
export const COLLAGE_MAX_IMAGES = 30;
/** Safari refuses canvases taller or wider than this. */
const MAX_CANVAS_EDGE = 16_384;

type Size = { width: number; height: number };

/** Positions of the images on the collage; scaled down as a whole when it would exceed the canvas limits. */
export function planCollage(sizes: Size[], options: CollageOptions): CollagePlan {
    const gap = Math.max(0, Math.round(options.gap));
    const edge = Math.max(64, Math.round(options.edge));
    const full = (size: Size) => ({ sx: 0, sy: 0, sw: size.width, sh: size.height });
    let width = 0;
    let height = 0;
    let cells: CollageCell[] = [];
    if (!sizes.length) return { width: 0, height: 0, cells: [], scaled: false };
    if (options.layout === "vertical") {
        const inner = Math.max(1, edge - gap * 2);
        let y = gap;
        cells = sizes.map((size) => {
            const cellHeight = Math.max(1, Math.round((inner * size.height) / size.width));
            const cell = { x: gap, y, width: inner, height: cellHeight, crop: full(size) };
            y += cellHeight + gap;
            return cell;
        });
        width = edge;
        height = y;
    } else if (options.layout === "horizontal") {
        const inner = Math.max(1, edge - gap * 2);
        let x = gap;
        cells = sizes.map((size) => {
            const cellWidth = Math.max(1, Math.round((inner * size.width) / size.height));
            const cell = { x, y: gap, width: cellWidth, height: inner, crop: full(size) };
            x += cellWidth + gap;
            return cell;
        });
        width = x;
        height = edge;
    } else {
        // Square cells; each image is centre-cropped to fill its cell. A short last row is centred.
        const columns = Math.max(1, Math.min(Math.round(options.columns) || 1, sizes.length));
        const cell = Math.max(1, Math.floor((edge - gap * (columns + 1)) / columns));
        const rows = Math.ceil(sizes.length / columns);
        cells = sizes.map((size, index) => {
            const row = Math.floor(index / columns);
            const inRow = row === rows - 1 ? sizes.length - row * columns : columns;
            const offset = ((columns - inRow) * (cell + gap)) / 2;
            const side = Math.min(size.width, size.height);
            return {
                x: Math.round(gap + offset + (index % columns) * (cell + gap)),
                y: gap + row * (cell + gap),
                width: cell,
                height: cell,
                crop: { sx: Math.round((size.width - side) / 2), sy: Math.round((size.height - side) / 2), sw: side, sh: side },
            };
        });
        width = gap + columns * (cell + gap);
        height = gap + rows * (cell + gap);
    }
    const scale = Math.min(1, MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    if (scale >= 1) return { width, height, cells, scaled: false };
    const s = (value: number) => Math.round(value * scale);
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
        cells: cells.map((item) => ({ ...item, x: s(item.x), y: s(item.y), width: Math.max(1, s(item.width)), height: Math.max(1, s(item.height)) })),
        scaled: true,
    };
}

export async function renderCollage(sources: { blob: Blob; name: string }[], options: CollageOptions): Promise<ImageToolResult> {
    const bitmaps: ImageBitmap[] = [];
    try {
        for (const source of sources.slice(0, COLLAGE_MAX_IMAGES)) bitmaps.push(await decodeImage(source.blob, source.name));
        const plan = planCollage(bitmaps, options);
        const canvas = document.createElement("canvas");
        canvas.width = plan.width;
        canvas.height = plan.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        const transparent = options.background === "transparent";
        if (!transparent) {
            ctx.fillStyle = options.background;
            ctx.fillRect(0, 0, plan.width, plan.height);
        }
        ctx.imageSmoothingQuality = "high";
        plan.cells.forEach((cell, index) => ctx.drawImage(bitmaps[index], cell.crop.sx, cell.crop.sy, cell.crop.sw, cell.crop.sh, cell.x, cell.y, cell.width, cell.height));
        const type = transparent ? "image/png" : "image/jpeg";
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
        canvas.width = canvas.height = 0;
        if (!blob) throw new Error("export failed");
        return { blob, name: transparent ? "collage.png" : "collage.jpg", width: plan.width, height: plan.height, sourceWidth: plan.width, sourceHeight: plan.height, capped: plan.scaled, kept: false };
    } finally {
        bitmaps.forEach((bitmap) => bitmap.close());
    }
}
