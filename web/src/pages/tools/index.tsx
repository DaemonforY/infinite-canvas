import { useEffect, useRef, useState, type DragEvent } from "react";
import { App, Button, Empty, Popconfirm, Segmented, Tag } from "antd";
import { Crop, Download, FolderPlus, ImagePlus, LoaderCircle, Play, Trash2, X } from "lucide-react";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { ImageEditorDialog } from "@/components/image-editor/image-editor-dialog";
import { AiToolOptionsForm, DEFAULT_AI_TOOL_SETTINGS, runAiTool, useImageToolsQuota, type AiToolMode, type AiToolSettings } from "@/components/image-tools/ai-image-tools";
import { ImageToolOptionsForm } from "@/components/image-tools/image-tool-dialog";
import { DEFAULT_IMAGE_TOOL_OPTIONS, isImageFile, normalizeImageFile, processImage, renameForType, type ImageToolOptions, type ImageToolResult } from "@/lib/image-tools";
import { formatBytes } from "@/lib/image-utils";
import { createZip } from "@/lib/zip";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";

type ToolItem = {
    id: string;
    name: string;
    source: Blob;
    sourceUrl: string;
    status: "pending" | "processing" | "done" | "error";
    result?: ImageToolResult;
    resultUrl?: string;
};

// Shows transparent areas of cut-outs.
const CHECKERBOARD = { backgroundImage: "repeating-conic-gradient(#d6d3d1 0 25%, #fafaf9 0 50%)", backgroundSize: "16px 16px" };

function revoke(item: ToolItem) {
    URL.revokeObjectURL(item.sourceUrl);
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

export default function ToolsPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);
    const [items, setItems] = useState<ToolItem[]>([]);
    const [options, setOptions] = useState<ImageToolOptions>(DEFAULT_IMAGE_TOOL_OPTIONS);
    const [mode, setMode] = useState<"local" | AiToolMode>("local");
    const [aiSettings, setAiSettings] = useState<AiToolSettings>(DEFAULT_AI_TOOL_SETTINGS);
    const { apiKey, quota, refresh: refreshQuota } = useImageToolsQuota();
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const itemsRef = useRef(items);
    itemsRef.current = items;

    useEffect(() => () => itemsRef.current.forEach(revoke), []);

    const update = (id: string, patch: Partial<ToolItem>) => setItems((value) => value.map((item) => (item.id === id ? { ...item, ...patch } : item)));

    const resetResults = () =>
        setItems((value) =>
            value.map((item) => {
                if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
                return { ...item, status: "pending", result: undefined, resultUrl: undefined };
            }),
        );

    const addFiles = async (files: Iterable<File>) => {
        const list = Array.from(files);
        const images = list.filter(isImageFile);
        if (images.length < list.length) message.warning(t("toolbox.unsupported"));
        for (const file of images) {
            try {
                const source = await normalizeImageFile(file);
                setItems((value) => [...value, { id: nanoid(), name: source.name, source, sourceUrl: URL.createObjectURL(source), status: "pending" }]);
            } catch {
                message.error(t("toolbox.readFailed", { name: file.name }));
            }
        }
    };

    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const files = Array.from(event.clipboardData?.files || []);
            if (files.length) void addFiles(files);
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    });

    const run = async () => {
        setRunning(true);
        for (const item of itemsRef.current) {
            if (item.status === "done") continue;
            update(item.id, { status: "processing" });
            try {
                const result = mode === "local" ? await processImage(item.source, item.name, options) : await runAiTool(apiKey, mode, aiSettings, item.source, item.name);
                update(item.id, { status: "done", result, resultUrl: URL.createObjectURL(result.blob) });
            } catch (error) {
                update(item.id, { status: "error" });
                // A server-side failure (balance, queue, unreadable image) is explained once and stops the batch.
                if (mode !== "local") {
                    message.error((error as Error)?.message || t("toolbox.failed"));
                    break;
                }
            }
        }
        setRunning(false);
        if (mode !== "local") void refreshQuota();
    };

    const outputs = items.filter((item) => item.result).map((item) => item.result!);
    const downloadAll = async () => {
        if (outputs.length === 1) return saveAs(outputs[0].blob, outputs[0].name);
        const used = new Set<string>();
        const files = outputs.map((result) => {
            let name = result.name;
            for (let n = 2; used.has(name); n += 1) name = result.name.replace(/(\.[^.]+)$/, `-${n}$1`);
            used.add(name);
            return { name, data: result.blob };
        });
        saveAs(await createZip(files), "images.zip");
    };

    const saveToAssets = async () => {
        setSaving(true);
        try {
            for (const result of outputs) {
                const image = await uploadImage(result.blob);
                addAsset({
                    kind: "image",
                    title: result.name,
                    coverUrl: image.url,
                    tags: [],
                    source: t("toolbox.title"),
                    data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
                });
            }
            message.success(t("toolbox.savedToAssets", { count: outputs.length }));
        } finally {
            setSaving(false);
        }
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        void addFiles(event.dataTransfer.files);
    };

    const sourceTotal = items.reduce((sum, item) => sum + item.source.size, 0);
    const resultTotal = outputs.reduce((sum, result) => sum + result.blob.size, 0);
    const editing = items.find((item) => item.id === editingId);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
                <div className="mx-auto max-w-6xl">
                    <div className="text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">{t("toolbox.title")}</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">{t("toolbox.description")}</p>
                    </div>

                    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="grid content-start gap-4">
                            <div
                                role="button"
                                tabIndex={0}
                                className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors ${dragging ? "border-stone-900 bg-stone-100/80 dark:border-stone-100 dark:bg-stone-900/80" : "border-stone-300 hover:border-stone-500 dark:border-stone-700"}`}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && fileInputRef.current?.click()}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={onDrop}
                                data-testid="tools-drop"
                            >
                                <ImagePlus className="size-7 text-stone-400" />
                                <span className="text-sm font-medium">{t("toolbox.drop")}</span>
                                <span className="text-xs text-stone-500">{t("toolbox.dropHint")}</span>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                hidden
                                onChange={(event) => {
                                    void addFiles(event.target.files || []);
                                    event.target.value = "";
                                }}
                            />

                            {items.length ? (
                                <>
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-500">
                                        <span>
                                            {outputs.length ? t("toolbox.summary", { count: items.length, from: formatBytes(sourceTotal), to: formatBytes(resultTotal) }) : t("toolbox.count", { count: items.length, size: formatBytes(sourceTotal) })}
                                        </span>
                                        <Popconfirm
                                            title={t("toolbox.clearConfirm")}
                                            okText={t("toolbox.clear")}
                                            cancelText={t("common.cancel")}
                                            okButtonProps={{ danger: true }}
                                            onConfirm={() => {
                                                items.forEach(revoke);
                                                setItems([]);
                                            }}
                                        >
                                            <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />}>
                                                {t("toolbox.clear")}
                                            </Button>
                                        </Popconfirm>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                        {items.map((item) => (
                                            <div key={item.id} className="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800" data-testid="tools-item">
                                                <div className="relative flex aspect-square items-center justify-center bg-stone-50 dark:bg-stone-900" style={item.result?.blob.type === "image/png" ? CHECKERBOARD : undefined}>
                                                    <img src={item.resultUrl || item.sourceUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
                                                    {item.status === "processing" ? (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                            <LoaderCircle className="size-6 animate-spin text-white" />
                                                        </div>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-red-600"
                                                        aria-label={t("toolbox.remove")}
                                                        title={t("toolbox.remove")}
                                                        onClick={() => (revoke(item), setItems((value) => value.filter((other) => other.id !== item.id)))}
                                                    >
                                                        <X className="size-3.5" />
                                                    </button>
                                                </div>
                                                <div className="grid gap-1 p-2 text-xs">
                                                    <span className="truncate font-medium" title={item.result?.name || item.name}>
                                                        {item.result?.name || item.name}
                                                    </span>
                                                    <span className="text-stone-500">
                                                        {formatBytes(item.source.size)}
                                                        {item.result ? (
                                                            <>
                                                                {" → "}
                                                                <span className={item.result.blob.size < item.source.size ? "font-medium text-emerald-600" : ""}>{formatBytes(item.result.blob.size)}</span>
                                                                {` · ${item.result.width}×${item.result.height}`}
                                                            </>
                                                        ) : null}
                                                    </span>
                                                    {item.result?.kept ? <span className="text-amber-600">{t("toolbox.kept")}</span> : null}
                                                    {item.result?.capped ? <span className="text-amber-600">{t("toolbox.capped")}</span> : null}
                                                    {item.status === "error" ? (
                                                        <Tag color="error" className="m-0 w-fit">
                                                            {t("toolbox.failed")}
                                                        </Tag>
                                                    ) : null}
                                                    <div className="mt-1 flex gap-1">
                                                        <Button size="small" type="text" icon={<Crop className="size-3.5" />} onClick={() => setEditingId(item.id)}>
                                                            {t("toolbox.edit")}
                                                        </Button>
                                                        <Button size="small" type="text" icon={<Download className="size-3.5" />} disabled={!item.result} onClick={() => item.result && saveAs(item.result.blob, item.result.name)}>
                                                            {t("toolbox.download")}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <Empty description={t("toolbox.empty")} className="py-6" />
                            )}
                        </div>

                        <aside className="grid content-start gap-4 rounded-xl border border-stone-200 p-4 lg:sticky lg:top-0 dark:border-stone-800">
                            <span className="text-base font-semibold">{t("toolbox.options")}</span>
                            <Segmented
                                block
                                value={mode}
                                disabled={running}
                                onChange={(next) => {
                                    setMode(next as typeof mode);
                                    resetResults();
                                }}
                                options={[
                                    { value: "local", label: t("toolbox.modes.local") },
                                    { value: "removeBg", label: t("toolbox.modes.removeBg") },
                                    { value: "upscale", label: t("toolbox.modes.upscale") },
                                ]}
                            />
                            {mode === "local" ? (
                                <ImageToolOptionsForm
                                    value={options}
                                    onChange={(next) => {
                                        setOptions(next);
                                        resetResults();
                                    }}
                                />
                            ) : (
                                <AiToolOptionsForm
                                    mode={mode}
                                    value={aiSettings}
                                    onChange={(next) => {
                                        setAiSettings(next);
                                        resetResults();
                                    }}
                                    quota={quota}
                                    connected={Boolean(apiKey)}
                                />
                            )}
                            <Button
                                type="primary"
                                icon={<Play className="size-4" />}
                                loading={running}
                                disabled={!items.some((item) => item.status !== "done") || (mode !== "local" && !(quota?.enabled && apiKey))}
                                onClick={() => void run()}
                                data-testid="tools-run"
                            >
                                {running ? t("toolbox.processing") : t("toolbox.process")}
                            </Button>
                            <Button icon={<Download className="size-4" />} disabled={!outputs.length || running} onClick={() => void downloadAll()}>
                                {outputs.length > 1 ? t("toolbox.downloadAll") : t("toolbox.download")}
                            </Button>
                            <Button icon={<FolderPlus className="size-4" />} disabled={!outputs.length || running} loading={saving} onClick={() => void saveToAssets()}>
                                {t("toolbox.saveToAssets")}
                            </Button>
                        </aside>
                    </div>
                </div>
            </main>
            <ImageEditorDialog
                open={Boolean(editing)}
                src={editing?.sourceUrl || ""}
                onClose={() => setEditingId("")}
                onSave={({ blob }) => {
                    if (!editing) return;
                    revoke(editing);
                    update(editing.id, { name: renameForType(editing.name, blob.type), source: blob, sourceUrl: URL.createObjectURL(blob), status: "pending", result: undefined, resultUrl: undefined });
                    setEditingId("");
                }}
            />
        </div>
    );
}
