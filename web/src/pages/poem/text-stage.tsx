import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { canvasMeasure, drawTextLayers, ensureLayerFonts, layoutLayer, unrotate, type TextLayer } from "@/lib/image-editor/text-layers";
import { snapAngle, snapMove, type FracBox, type PoemEdit, type PoemEdits, type SnapGuide } from "@/lib/poem-edit";

// 配诗 preview you can edit on: tap a text to select it, drag to move (snapping to the centre lines and the
// other texts), drag the corner to resize, the top knob to turn (Shift: 15° steps), two fingers to pinch and
// turn on a phone, double-click to retype. Changes are reported as PoemEdits; the parent keeps them and the undo.

let measureCanvas: HTMLCanvasElement | null = null;
function measureCtx() {
    measureCanvas ??= document.createElement("canvas");
    return measureCanvas.getContext("2d");
}

/** A layer's block as fractions of a picture with this width / height ratio. */
export function fracBoxOf(layer: TextLayer, aspect: number): FracBox {
    const W = 1000;
    const H = W / aspect;
    const ctx = measureCtx();
    const measure = ctx ? canvasMeasure(ctx, layer) : (_: string, px: number) => px;
    const { box } = layoutLayer(layer, W, H, measure);
    return { x: box.x / W, y: box.y / H, w: box.w / W, h: box.h / H };
}

type Point = { x: number; y: number };
type Gesture = {
    kind: "move" | "scale" | "rotate" | "pinch";
    id: string;
    start: PoemEdits;
    edit: PoemEdit;
    box: FracBox;
    others: FracBox[];
    p0: Point;
    /** pinch: distance, angle and midpoint of the two fingers at the start. */
    d0?: number;
    a0?: number;
    moved: boolean;
};

export function PoemTextStage({
    img,
    layers,
    edits,
    selected,
    onSelect,
    onLive,
    onCommit,
    onEditText,
}: {
    img: HTMLImageElement;
    layers: TextLayer[];
    edits: PoemEdits;
    selected: string | null;
    onSelect: (id: string | null) => void;
    /** While a gesture runs. */
    onLive: (edits: PoemEdits) => void;
    /** When it ends with a change: the edits before and after. */
    onCommit: (before: PoemEdits, after: PoemEdits) => void;
    onEditText: (id: string) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const gesture = useRef<Gesture | null>(null);
    const pointers = useRef(new Map<number, Point>());
    const [guides, setGuides] = useState<SnapGuide[]>([]);
    const aspect = img.naturalWidth / img.naturalHeight;

    const boxes = useMemo(() => layers.map((layer) => ({ id: layer.id, rotation: layer.rotation || 0, box: fracBoxOf(layer, aspect) })), [aspect, layers]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let alive = true;
        const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const paint = () => {
            const ctx = canvas.getContext("2d");
            if (!ctx || !alive) return;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            drawTextLayers(ctx, layers, canvas.width, canvas.height);
        };
        paint();
        void ensureLayerFonts(layers).then(paint);
        return () => {
            alive = false;
        };
    }, [img, layers]);

    const rect = () => canvasRef.current?.getBoundingClientRect();

    /** The top-most text under a client point. */
    const hit = (p: Point) => {
        const r = rect();
        if (!r) return null;
        for (let i = boxes.length - 1; i >= 0; i--) {
            const { box, rotation, id } = boxes[i];
            const px = { x: box.x * r.width, y: box.y * r.height, w: box.w * r.width, h: box.h * r.height };
            const [x, y] = unrotate({ rotation }, px, p.x - r.left, p.y - r.top);
            const pad = 8;
            if (x >= px.x - pad && x <= px.x + px.w + pad && y >= px.y - pad && y <= px.y + px.h + pad) return id;
        }
        return null;
    };

    const begin = (kind: Gesture["kind"], id: string, p: Point) => {
        const entry = boxes.find((b) => b.id === id);
        if (!entry) return;
        gesture.current = {
            kind,
            id,
            start: edits,
            edit: edits[id] || {},
            box: entry.box,
            others: boxes.filter((b) => b.id !== id).map((b) => b.box),
            p0: p,
            moved: false,
        };
    };

    const centre = (box: FracBox, r: DOMRect): Point => ({ x: r.left + (box.x + box.w / 2) * r.width, y: r.top + (box.y + box.h / 2) * r.height });
    const angle = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

    const update = (p: Point, shift: boolean) => {
        const g = gesture.current;
        const r = rect();
        if (!g || !r) return;
        const base = g.edit;
        let next: PoemEdit = base;
        let snapped: SnapGuide[] = [];
        if (g.kind === "move") {
            const ddx = (p.x - g.p0.x) / r.width;
            const ddy = (p.y - g.p0.y) / r.height;
            if (!g.moved && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) < 3) return;
            const snap = shift ? { dx: 0, dy: 0, guides: [] } : snapMove({ ...g.box, x: g.box.x + ddx, y: g.box.y + ddy }, g.others, 6 / r.width, 6 / r.height);
            snapped = snap.guides;
            next = { ...base, dx: (base.dx ?? 0) + ddx + snap.dx, dy: (base.dy ?? 0) + ddy + snap.dy };
        } else if (g.kind === "scale") {
            const c = centre(g.box, r);
            const d0 = Math.max(4, Math.hypot(g.p0.x - c.x, g.p0.y - c.y));
            const s = Math.hypot(p.x - c.x, p.y - c.y) / d0;
            next = { ...base, scale: clampScale((base.scale ?? 1) * s) };
        } else if (g.kind === "rotate") {
            const c = centre(g.box, r);
            next = { ...base, rotation: snapAngle((base.rotation ?? 0) + angle(c, p) - angle(c, g.p0), shift) };
        }
        g.moved = true;
        setGuides(snapped);
        onLive({ ...g.start, [g.id]: next });
    };

    const updatePinch = () => {
        const g = gesture.current;
        const r = rect();
        const pts = [...pointers.current.values()];
        if (!g || !r || pts.length < 2 || g.d0 === undefined || g.a0 === undefined) return;
        const [a, b] = pts;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const base = g.edit;
        const next: PoemEdit = {
            ...base,
            scale: clampScale((base.scale ?? 1) * (Math.hypot(b.x - a.x, b.y - a.y) / Math.max(4, g.d0))),
            rotation: snapAngle((base.rotation ?? 0) + angle(a, b) - g.a0),
            dx: (base.dx ?? 0) + (mid.x - g.p0.x) / r.width,
            dy: (base.dy ?? 0) + (mid.y - g.p0.y) / r.height,
        };
        g.moved = true;
        onLive({ ...g.start, [g.id]: next });
    };

    const finish = () => {
        const g = gesture.current;
        gesture.current = null;
        setGuides([]);
        if (!g?.moved) return;
        // The parent's live edits are the result; it compares and records them.
        onCommit(g.start, latest.current);
    };

    // The newest edits the parent rendered, read when a gesture ends.
    const latest = useRef(edits);
    latest.current = edits;

    const onPointerDown = (event: ReactPointerEvent) => {
        const p = { x: event.clientX, y: event.clientY };
        pointers.current.set(event.pointerId, p);
        try {
            wrapRef.current?.setPointerCapture(event.pointerId);
        } catch {
            // Not a live pointer (synthetic events); moves still arrive while over the picture.
        }
        if (pointers.current.size === 2 && selected) {
            // Second finger: pinch / turn the selected text, from where the first finger left it.
            const pts = [...pointers.current.values()];
            const start = gesture.current?.moved ? latest.current : edits;
            const entry = boxes.find((b) => b.id === selected);
            if (!entry) return;
            gesture.current = {
                kind: "pinch",
                id: selected,
                start: gesture.current?.start ?? edits,
                edit: start[selected] || {},
                box: entry.box,
                others: [],
                p0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
                d0: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
                a0: angle(pts[0], pts[1]),
                moved: false,
            };
            return;
        }
        if (pointers.current.size > 1) return;
        const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-handle]")?.dataset.handle;
        if (handle && selected) {
            begin(handle === "rotate" ? "rotate" : "scale", selected, p);
            return;
        }
        const id = hit(p);
        onSelect(id);
        if (id) begin("move", id, p);
    };

    const onPointerMove = (event: ReactPointerEvent) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (gesture.current?.kind === "pinch") updatePinch();
        else update({ x: event.clientX, y: event.clientY }, event.shiftKey);
    };

    const onPointerUp = (event: ReactPointerEvent) => {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size === 0) finish();
    };

    const sel = boxes.find((b) => b.id === selected);

    return (
        <div
            ref={wrapRef}
            className="relative max-w-full self-start select-none"
            style={{ touchAction: selected ? "none" : "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(event) => {
                const id = hit({ x: event.clientX, y: event.clientY });
                if (id) {
                    onSelect(id);
                    onEditText(id);
                }
            }}
            data-testid="poem-stage"
        >
            <canvas ref={canvasRef} className="block max-h-[78vh] max-w-full rounded shadow-sm" data-testid="poem-preview" />
            {sel ? (
                <div
                    className="pointer-events-none absolute border border-dashed border-violet-500 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
                    style={{
                        left: `${sel.box.x * 100}%`,
                        top: `${sel.box.y * 100}%`,
                        width: `${sel.box.w * 100}%`,
                        height: `${sel.box.h * 100}%`,
                        transform: sel.rotation ? `rotate(${sel.rotation}deg)` : undefined,
                        cursor: "move",
                    }}
                    data-testid="poem-selection"
                >
                    <div className="absolute -top-6 left-1/2 h-5 w-px -translate-x-1/2 bg-violet-500" />
                    <div
                        data-handle="rotate"
                        title="拖动旋转（按住 Shift 每次 15°）"
                        className="pointer-events-auto absolute -top-8 left-1/2 size-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-violet-500 bg-white"
                    />
                    <div
                        data-handle="scale"
                        title="拖动缩放"
                        className="pointer-events-auto absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-sm border-2 border-violet-500 bg-white"
                    />
                </div>
            ) : null}
            {guides.map((guide) => (
                <div
                    key={`${guide.axis}${guide.at}`}
                    className="pointer-events-none absolute bg-pink-500/80"
                    style={guide.axis === "x" ? { left: `${guide.at * 100}%`, top: 0, bottom: 0, width: 1 } : { top: `${guide.at * 100}%`, left: 0, right: 0, height: 1 }}
                />
            ))}
        </div>
    );
}

function clampScale(s: number) {
    return Math.min(6, Math.max(0.2, Math.round(s * 1000) / 1000));
}
