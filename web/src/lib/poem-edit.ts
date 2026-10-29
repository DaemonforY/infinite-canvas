import type { TextLayer } from "@/lib/image-editor/text-layers";

// 配诗 direct editing: what the user changed on each auto-placed text (moved, resized, turned, retyped, hidden),
// kept apart from the automatic layout so a new font, 字号 or place still applies underneath.

/** dx / dy: fractions of the picture width / height; scale multiplies the size around the block's centre. */
export type PoemEdit = { dx?: number; dy?: number; scale?: number; rotation?: number; text?: string; hidden?: boolean };
export type PoemEdits = Record<string, PoemEdit>;

/** A layer's block as fractions of the picture (x / w of the width, y / h of the height). */
export type FracBox = { x: number; y: number; w: number; h: number };

export const POEM_LAYER_NAMES: Record<string, string> = { "poem-title": "标题", "poem-author": "作者", "poem-body": "诗句", "poem-seal": "印章" };

export function layerName(id: string) {
    return POEM_LAYER_NAMES[id] || "文字";
}

/** The layers with the edits applied (hidden ones left out). boxOf measures a layer's block. */
export function applyEdits(layers: TextLayer[], edits: PoemEdits | undefined, boxOf: (layer: TextLayer) => FracBox): TextLayer[] {
    if (!edits) return layers;
    const out: TextLayer[] = [];
    for (const layer of layers) {
        const edit = edits[layer.id];
        if (!edit) {
            out.push(layer);
            continue;
        }
        if (edit.hidden) continue;
        let next: TextLayer = edit.text !== undefined && edit.text.trim() ? { ...layer, text: edit.text } : layer;
        const s = edit.scale ?? 1;
        if (s !== 1) {
            const box = boxOf(next);
            next = { ...next, size: next.size * s, x: next.x + (box.w * (1 - s)) / 2, y: next.y + (box.h * (1 - s)) / 2 };
        }
        out.push({ ...next, x: next.x + (edit.dx ?? 0), y: next.y + (edit.dy ?? 0), rotation: edit.rotation ?? next.rotation });
    }
    return out;
}

export function isEdited(edits: PoemEdits | undefined) {
    return !!edits && Object.values(edits).some((e) => e && (e.dx || e.dy || (e.scale ?? 1) !== 1 || e.rotation || e.text !== undefined || e.hidden));
}

export type SnapGuide = { axis: "x" | "y"; at: number };

/**
 * Pulls a moved block onto the picture's centre lines and the edges / centres of the other blocks when one of its
 * own edges or its centre comes within tx / ty (fractions). Returns the correction and the lines it snapped to.
 */
export function snapMove(box: FracBox, others: FracBox[], tx: number, ty: number) {
    const xs = [0.5, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ys = [0.5, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
    const pick = (own: number[], targets: number[], t: number) => {
        let best: { d: number; at: number } | null = null;
        for (const a of own) {
            for (const b of targets) {
                const d = b - a;
                if (Math.abs(d) <= t && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: b };
            }
        }
        return best;
    };
    const sx = pick([box.x, box.x + box.w / 2, box.x + box.w], xs, tx);
    const sy = pick([box.y, box.y + box.h / 2, box.y + box.h], ys, ty);
    const guides: SnapGuide[] = [];
    if (sx) guides.push({ axis: "x", at: sx.at });
    if (sy) guides.push({ axis: "y", at: sy.at });
    return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guides };
}

/** Degrees in (-180, 180]; with step (Shift) in steps of 15°, else onto 0 / 90 / 180 within 3°. */
export function snapAngle(deg: number, step = false) {
    let a = ((((deg + 180) % 360) + 360) % 360) - 180;
    if (a === -180) a = 180;
    if (step) return Math.round(a / 15) * 15 || 0;
    const right = Math.round(a / 90) * 90;
    return Math.abs(a - right) <= 3 ? right || 0 : Math.round(a * 10) / 10;
}

/** Undo / redo over snapshots of the edits. */
export type EditHistory = { past: PoemEdits[]; future: PoemEdits[] };

export function pushHistory(history: EditHistory, before: PoemEdits, limit = 50): EditHistory {
    return { past: [...history.past, before].slice(-limit), future: [] };
}

export function undoHistory(history: EditHistory, current: PoemEdits): { history: EditHistory; edits: PoemEdits } | null {
    const prev = history.past[history.past.length - 1];
    if (!prev) return null;
    return { history: { past: history.past.slice(0, -1), future: [current, ...history.future] }, edits: prev };
}

export function redoHistory(history: EditHistory, current: PoemEdits): { history: EditHistory; edits: PoemEdits } | null {
    const next = history.future[0];
    if (!next) return null;
    return { history: { past: [...history.past, current], future: history.future.slice(1) }, edits: next };
}
