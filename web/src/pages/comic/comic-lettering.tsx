import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { COMIC_FONT, type ComicBubble, type ComicImage, type Rect } from "@/lib/comic";
import { bubbleFrame, canvasMeasureWeight, CELL_BORDER, coverPlacement, layoutScene, SFX_COLORS, type ComicScene } from "@/lib/comic-layout";
import { comicImageUrl } from "./comic-api";

/** The displayable URL of a stored comic image (object URLs do not survive a reload; storage keys do). */
export function useComicImageUrl(image?: ComicImage) {
    const urls = useComicImageUrls(image ? [image] : []);
    return urls[0] || "";
}

export function useComicImageUrls(images: Array<ComicImage | undefined>) {
    const key = images.map((image) => image?.storageKey || image?.url || "").join("|");
    const [urls, setUrls] = useState<string[]>([]);
    useEffect(() => {
        let cancelled = false;
        void Promise.all(images.map((image) => (image ? comicImageUrl(image) : Promise.resolve("")))).then((value) => {
            if (!cancelled) setUrls(value);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return urls;
}

export function ComicImageView({ image, className, alt = "" }: { image?: ComicImage; className?: string; alt?: string }) {
    const url = useComicImageUrl(image);
    return url ? <img src={url} alt={alt} className={className} draggable={false} /> : <div className={`${className || ""} bg-stone-100 dark:bg-stone-800`} />;
}

/** What a page is drawn from: the one-image page, or 逐格 panels in the cells of a layout. */
export type ComicSceneSource = { width: number; height: number; image?: ComicImage; cells?: Array<{ rect: Rect; image?: ComicImage; focus?: { x: number; y: number } }>; bubbles: ComicBubble[] };

/** Resolves the stored images of a scene to URLs (for export). */
export async function resolveScene(source: ComicSceneSource): Promise<ComicScene> {
    return {
        width: source.width,
        height: source.height,
        bubbles: source.bubbles,
        image: source.image ? await comicImageUrl(source.image) : undefined,
        cells: source.cells
            ? await Promise.all(source.cells.map(async (cell) => ({ rect: cell.rect, focus: cell.focus, src: cell.image ? await comicImageUrl(cell.image) : undefined, imageWidth: cell.image?.width, imageHeight: cell.image?.height })))
            : undefined,
    };
}

type Drag = { mode: "move" | "resize" | "pan"; startX: number; startY: number; bubble?: ComicBubble; panel?: number; focus?: { x: number; y: number } };

/**
 * A page and its lettering drawn as SVG in the page's own pixel space, laid out by the same code as the exported
 * PNG. With `onChangeBubble`, bubbles can be selected, moved and resized; with `onChangeFocus`, a 逐格 panel can
 * be dragged inside its cell.
 */
export function ComicSceneView({
    source,
    className,
    selectedBubble,
    onSelectBubble,
    onChangeBubble,
    onChangeFocus,
    panelRects,
    selectedPanel,
    onSelectPanel,
    panelBadge,
    panelOverlay,
}: {
    source: ComicSceneSource;
    className?: string;
    selectedBubble?: string;
    onSelectBubble?: (id: string) => void;
    onChangeBubble?: (bubble: ComicBubble) => void;
    onChangeFocus?: (panel: number, focus: { x: number; y: number }) => void;
    /** Panel areas in page pixels (selection outline, badges). */
    panelRects?: Rect[];
    selectedPanel?: number;
    onSelectPanel?: (index: number) => void;
    panelBadge?: (index: number) => ReactNode;
    /** Drawn over a panel (e.g. a spinner while it is being drawn). */
    panelOverlay?: (index: number) => ReactNode;
}) {
    const clipId = useId().replace(/:/g, "");
    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<Drag | null>(null);
    const { width, height } = source;
    const pageUrl = useComicImageUrl(source.image);
    const cellUrls = useComicImageUrls((source.cells || []).map((cell) => cell.image));
    const measure = useMemo(() => canvasMeasureWeight(), []);
    const scene: ComicScene = useMemo(() => ({ width, height, bubbles: source.bubbles, cells: source.cells?.map((cell) => ({ rect: cell.rect })) }), [width, height, source.bubbles, source.cells]);
    const laid = useMemo(() => layoutScene(scene, measure), [scene, measure]);
    const stroke = Math.max(2, Math.round(Math.min(width, height) * 0.0035));

    const toPage = (event: { clientX: number; clientY: number }) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height };
    };

    const startDrag = (event: ReactPointerEvent, drag: Omit<Drag, "startX" | "startY">) => {
        event.stopPropagation();
        event.preventDefault();
        const point = toPage(event);
        dragRef.current = { ...drag, startX: point.x, startY: point.y };
        svgRef.current?.setPointerCapture?.(event.pointerId);
    };

    const moveDrag = (event: ReactPointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const point = toPage(event);
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        if (drag.mode === "pan" && drag.panel !== undefined && drag.focus && onChangeFocus) {
            const cell = source.cells?.[drag.panel];
            if (!cell?.image) return;
            const place = coverPlacement(cell.rect, cell.image.width || 1, cell.image.height || 1, drag.focus);
            const spareX = cell.rect.w - place.w;
            const spareY = cell.rect.h - place.h;
            onChangeFocus(drag.panel, { x: spareX ? clamp(drag.focus.x + dx / spareX, 0, 1) : 0.5, y: spareY ? clamp(drag.focus.y + dy / spareY, 0, 1) : 0.5 });
            return;
        }
        const b = drag.bubble;
        if (!b || !onChangeBubble) return;
        const frame = bubbleFrame(b, scene);
        const fx = dx / frame.w;
        const fy = dy / frame.h;
        // Text moved off the balloon the model drew needs a balloon of its own.
        if (drag.mode === "move") onChangeBubble({ ...b, x: clamp(b.x + fx, -0.2, 1 - b.w + 0.2), y: clamp(b.y + fy, -0.2, 1 - b.h + 0.2), drawn: b.drawn || Math.hypot(fx, fy) > 0.01 });
        else onChangeBubble({ ...b, w: clamp(b.w + fx, 0.04, 1.2), h: clamp(b.h + fy, 0.02, 1.2) });
    };

    const endDrag = () => {
        dragRef.current = null;
    };

    return (
        <div className={`relative select-none ${className || ""}`} style={{ aspectRatio: `${width} / ${height}` }}>
            <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 size-full touch-none rounded-md bg-white" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                {source.image ? pageUrl ? <image href={pageUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" /> : <rect width={width} height={height} className="animate-pulse fill-stone-100" /> : null}
                {source.cells?.map((cell, index) => {
                    const url = cellUrls[index];
                    const place = cell.image ? coverPlacement(cell.rect, cell.image.width || 1, cell.image.height || 1, cell.focus) : null;
                    return (
                        <g key={`cell-${index}`}>
                            <clipPath id={`${clipId}-${index}`}>
                                <rect x={cell.rect.x} y={cell.rect.y} width={cell.rect.w} height={cell.rect.h} />
                            </clipPath>
                            <rect x={cell.rect.x} y={cell.rect.y} width={cell.rect.w} height={cell.rect.h} fill="#f5f5f4" onClick={() => onSelectPanel?.(index)} />
                            {url && place ? (
                                <image
                                    href={url}
                                    x={place.x}
                                    y={place.y}
                                    width={place.w}
                                    height={place.h}
                                    preserveAspectRatio="none"
                                    clipPath={`url(#${clipId}-${index})`}
                                    className={onChangeFocus ? "cursor-grab" : onSelectPanel ? "cursor-pointer" : undefined}
                                    onPointerDown={onChangeFocus ? (event) => startDrag(event, { mode: "pan", panel: index, focus: cell.focus || { x: 0.5, y: 0.5 } }) : undefined}
                                    onClick={() => onSelectPanel?.(index)}
                                />
                            ) : null}
                            <rect x={cell.rect.x} y={cell.rect.y} width={cell.rect.w} height={cell.rect.h} fill="none" stroke="#111" strokeWidth={CELL_BORDER} pointerEvents="none" />
                        </g>
                    );
                })}
                {source.image && panelRects && onSelectPanel
                    ? panelRects.map((rect, index) => <rect key={`hit-${index}`} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" className="cursor-pointer" onClick={() => onSelectPanel(index)} />)
                    : null}
                {panelRects && selectedPanel !== undefined && panelRects[selectedPanel] ? (
                    <rect
                        x={panelRects[selectedPanel].x}
                        y={panelRects[selectedPanel].y}
                        width={panelRects[selectedPanel].w}
                        height={panelRects[selectedPanel].h}
                        fill="none"
                        stroke="var(--skin-accent, #7c3aed)"
                        strokeWidth={stroke * 3}
                        pointerEvents="none"
                    />
                ) : null}
                {laid.map(({ bubble, box, path, fontSize, lines, weight }) => {
                    const selected = selectedBubble === bubble.id;
                    const lineHeight = fontSize * 1.25;
                    const top = -((lines.length - 1) * lineHeight) / 2;
                    const sfx = bubble.kind === "sfx";
                    return (
                        <g
                            key={bubble.id}
                            className={onChangeBubble ? "cursor-move" : undefined}
                            onPointerDown={
                                onChangeBubble
                                    ? (event) => {
                                          onSelectBubble?.(bubble.id);
                                          startDrag(event, { mode: "move", bubble });
                                      }
                                    : undefined
                            }
                            onClick={() => onSelectBubble?.(bubble.id)}
                            pointerEvents={onChangeBubble || onSelectBubble ? undefined : "none"}
                        >
                            {path ? (
                                <>
                                    <path d={path} fill="none" stroke="#111" strokeWidth={stroke * 2} strokeLinejoin="round" />
                                    <path d={path} fill={bubble.kind === "narration" ? "#fffbea" : "#fff"} />
                                </>
                            ) : (
                                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" />
                            )}
                            <g transform={`translate(${box.x + box.w / 2} ${box.y + box.h / 2})${bubble.rotate ? ` rotate(${bubble.rotate})` : ""}`}>
                                {lines.map((line, index) => (
                                    <text
                                        key={index}
                                        x={0}
                                        y={top + index * lineHeight}
                                        fontSize={fontSize}
                                        fontWeight={weight}
                                        fontFamily={COMIC_FONT}
                                        fill={sfx ? bubble.color || SFX_COLORS[0] : "#111"}
                                        stroke={sfx ? "#fff" : undefined}
                                        strokeWidth={sfx ? fontSize * 0.18 : undefined}
                                        strokeLinejoin="round"
                                        paintOrder="stroke"
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                    >
                                        {line}
                                    </text>
                                ))}
                            </g>
                            {selected && onChangeBubble ? (
                                <>
                                    <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="var(--skin-accent, #7c3aed)" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />
                                    <rect
                                        x={box.x + box.w - stroke * 6}
                                        y={box.y + box.h - stroke * 6}
                                        width={stroke * 12}
                                        height={stroke * 12}
                                        rx={stroke * 2}
                                        fill="var(--skin-accent, #7c3aed)"
                                        className="cursor-nwse-resize"
                                        onPointerDown={(event) => startDrag(event, { mode: "resize", bubble })}
                                    />
                                </>
                            ) : null}
                        </g>
                    );
                })}
            </svg>
            {panelRects && (panelBadge || panelOverlay)
                ? panelRects.map((rect, index) => (
                      <div key={`badge-${index}`} className="pointer-events-none absolute" style={{ left: `${(rect.x / width) * 100}%`, top: `${(rect.y / height) * 100}%`, width: `${(rect.w / width) * 100}%`, height: `${(rect.h / height) * 100}%` }}>
                          {panelOverlay?.(index)}
                          {panelBadge?.(index)}
                      </div>
                  ))
                : null}
        </div>
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
