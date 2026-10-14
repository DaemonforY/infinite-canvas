import { COMIC_FONT, fitText, type ComicBubble, type ComicBubbleKind, type ComicLayoutId, type ComicTail, type Rect } from "./comic";

// 画漫画 pages as a "scene": a background (the one-image page, or 逐格 panels laid out in cells) plus lettering.
// The same scene is drawn as SVG on screen and onto a canvas for export, so what is saved matches the preview.

export const COMIC_LAYOUTS: ComicLayoutId[] = ["manga", "strip", "grid"];

const PAGE_WIDTH = 1080;
const MARGIN = 28;
const GAP = 18;

/** Panels per row for each template, read left to right, top to bottom. */
function rowsFor(layout: ComicLayoutId, count: number) {
    const rows: number[] = [];
    let left = count;
    let index = 0;
    while (left > 0) {
        const want = layout === "strip" ? 1 : layout === "grid" ? 2 : index % 2 === 0 ? 1 : 2;
        const cols = Math.min(want, left);
        rows.push(cols);
        left -= cols;
        index++;
    }
    return rows;
}

function rowHeight(layout: ComicLayoutId, cols: number) {
    if (layout === "strip") return 440;
    if (layout === "grid") return cols === 2 ? 640 : 520;
    return cols === 1 ? 420 : 520;
}

/** Page size and panel cells in pixels for a template: 条漫竖排, 日漫不等宽 (1 / 2 / 1…), 方格 (2 per row). */
export function layoutPage(layout: ComicLayoutId, count: number) {
    const cells: Rect[] = [];
    let y = MARGIN;
    for (const cols of rowsFor(layout, count)) {
        const h = rowHeight(layout, cols);
        const w = (PAGE_WIDTH - MARGIN * 2 - GAP * (cols - 1)) / cols;
        for (let c = 0; c < cols; c++) cells.push({ x: MARGIN + c * (w + GAP), y, w, h });
        y += h + GAP;
    }
    return { width: PAGE_WIDTH, height: y - GAP + MARGIN, cells };
}

const RATIOS = ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3"] as const;

/** The supported image ratio closest to a cell, so a panel is drawn in the shape it is shown in. */
export function ratioFor(rect: Pick<Rect, "w" | "h">) {
    const target = Math.log(rect.w / rect.h);
    let best: string = RATIOS[0];
    for (const ratio of RATIOS) {
        const [w, h] = ratio.split(":").map(Number);
        const [bw, bh] = best.split(":").map(Number);
        if (Math.abs(Math.log(w / h) - target) < Math.abs(Math.log(bw / bh) - target)) best = ratio;
    }
    return best;
}

/** Where an image goes to cover a cell, cropped around `focus` (0–1 each way). */
export function coverPlacement(cell: Rect, imageWidth: number, imageHeight: number, focus = { x: 0.5, y: 0.5 }): Rect {
    const scale = Math.max(cell.w / imageWidth, cell.h / imageHeight);
    const w = imageWidth * scale;
    const h = imageHeight * scale;
    return { x: cell.x + (cell.w - w) * focus.x, y: cell.y + (cell.h - h) * focus.y, w, h };
}

// ---------------------------------------------------------------------------------------------
// Balloons. Each kind is one SVG path; drawing it twice (a double-width stroke, then the fill) merges the
// tail or the bumps into one outlined shape.

export function balloonPath(kind: ComicBubbleKind, box: Rect, tail: ComicTail = "none") {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rx = box.w / 2;
    const ry = box.h / 2;
    const ellipse = (x: number, y: number, ex: number, ey: number) => `M${f(x - ex)} ${f(y)}A${f(ex)} ${f(ey)} 0 1 0 ${f(x + ex)} ${f(y)}A${f(ex)} ${f(ey)} 0 1 0 ${f(x - ex)} ${f(y)}Z`;
    const side = tail === "left" ? -1 : 1;
    if (kind === "sfx") return "";
    if (kind === "narration") return `M${f(box.x)} ${f(box.y)}H${f(box.x + box.w)}V${f(box.y + box.h)}H${f(box.x)}Z`;
    if (kind === "shout") {
        const spikes = 18;
        const points = Array.from({ length: spikes * 2 }, (_, i) => {
            const angle = (Math.PI * i) / spikes;
            const r = i % 2 === 0 ? 1 : 0.8;
            return `${f(cx + Math.cos(angle) * rx * r)} ${f(cy + Math.sin(angle) * ry * r)}`;
        });
        return `M${points.join("L")}Z`;
    }
    if (kind === "thought") {
        const bumps = 11;
        const r = Math.min(rx, ry) * 0.42;
        const parts = [ellipse(cx, cy, rx * 0.84, ry * 0.8)];
        for (let i = 0; i < bumps; i++) {
            const angle = (Math.PI * 2 * i) / bumps;
            parts.push(ellipse(cx + Math.cos(angle) * (rx - r * 0.9), cy + Math.sin(angle) * (ry - r * 0.9), r, r * 0.9));
        }
        if (tail !== "none") {
            const s = Math.min(rx, ry);
            parts.push(ellipse(cx + side * rx * 0.55, cy + ry + s * 0.18, s * 0.14, s * 0.12));
            parts.push(ellipse(cx + side * rx * 0.75, cy + ry + s * 0.42, s * 0.08, s * 0.07));
        }
        return parts.join("");
    }
    const body = ellipse(cx, cy, rx, ry);
    if (tail === "none") return body;
    const baseA = `${f(cx + side * rx * 0.12)} ${f(cy + ry * 0.92)}`;
    const baseB = `${f(cx + side * rx * 0.42)} ${f(cy + ry * 0.78)}`;
    const tip = `${f(cx + side * rx * 0.7)} ${f(cy + ry * 1.55)}`;
    return `${body}M${baseA}L${tip}L${baseB}Z`;
}

function f(value: number) {
    return Math.round(value * 10) / 10;
}

/** Room for text inside each balloon shape (fractions of the box, per side). */
const TEXT_PADDING: Record<ComicBubbleKind, [number, number]> = { speech: [0.15, 0.18], thought: [0.17, 0.22], shout: [0.16, 0.24], narration: [0.06, 0.1], sfx: [0, 0] };

export const SFX_COLORS = ["#f97316", "#ef4444", "#2563eb", "#111111", "#a855f7"];

// ---------------------------------------------------------------------------------------------
// Scenes.

export type SceneCell = { rect: Rect; src?: string; imageWidth?: number; imageHeight?: number; focus?: { x: number; y: number } };
export type ComicScene = { width: number; height: number; image?: string; cells?: SceneCell[]; bubbles: ComicBubble[] };

export type Measure = (text: string, fontSize: number, weight: number) => number;

/** The pixel box of a bubble: page fractions, or fractions of its panel's cell. */
export function bubbleBox(bubble: Pick<ComicBubble, "x" | "y" | "w" | "h" | "cell" | "panel">, scene: Pick<ComicScene, "width" | "height" | "cells">): Rect {
    const frame = bubble.cell && scene.cells?.[bubble.panel] ? scene.cells[bubble.panel].rect : { x: 0, y: 0, w: scene.width, h: scene.height };
    return { x: frame.x + bubble.x * frame.w, y: frame.y + bubble.y * frame.h, w: bubble.w * frame.w, h: bubble.h * frame.h };
}

/** The size of the frame a bubble's coordinates are relative to (for dragging). */
export function bubbleFrame(bubble: Pick<ComicBubble, "cell" | "panel">, scene: Pick<ComicScene, "width" | "height" | "cells">) {
    return bubble.cell && scene.cells?.[bubble.panel] ? scene.cells[bubble.panel].rect : { x: 0, y: 0, w: scene.width, h: scene.height };
}

export type LaidBubble = { bubble: ComicBubble; box: Rect; path: string; fontSize: number; weight: number; lines: string[]; stroke: number };

/** Everything needed to draw the lettering: balloon path, text lines and size, for SVG and canvas alike. */
export function layoutScene(scene: ComicScene, measure: Measure): LaidBubble[] {
    const short = Math.min(scene.width, scene.height);
    const stroke = Math.max(2, Math.round(short * 0.0035));
    const maxSize = Math.max(12, Math.round(short * 0.034));
    return scene.bubbles.map((bubble) => {
        const box = bubbleBox(bubble, scene);
        const weight = bubble.kind === "sfx" ? 900 : bubble.kind === "narration" ? 500 : 700;
        const [px, py] = bubble.drawn ? TEXT_PADDING[bubble.kind] : [0, 0];
        const limit = bubble.kind === "sfx" ? box.h * 0.85 : bubble.kind === "narration" ? maxSize * 0.85 : bubble.kind === "shout" ? maxSize * 1.1 : maxSize;
        const fit = fitText(bubble.text, box.w * (1 - px * 2), box.h * (1 - py * 2), (text, size) => measure(text, size, weight), limit);
        const path = bubble.drawn ? balloonPath(bubble.kind, box, bubble.tail ?? (bubble.kind === "speech" ? "left" : "none")) : "";
        return { bubble, box, path, weight, stroke, ...fit };
    });
}

export function canvasMeasureWeight(): Measure {
    const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    return (text, size, weight) => {
        if (!context) return Array.from(text).length * size;
        context.font = `${weight} ${size}px ${COMIC_FONT}`;
        return context.measureText(text).width;
    };
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.crossOrigin = "anonymous";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("image load failed"));
        element.src = src;
    });
}

/** Draws a scene into a PNG blob. */
export async function renderScene(scene: ComicScene): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(scene.width);
    canvas.height = Math.round(scene.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (scene.image) context.drawImage(await loadImage(scene.image), 0, 0, canvas.width, canvas.height);
    for (const cell of scene.cells || []) {
        if (cell.src) {
            const image = await loadImage(cell.src);
            const place = coverPlacement(cell.rect, image.naturalWidth, image.naturalHeight, cell.focus);
            context.save();
            context.beginPath();
            context.rect(cell.rect.x, cell.rect.y, cell.rect.w, cell.rect.h);
            context.clip();
            context.drawImage(image, place.x, place.y, place.w, place.h);
            context.restore();
        }
        context.lineWidth = CELL_BORDER;
        context.strokeStyle = "#111";
        context.strokeRect(cell.rect.x, cell.rect.y, cell.rect.w, cell.rect.h);
    }
    for (const item of layoutScene(scene, canvasMeasureWeight())) drawBubble(context, item);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/png"));
}

export const CELL_BORDER = 4;

function drawBubble(context: CanvasRenderingContext2D, item: LaidBubble) {
    const { bubble, box, path, stroke } = item;
    context.save();
    if (path) {
        const shape = new Path2D(path);
        context.lineJoin = "round";
        context.lineWidth = stroke * 2;
        context.strokeStyle = "#111";
        context.stroke(shape);
        context.fillStyle = bubble.kind === "narration" ? "#fffbea" : "#fff";
        context.fill(shape);
    }
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    context.translate(cx, cy);
    if (bubble.rotate) context.rotate((bubble.rotate * Math.PI) / 180);
    context.font = `${item.weight} ${item.fontSize}px ${COMIC_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const lineHeight = item.fontSize * 1.25;
    const top = -((item.lines.length - 1) * lineHeight) / 2;
    item.lines.forEach((line, index) => {
        if (bubble.kind === "sfx") {
            context.lineJoin = "round";
            context.lineWidth = item.fontSize * 0.18;
            context.strokeStyle = "#fff";
            context.strokeText(line, 0, top + index * lineHeight);
        }
        context.fillStyle = bubble.kind === "sfx" ? bubble.color || SFX_COLORS[0] : "#111";
        context.fillText(line, 0, top + index * lineHeight);
    });
    context.restore();
}

// ---------------------------------------------------------------------------------------------
// Default lettering for 逐格 pages: drawn balloons in the top of each cell (the art leaves room there).

export function placeCellBubbles(panels: Array<{ lines: Array<{ text: string; kind: ComicBubble["kind"] }> }>, makeId: () => string): ComicBubble[] {
    const bubbles: ComicBubble[] = [];
    panels.forEach((panel, panelIndex) => {
        let speech = 0;
        const hasNarration = panel.lines.some((line) => line.kind === "narration");
        panel.lines.forEach((line, lineIndex) => {
            if (line.kind === "narration") {
                bubbles.push({ id: makeId(), panel: panelIndex, line: lineIndex, text: line.text, kind: line.kind, x: 0.03, y: 0.04, w: 0.5, h: 0.15, drawn: true, cell: true, tail: "none" });
                return;
            }
            const right = speech % 2 === 1;
            const y = (hasNarration ? 0.22 : 0.05) + Math.floor(speech / 2) * 0.3;
            bubbles.push({ id: makeId(), panel: panelIndex, line: lineIndex, text: line.text, kind: line.kind, x: right ? 0.53 : 0.04, y, w: 0.43, h: 0.26, drawn: true, cell: true, tail: line.kind === "shout" ? "none" : right ? "right" : "left" });
            speech++;
        });
    });
    return bubbles;
}
