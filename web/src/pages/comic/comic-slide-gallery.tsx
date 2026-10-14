import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Full-screen slides swiped like a 小红书 post: arrows, keys, swipe, dots. Used for the sample, the preview before
 * posting and, in WeChat, for saving the slides one long-press at a time (`footer`).
 */
export function SlideGallery({
    open,
    images,
    title,
    startIndex = 0,
    onClose,
    footer,
    hint,
}: {
    open: boolean;
    images: string[];
    title?: string;
    startIndex?: number;
    onClose: () => void;
    footer?: (index: number, go: (index: number) => void) => ReactNode;
    hint?: string;
}) {
    const { t } = useTranslation();
    const [index, setIndex] = useState(startIndex);
    const startX = useRef<number | null>(null);
    const go = (next: number) => setIndex(Math.max(0, Math.min(images.length - 1, next)));

    useEffect(() => {
        if (open) setIndex(startIndex);
    }, [open, startIndex]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "ArrowRight") setIndex((value) => Math.min(images.length - 1, value + 1));
            if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, images.length, onClose]);

    if (!open || !images.length) return null;
    return createPortal(
        <div className="fixed inset-0 z-[1100] flex flex-col bg-black/95 text-white" data-testid="comic-slide-gallery">
            <div className="flex h-12 shrink-0 items-center gap-3 px-4">
                <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
                <span className="text-xs text-white/60">
                    {index + 1} / {images.length}
                </span>
                <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-white/10" aria-label={t("common.cancel")}>
                    <X className="size-4" />
                </button>
            </div>
            <div
                className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2"
                onPointerDown={(event) => {
                    startX.current = event.clientX;
                }}
                onPointerUp={(event) => {
                    if (startX.current === null) return;
                    const dx = event.clientX - startX.current;
                    startX.current = null;
                    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
                }}
            >
                <img src={images[index]} alt="" className="max-h-full max-w-full rounded-lg object-contain" draggable={false} />
                {index > 0 ? (
                    <button type="button" onClick={() => go(index - 1)} className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 max-sm:hidden" aria-label="‹">
                        <ChevronLeft className="size-5" />
                    </button>
                ) : null}
                {index < images.length - 1 ? (
                    <button type="button" onClick={() => go(index + 1)} className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 max-sm:hidden" aria-label="›">
                        <ChevronRight className="size-5" />
                    </button>
                ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2 px-4 pb-5 pt-3">
                <div className="flex gap-1.5">
                    {images.map((_, k) => (
                        <button key={k} type="button" onClick={() => go(k)} className={`h-1.5 rounded-full transition-all ${k === index ? "w-5 bg-rose-500" : "w-1.5 bg-white/40"}`} aria-label={`${k + 1}`} />
                    ))}
                </div>
                {hint ? <div className="text-sm">{hint}</div> : null}
                {footer?.(index, go)}
            </div>
        </div>,
        document.body,
    );
}
