import { useEffect, useState } from "react";
import { App, Button, ColorPicker, Input, Modal, Segmented, Select, Slider, Spin } from "antd";
import { Crop } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageEditorDialog } from "@/components/image-editor/image-editor-dialog";
import { DEFAULT_IMAGE_TOOL_OPTIONS, DEFAULT_WATERMARK, processImage, type ImageToolFormat, type ImageToolOptions, type ImageToolResize, type ImageToolResult, type ImageWatermark, type WatermarkPosition } from "@/lib/image-tools";
import { formatBytes } from "@/lib/image-utils";

const MB = 1024 * 1024;
const SIZE_PRESETS = ["none", "long:4096", "long:2048", "long:1536", "long:1024", "long:720", "pct:75", "pct:50", "pct:25"];
const TARGET_PRESETS = [0, 4 * MB, 2 * MB, MB, 500 * 1024, 200 * 1024];
const targetLabel = (bytes: number) => (bytes >= MB ? `${bytes / MB} MB` : `${bytes / 1024} KB`);
/** Reference images above this get flagged in the workbenches. */
export const LARGE_REFERENCE_BYTES = 4 * MB;
/** Preset for a reference image: small enough for several of them in one edit request. */
export const REFERENCE_TOOL_OPTIONS: ImageToolOptions = { ...DEFAULT_IMAGE_TOOL_OPTIONS, resize: { mode: "longEdge", value: 2048 }, targetBytes: 4 * MB };

function resizeKey(resize: ImageToolResize) {
    return resize.mode === "longEdge" ? `long:${resize.value}` : resize.mode === "percent" ? `pct:${resize.value}` : "none";
}

function parseResize(key: string): ImageToolResize {
    const [mode, value] = key.split(":");
    if (mode === "long") return { mode: "longEdge", value: Number(value) };
    if (mode === "pct") return { mode: "percent", value: Number(value) };
    return { mode: "none" };
}

const WATERMARK_GRID: WatermarkPosition[] = ["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br"];

/** Text, colour, size, opacity and position of a text watermark. */
export function WatermarkOptionsForm({ value, onChange }: { value: ImageWatermark; onChange: (value: ImageWatermark) => void }) {
    const { t } = useTranslation();
    return (
        <div className="grid gap-3">
            <Input.TextArea
                autoSize={{ minRows: 1, maxRows: 3 }}
                maxLength={80}
                value={value.text}
                placeholder={t("toolbox.watermark.placeholder")}
                onChange={(event) => onChange({ ...value, text: event.target.value })}
                data-testid="tools-watermark-text"
            />
            {value.text.trim() ? (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-stone-500">{t("toolbox.watermark.color")}</span>
                        <ColorPicker size="small" value={value.color} presets={[{ label: "", colors: ["#ffffff", "#000000", "#9ca3af", "#ef4444", "#f59e0b", "#2563eb"] }]} onChangeComplete={(color) => onChange({ ...value, color: color.toHexString() })} />
                    </div>
                    <div className="grid gap-1">
                        <span className="text-xs text-stone-500">{t("toolbox.watermark.size", { value: value.size })}</span>
                        <Slider min={1} max={15} value={value.size} onChange={(size) => onChange({ ...value, size })} />
                    </div>
                    <div className="grid gap-1">
                        <span className="text-xs text-stone-500">{t("toolbox.watermark.opacity", { value: Math.round(value.opacity * 100) })}</span>
                        <Slider min={10} max={100} value={Math.round(value.opacity * 100)} onChange={(opacity) => onChange({ ...value, opacity: opacity / 100 })} />
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="grid w-fit grid-cols-3 gap-1" role="radiogroup" aria-label={t("toolbox.watermark.position")}>
                            {WATERMARK_GRID.map((position) => (
                                <button
                                    key={position}
                                    type="button"
                                    role="radio"
                                    aria-checked={value.position === position}
                                    aria-label={t(`toolbox.watermark.positions.${position}`)}
                                    title={t(`toolbox.watermark.positions.${position}`)}
                                    className={`size-6 rounded border transition-colors ${value.position === position ? "border-stone-900 bg-stone-900 dark:border-stone-100 dark:bg-stone-100" : "border-stone-300 hover:border-stone-500 dark:border-stone-700"}`}
                                    onClick={() => onChange({ ...value, position })}
                                />
                            ))}
                        </div>
                        <Button size="small" type={value.position === "tile" ? "primary" : "default"} onClick={() => onChange({ ...value, position: value.position === "tile" ? DEFAULT_WATERMARK.position : "tile" })}>
                            {t("toolbox.watermark.positions.tile")}
                        </Button>
                    </div>
                </>
            ) : null}
        </div>
    );
}

/** Format / quality / size / target-size settings shared by the toolbox page and the reference dialog; the page also offers a watermark. */
export function ImageToolOptionsForm({ value, onChange, watermark = false }: { value: ImageToolOptions; onChange: (value: ImageToolOptions) => void; watermark?: boolean }) {
    const { t } = useTranslation();
    const png = value.format === "png";
    return (
        <div className="grid gap-4 text-sm">
            <div className="grid gap-1.5">
                <span className="font-medium">{t("toolbox.format")}</span>
                <Segmented
                    block
                    value={value.format}
                    onChange={(format) => onChange({ ...value, format: format as ImageToolFormat })}
                    options={(["original", "jpeg", "webp", "png"] as const).map((format) => ({ value: format, label: t(`toolbox.formats.${format}`) }))}
                />
            </div>
            <div className="grid gap-1.5">
                <span className="font-medium">
                    {t("toolbox.quality")} {png ? "" : Math.round(value.quality * 100)}
                </span>
                <Slider min={40} max={100} disabled={png} value={Math.round(value.quality * 100)} onChange={(quality) => onChange({ ...value, quality: quality / 100 })} />
                {png ? <span className="text-xs text-stone-500">{t("toolbox.qualityPng")}</span> : null}
            </div>
            <div className="grid gap-1.5">
                <span className="font-medium">{t("toolbox.size")}</span>
                <Select
                    value={resizeKey(value.resize)}
                    onChange={(key) => onChange({ ...value, resize: parseResize(key) })}
                    options={SIZE_PRESETS.map((key) => {
                        const resize = parseResize(key);
                        return { value: key, label: resize.mode === "none" ? t("toolbox.sizes.none") : t(`toolbox.sizes.${resize.mode}`, { value: resize.value }) };
                    })}
                />
            </div>
            <div className="grid gap-1.5">
                <span className="font-medium">{t("toolbox.target")}</span>
                <Select
                    value={value.targetBytes}
                    onChange={(targetBytes) => onChange({ ...value, targetBytes })}
                    options={TARGET_PRESETS.map((bytes) => ({ value: bytes, label: bytes === 0 ? t("toolbox.targets.none") : bytes === LARGE_REFERENCE_BYTES ? t("toolbox.targets.reference") : t("toolbox.targets.value", { size: targetLabel(bytes) }) }))}
                />
            </div>
            {watermark ? (
                <div className="grid gap-1.5">
                    <span className="font-medium">{t("toolbox.watermark.title")}</span>
                    <WatermarkOptionsForm value={value.watermark || DEFAULT_WATERMARK} onChange={(next) => onChange({ ...value, watermark: next })} />
                </div>
            ) : null}
            <p className="m-0 text-xs text-stone-500">{t("toolbox.privacy")}</p>
        </div>
    );
}

/** Compress / resize / crop one image (a workbench reference) and hand back the new file. */
export function ImageToolDialog({ open, source, name, onClose, onApply }: { open: boolean; source: Blob | null; name: string; onClose: () => void; onApply: (file: File) => Promise<void> | void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [options, setOptions] = useState<ImageToolOptions>(REFERENCE_TOOL_OPTIONS);
    const [input, setInput] = useState<Blob | null>(source);
    const [result, setResult] = useState<ImageToolResult | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [urls, setUrls] = useState({ input: "", result: "" });

    useEffect(() => {
        setInput(source);
        setOptions(REFERENCE_TOOL_OPTIONS);
    }, [source]);

    useEffect(() => {
        if (!open || !input) return;
        let cancelled = false;
        setBusy(true);
        setError("");
        const timer = window.setTimeout(() => {
            processImage(input, name, options)
                .then((next) => !cancelled && setResult(next))
                .catch(() => !cancelled && setError(t("toolbox.decodeFailed")))
                .finally(() => !cancelled && setBusy(false));
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, input, name, options, t]);

    useEffect(() => {
        const next = { input: input ? URL.createObjectURL(input) : "", result: result ? URL.createObjectURL(result.blob) : "" };
        setUrls(next);
        return () => {
            if (next.input) URL.revokeObjectURL(next.input);
            if (next.result) URL.revokeObjectURL(next.result);
        };
    }, [input, result]);

    const apply = async () => {
        if (!result) return;
        setBusy(true);
        try {
            await onApply(new File([result.blob], result.name, { type: result.blob.type }));
            message.success(t("toolbox.applied"));
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Modal open={open} title={t("toolbox.dialogTitle")} width={880} onCancel={onClose} destroyOnHidden footer={null}>
                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="grid content-start gap-3 sm:grid-cols-2">
                        {[
                            { key: "original", url: urls.input, info: input ? formatBytes(input.size) + (result ? ` · ${result.sourceWidth}×${result.sourceHeight}` : "") : "" },
                            { key: "result", url: urls.result, info: result ? `${formatBytes(result.blob.size)} · ${result.width}×${result.height}` : "" },
                        ].map((item) => (
                            <figure key={item.key} className="m-0 grid gap-1.5">
                                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900">
                                    {item.key === "result" && busy ? <Spin /> : item.url ? <img src={item.url} alt="" className="max-h-full max-w-full object-contain" /> : null}
                                </div>
                                <figcaption className="text-xs text-stone-500">
                                    {t(`toolbox.${item.key}`)} {item.info}
                                </figcaption>
                            </figure>
                        ))}
                        {error ? <p className="m-0 text-sm text-red-500 sm:col-span-2">{error}</p> : null}
                        {result?.capped ? <p className="m-0 text-xs text-amber-600 sm:col-span-2">{t("toolbox.capped")}</p> : null}
                    </div>
                    <div className="grid content-start gap-4">
                        <ImageToolOptionsForm value={options} onChange={setOptions} />
                        <Button icon={<Crop className="size-4" />} disabled={!input} onClick={() => setEditing(true)}>
                            {t("toolbox.edit")}
                        </Button>
                        <Button type="primary" disabled={!result || busy} loading={busy && Boolean(result)} onClick={() => void apply()}>
                            {t("toolbox.apply")}
                        </Button>
                    </div>
                </div>
            </Modal>
            <ImageEditorDialog
                open={editing}
                src={urls.input}
                onClose={() => setEditing(false)}
                onSave={({ blob }) => {
                    setInput(blob);
                    setEditing(false);
                }}
            />
        </>
    );
}
