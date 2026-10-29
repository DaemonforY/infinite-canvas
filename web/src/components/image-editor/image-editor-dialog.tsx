import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, Modal, Segmented, Slider, Spin } from "antd";
import { Brush, Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Sparkles, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { cropDataUrl } from "@/lib/canvas/canvas-image-data";
import { ADJUSTMENT_RANGES, FILTER_PRESETS, IDENTITY_GEOMETRY, NEUTRAL_ADJUSTMENTS, isNeutral, rotateBy, type Adjustments, type FilterPresetId, type Geometry } from "@/lib/image-editor/adjustments";
import { canvasToBlob, loadImageElement, mimeTypeOf, renderEdited } from "@/lib/image-editor/render";
import { canvasMeasure, drawTextLayers, ensureLayerFonts, hitTestLayers, layoutLayer, type TextLayer } from "@/lib/image-editor/text-layers";
import { TextLayerPanel } from "@/components/image-editor/text-layer-panel";

export type ImageEditorResult = { blob: Blob; width: number; height: number };

export type ImageEditorTab = "adjust" | "filter" | "crop" | "text" | "ai";
type Tab = ImageEditorTab;

const PREVIEW_LONG_EDGE = 1100;
const THUMB_LONG_EDGE = 120;
const SLIDER_KEYS: (keyof Adjustments)[] = ["brightness", "contrast", "saturation", "warmth", "sharpness", "vignette", "fade"];
const AI_SUGGESTIONS = ["night", "watercolor", "background", "clearer", "brighter", "cartoon"] as const;

/**
 * Non-destructive image editor: crop / rotate / flip, tone and color adjustments, filter presets,
 * text and seal layers (real fonts instead of the model's misspelt text), and hand-off to AI edits. Saving always produces a new image; the original is untouched.
 */
export function ImageEditorDialog({
    open,
    src,
    onClose,
    onSave,
    onAiEdit,
    onMaskEdit,
    initialLayers,
    initialTab,
}: {
    open: boolean;
    src: string;
    onClose: () => void;
    onSave: (result: ImageEditorResult) => Promise<void> | void;
    /** Whole-image AI edit: receives the instruction and the current edited image. */
    onAiEdit?: (input: { instruction: string; image: ImageEditorResult }) => Promise<void> | void;
    /** Opens the host's mask (inpainting) editor on the original image. */
    onMaskEdit?: () => void;
    /** Text layers already placed (e.g. 诗画's poem), and the tab to open on. */
    initialLayers?: TextLayer[];
    initialTab?: Tab;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [tab, setTab] = useState<Tab>("adjust");
    const [baseSrc, setBaseSrc] = useState(src);
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [original, setOriginal] = useState<HTMLImageElement | null>(null);
    const [geometry, setGeometry] = useState<Geometry>(IDENTITY_GEOMETRY);
    const [adjustments, setAdjustments] = useState<Adjustments>(NEUTRAL_ADJUSTMENTS);
    const [presetId, setPresetId] = useState<FilterPresetId>("original");
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    const [comparing, setComparing] = useState(false);
    const [cropSrc, setCropSrc] = useState("");
    const [aiText, setAiText] = useState("");
    const [busy, setBusy] = useState<"" | "save" | "ai" | "crop">("");
    const [loadError, setLoadError] = useState(false);
    const [layers, setLayers] = useState<TextLayer[]>([]);
    const [selectedLayerId, setSelectedLayerId] = useState("");
    const [fontsTick, setFontsTick] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const frameRef = useRef(0);
    const dragRef = useRef<{ id: string; dx: number; dy: number; pointerId: number } | null>(null);

    const mimeType = useMemo(() => mimeTypeOf(src), [src]);
    const hasText = layers.some((l) => l.text.trim());
    const dirty = baseSrc !== src || geometry.rotate !== 0 || geometry.flipH || geometry.flipV || !isNeutral(adjustments) || hasText;

    // Reset whenever a new image is opened.
    useEffect(() => {
        if (!open) return;
        setTab(initialTab || "adjust");
        setBaseSrc(src);
        setGeometry(IDENTITY_GEOMETRY);
        setAdjustments(NEUTRAL_ADJUSTMENTS);
        setPresetId("original");
        setAiText("");
        setLayers(initialLayers ? initialLayers.map((layer) => ({ ...layer })) : []);
        setSelectedLayerId("");
        setLoadError(false);
        // Only opening (or a new image) resets the editor; the initial props are read then.
    }, [open, src]);

    // Fetch the font chunks for the characters in use, then redraw with the real faces.
    useEffect(() => {
        if (!open || !layers.length) return;
        let cancelled = false;
        void ensureLayerFonts(layers).then(() => !cancelled && setFontsTick((n) => n + 1));
        return () => {
            cancelled = true;
        };
    }, [layers, open]);

    useEffect(() => {
        if (!open || !src) return;
        let cancelled = false;
        loadImageElement(src)
            .then((el) => !cancelled && setOriginal(el))
            .catch(() => !cancelled && setLoadError(true));
        return () => {
            cancelled = true;
        };
    }, [open, src]);

    useEffect(() => {
        if (!open || !baseSrc) return;
        let cancelled = false;
        setImg(null);
        loadImageElement(baseSrc)
            .then((el) => !cancelled && setImg(el))
            .catch(() => !cancelled && setLoadError(true));
        return () => {
            cancelled = true;
        };
    }, [open, baseSrc]);

    // Live preview (downsampled), coalesced to one render per frame while sliders move.
    useEffect(() => {
        if (!open || !canvasRef.current) return;
        const source = comparing ? original : img;
        if (!source) return;
        cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            if (!canvasRef.current) return;
            const canvas = renderEdited(source, comparing ? IDENTITY_GEOMETRY : geometry, comparing ? NEUTRAL_ADJUSTMENTS : adjustments, PREVIEW_LONG_EDGE, canvasRef.current);
            if (comparing || !layers.length) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            drawTextLayers(ctx, layers, canvas.width, canvas.height);
            const selected = tab === "text" ? layers.find((l) => l.id === selectedLayerId) : undefined;
            if (selected) {
                const { box } = layoutLayer(selected, canvas.width, canvas.height, canvasMeasure(ctx, selected));
                const pad = 4;
                ctx.save();
                ctx.setLineDash([5, 4]);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "rgba(255,255,255,0.95)";
                ctx.strokeRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);
                ctx.strokeStyle = "rgba(0,0,0,0.55)";
                ctx.lineDashOffset = 4.5;
                ctx.strokeRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);
                ctx.restore();
            }
        });
        return () => cancelAnimationFrame(frameRef.current);
    }, [adjustments, comparing, fontsTick, geometry, img, layers, open, original, selectedLayerId, tab]);

    // Drag text layers on the preview while the 「文字」 tab is open.
    const pointerToCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height, w: canvas.width, h: canvas.height };
    };
    const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (tab !== "text" || !layers.length) return;
        const ctx = e.currentTarget.getContext("2d");
        if (!ctx) return;
        const p = pointerToCanvas(e);
        const index = hitTestLayers(ctx, layers, p.w, p.h, p.x, p.y);
        if (index < 0) return;
        const layer = layers[index];
        setSelectedLayerId(layer.id);
        dragRef.current = { id: layer.id, dx: p.x / p.w - layer.x, dy: p.y / p.h - layer.y, pointerId: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const p = pointerToCanvas(e);
        const x = Math.min(0.98, Math.max(-0.2, p.x / p.w - drag.dx));
        const y = Math.min(0.98, Math.max(-0.2, p.y / p.h - drag.dy));
        setLayers((current) => current.map((l) => (l.id === drag.id ? { ...l, x, y } : l)));
    };
    const onCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    };

    // Filter thumbnails follow the current crop / rotation.
    useEffect(() => {
        if (!open || !img || tab !== "filter") return;
        const next: Record<string, string> = {};
        for (const preset of FILTER_PRESETS) next[preset.id] = renderEdited(img, geometry, preset.adjustments, THUMB_LONG_EDGE).toDataURL("image/jpeg", 0.8);
        setThumbs(next);
    }, [geometry, img, open, tab]);

    const renderFull = useCallback(async (): Promise<ImageEditorResult> => {
        if (!img) throw new Error("image not loaded");
        const canvas = renderEdited(img, geometry, adjustments);
        if (layers.some((l) => l.text.trim())) {
            await ensureLayerFonts(layers);
            const ctx = canvas.getContext("2d");
            if (ctx) drawTextLayers(ctx, layers, canvas.width, canvas.height);
        }
        return { blob: await canvasToBlob(canvas, mimeType), width: canvas.width, height: canvas.height };
    }, [adjustments, geometry, img, layers, mimeType]);

    const setValue = (key: keyof Adjustments, value: number) => {
        setAdjustments((current) => ({ ...current, [key]: value }));
        setPresetId("original");
    };

    const applyPreset = (id: FilterPresetId) => {
        const preset = FILTER_PRESETS.find((p) => p.id === id);
        if (!preset) return;
        setPresetId(id);
        setAdjustments(preset.adjustments);
    };

    // Crop works on the image as currently rotated/flipped; the result becomes the new base.
    const openCrop = () => {
        if (!img) return;
        setBusy("crop");
        try {
            setCropSrc(renderEdited(img, geometry, NEUTRAL_ADJUSTMENTS).toDataURL(mimeType === "image/jpeg" ? "image/jpeg" : "image/png", 0.95));
        } finally {
            setBusy("");
        }
    };

    const confirmCrop = async (rect: CanvasImageCropRect) => {
        const cropped = await cropDataUrl(cropSrc, rect);
        setCropSrc("");
        setGeometry(IDENTITY_GEOMETRY);
        setBaseSrc(cropped);
    };

    const reset = () => {
        setBaseSrc(src);
        setGeometry(IDENTITY_GEOMETRY);
        setAdjustments(NEUTRAL_ADJUSTMENTS);
        setPresetId("original");
        setLayers([]);
        setSelectedLayerId("");
    };

    const save = async () => {
        setBusy("save");
        try {
            await onSave(await renderFull());
        } catch (error) {
            message.error(error instanceof Error && error.message !== "image not loaded" ? error.message : t("imageEditor.saveFailed"));
        } finally {
            setBusy("");
        }
    };

    const runAiEdit = async (instruction: string) => {
        if (!onAiEdit || !instruction.trim()) return;
        setBusy("ai");
        try {
            await onAiEdit({ instruction: instruction.trim(), image: await renderFull() });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("imageEditor.saveFailed"));
        } finally {
            setBusy("");
        }
    };

    const tabs = [
        { label: t("imageEditor.tabs.adjust"), value: "adjust" },
        { label: t("imageEditor.tabs.filter"), value: "filter" },
        { label: t("imageEditor.tabs.crop"), value: "crop" },
        { label: t("imageEditor.tabs.text"), value: "text" },
        ...(onAiEdit || onMaskEdit ? [{ label: t("imageEditor.tabs.ai"), value: "ai" }] : []),
    ];

    return (
        <>
            <Modal
                open={open}
                onCancel={onClose}
                width={1040}
                centered
                destroyOnHidden
                title={t("imageEditor.title")}
                footer={
                    <div className="flex items-center justify-between gap-2">
                        <Button icon={<Undo2 className="size-4" />} onClick={reset} disabled={!dirty || Boolean(busy)}>
                            {t("imageEditor.reset")}
                        </Button>
                        <div className="flex gap-2">
                            <Button onClick={onClose}>{t("common.cancel")}</Button>
                            <Button type="primary" onClick={() => void save()} loading={busy === "save"} disabled={!img || !dirty} data-testid="image-editor-save">
                                {t("imageEditor.saveAsNew")}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="flex flex-col gap-4 md:flex-row" data-testid="image-editor">
                    <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e7e5e4_0%_25%,#fafaf9_0%_50%)] bg-[length:20px_20px] p-3 dark:bg-[repeating-conic-gradient(#292524_0%_25%,#1c1917_0%_50%)]">
                        {loadError ? <p className="text-sm text-red-500">{t("imageEditor.loadFailed")}</p> : null}
                        {!img && !loadError ? <Spin /> : null}
                        <canvas
                            ref={canvasRef}
                            className={img ? `max-h-[62vh] max-w-full rounded shadow-sm ${tab === "text" && layers.length ? "cursor-move touch-none" : ""}` : "hidden"}
                            onPointerDown={onCanvasPointerDown}
                            onPointerMove={onCanvasPointerMove}
                            onPointerUp={onCanvasPointerUp}
                            onPointerCancel={onCanvasPointerUp}
                        />
                        {img ? (
                            <button
                                type="button"
                                className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2.5 py-1 text-xs text-white select-none"
                                onPointerDown={() => setComparing(true)}
                                onPointerUp={() => setComparing(false)}
                                onPointerLeave={() => setComparing(false)}
                            >
                                {comparing ? t("imageEditor.showingOriginal") : t("imageEditor.holdToCompare")}
                            </button>
                        ) : null}
                    </div>

                    <div className="w-full shrink-0 space-y-4 md:w-[300px]">
                        <Segmented block options={tabs} value={tab} onChange={(value) => setTab(value as Tab)} />

                        {tab === "adjust" ? (
                            <div className="space-y-3">
                                {SLIDER_KEYS.map((key) => (
                                    <div key={key}>
                                        <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
                                            <button type="button" className="hover:underline" title={t("imageEditor.dblClickReset")} onDoubleClick={() => setValue(key, 0)}>
                                                {t(`imageEditor.adjust.${key}`)}
                                            </button>
                                            <span className="tabular-nums">{adjustments[key]}</span>
                                        </div>
                                        <Slider min={ADJUSTMENT_RANGES[key][0]} max={ADJUSTMENT_RANGES[key][1]} value={adjustments[key]} onChange={(value) => setValue(key, value)} tooltip={{ open: false }} />
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {tab === "filter" ? (
                            <div className="grid grid-cols-3 gap-2">
                                {FILTER_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => applyPreset(preset.id)}
                                        className={`overflow-hidden rounded-lg border text-center text-xs ${presetId === preset.id ? "border-[var(--primary)] ring-1 ring-[var(--primary)]" : "border-stone-200 dark:border-stone-700"}`}
                                        data-testid={`image-editor-filter-${preset.id}`}
                                    >
                                        {thumbs[preset.id] ? <img src={thumbs[preset.id]} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-stone-100 dark:bg-stone-800" />}
                                        <div className="py-1">{t(`imageEditor.filters.${preset.id}`)}</div>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {tab === "crop" ? (
                            <div className="space-y-3">
                                <Button block icon={<Crop className="size-4" />} onClick={openCrop} loading={busy === "crop"} disabled={!img}>
                                    {t("imageEditor.cropAction")}
                                </Button>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button icon={<RotateCcw className="size-4" />} onClick={() => setGeometry((g) => rotateBy(g, -90))}>
                                        {t("imageEditor.rotateLeft")}
                                    </Button>
                                    <Button icon={<RotateCw className="size-4" />} onClick={() => setGeometry((g) => rotateBy(g, 90))}>
                                        {t("imageEditor.rotateRight")}
                                    </Button>
                                    <Button icon={<FlipHorizontal2 className="size-4" />} onClick={() => setGeometry((g) => ({ ...g, flipH: !g.flipH }))}>
                                        {t("imageEditor.flipH")}
                                    </Button>
                                    <Button icon={<FlipVertical2 className="size-4" />} onClick={() => setGeometry((g) => ({ ...g, flipV: !g.flipV }))}>
                                        {t("imageEditor.flipV")}
                                    </Button>
                                </div>
                                <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">{t("imageEditor.cropHint")}</p>
                            </div>
                        ) : null}

                        {tab === "text" ? <TextLayerPanel layers={layers} selectedId={selectedLayerId} onLayersChange={setLayers} onSelect={setSelectedLayerId} onEraseText={onMaskEdit} /> : null}

                        {tab === "ai" ? (
                            <div className="space-y-3">
                                {onAiEdit ? (
                                    <>
                                        <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">{t("imageEditor.aiHint")}</p>
                                        <Input.TextArea rows={3} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder={t("imageEditor.aiPlaceholder")} maxLength={1000} />
                                        <div className="flex flex-wrap gap-1.5">
                                            {AI_SUGGESTIONS.map((key) => (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs hover:border-[var(--primary)] dark:border-stone-700"
                                                    onClick={() => setAiText(t(`imageEditor.aiSuggestions.${key}`))}
                                                >
                                                    {t(`imageEditor.aiSuggestions.${key}`)}
                                                </button>
                                            ))}
                                        </div>
                                        <Button type="primary" block icon={<Sparkles className="size-4" />} onClick={() => void runAiEdit(aiText)} loading={busy === "ai"} disabled={!aiText.trim() || !img} data-testid="image-editor-ai">
                                            {t("imageEditor.aiAction")}
                                        </Button>
                                    </>
                                ) : null}
                                {onMaskEdit ? (
                                    <Button block icon={<Brush className="size-4" />} onClick={onMaskEdit}>
                                        {t("imageEditor.maskAction")}
                                    </Button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            </Modal>
            {cropSrc ? <CanvasNodeCropDialog dataUrl={cropSrc} open={Boolean(cropSrc)} onClose={() => setCropSrc("")} onConfirm={(rect) => void confirmCrop(rect)} /> : null}
        </>
    );
}
