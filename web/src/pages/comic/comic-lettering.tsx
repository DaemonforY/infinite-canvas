import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { canvasMeasure, COMIC_FONT, layoutBubbles, type ComicBubble, type ComicImage } from "@/lib/comic";
import { comicImageUrl } from "./comic-api";

/** The displayable URL of a stored comic image (object URLs do not survive a reload; storage keys do). */
export function useComicImageUrl(image?: ComicImage) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let cancelled = false;
        if (!image) {
            setUrl("");
            return;
        }
        void comicImageUrl(image).then((value) => {
            if (!cancelled) setUrl(value);
        });
        return () => {
            cancelled = true;
        };
    }, [image]);
    return url;
}

export function ComicImageView({ image, className, alt = "" }: { image?: ComicImage; className?: string; alt?: string }) {
    const url = useComicImageUrl(image);
    return url ? <img src={url} alt={alt} className={className} draggable={false} /> : <div className={`${className || ""} bg-stone-100 dark:bg-stone-800`} />;
}

type Drag = { id: string; mode: "move" | "resize"; startX: number; startY: number; bubble: ComicBubble };

/**
 * A page with its lettering drawn as SVG in the image's own pixel space, so the preview matches the exported
 * PNG (same layout code). With `editable`, bubbles can be selected, moved and resized.
 */
export function LetteredPage({
    image,
    bubbles,
    className,
    selectedBubble,
    onSelectBubble,
    onChangeBubble,
    panelRects,
    selectedPanel,
    onSelectPanel,
    panelBadge,
}: {
    image: ComicImage;
    bubbles: ComicBubble[];
    className?: string;
    selectedBubble?: string;
    onSelectBubble?: (id: string) => void;
    onChangeBubble?: (bubble: ComicBubble) => void;
    panelRects?: Array<{ x: number; y: number; w: number; h: number }>;
    selectedPanel?: number;
    onSelectPanel?: (index: number) => void;
    panelBadge?: (index: number) => React.ReactNode;
}) {
    const url = useComicImageUrl(image);
    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<Drag | null>(null);
    const width = image.width || 1024;
    const height = image.height || 1536;
    const measure = useMemo(() => canvasMeasure(), []);
    const laid = useMemo(() => layoutBubbles(bubbles, width, height, measure), [bubbles, width, height, measure]);
    const stroke = Math.max(2, Math.round(Math.min(width, height) * 0.0035));

    const toImage = (event: { clientX: number; clientY: number }) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    };

    const startDrag = (event: ReactPointerEvent, bubble: ComicBubble, mode: Drag["mode"]) => {
        if (!onChangeBubble) return;
        event.stopPropagation();
        event.preventDefault();
        onSelectBubble?.(bubble.id);
        const point = toImage(event);
        dragRef.current = { id: bubble.id, mode, startX: point.x, startY: point.y, bubble };
        (event.target as Element).setPointerCapture?.(event.pointerId);
    };

    const moveDrag = (event: ReactPointerEvent) => {
        const drag = dragRef.current;
        if (!drag || !onChangeBubble) return;
        const point = toImage(event);
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        const b = drag.bubble;
        // Text moved off the balloon the model drew needs a balloon of its own.
        if (drag.mode === "move") onChangeBubble({ ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h), drawn: b.drawn || Math.hypot(dx, dy) > 0.01 });
        else onChangeBubble({ ...b, w: clamp(b.w + dx, 0.05, 1 - b.x), h: clamp(b.h + dy, 0.025, 1 - b.y) });
    };

    const endDrag = () => {
        dragRef.current = null;
    };

    return (
        <div className={`relative select-none ${className || ""}`} style={{ aspectRatio: `${width} / ${height}` }}>
            {url ? <img src={url} alt="" className="absolute inset-0 size-full rounded-md object-contain" draggable={false} /> : <div className="absolute inset-0 animate-pulse rounded-md bg-stone-100 dark:bg-stone-800" />}
            <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 size-full" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                {panelRects?.map((rect, index) => (
                    <rect
                        key={`panel-${index}`}
                        x={rect.x * width}
                        y={rect.y * height}
                        width={rect.w * width}
                        height={rect.h * height}
                        fill="transparent"
                        stroke={selectedPanel === index ? "var(--skin-accent, #7c3aed)" : "transparent"}
                        strokeWidth={stroke * 2}
                        className={onSelectPanel ? "cursor-pointer" : undefined}
                        onClick={() => onSelectPanel?.(index)}
                    />
                ))}
                {laid.map(({ bubble, box, fontSize, lines }) => {
                    const selected = selectedBubble === bubble.id;
                    const lineHeight = fontSize * 1.25;
                    const top = box.y + box.h / 2 - ((lines.length - 1) * lineHeight) / 2;
                    return (
                        <g key={bubble.id} className={onChangeBubble ? "cursor-move" : undefined} onPointerDown={(event) => startDrag(event, bubble, "move")} onClick={() => onSelectBubble?.(bubble.id)}>
                            {bubble.drawn ? (
                                bubble.kind === "narration" ? (
                                    <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#fffbea" stroke="#111" strokeWidth={stroke} />
                                ) : (
                                    <ellipse cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w / 2} ry={box.h / 2} fill="#fff" stroke="#111" strokeWidth={stroke} />
                                )
                            ) : (
                                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" />
                            )}
                            {lines.map((line, index) => (
                                <text
                                    key={index}
                                    x={box.x + box.w / 2}
                                    y={top + index * lineHeight}
                                    fontSize={fontSize}
                                    fontWeight={bubble.kind === "narration" ? 500 : 700}
                                    fontFamily={COMIC_FONT}
                                    fill="#111"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                >
                                    {line}
                                </text>
                            ))}
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
                                        onPointerDown={(event) => startDrag(event, bubble, "resize")}
                                    />
                                </>
                            ) : null}
                        </g>
                    );
                })}
            </svg>
            {panelRects && panelBadge
                ? panelRects.map((rect, index) => (
                      <div key={`badge-${index}`} className="pointer-events-none absolute" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}>
                          {panelBadge(index)}
                      </div>
                  ))
                : null}
        </div>
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
