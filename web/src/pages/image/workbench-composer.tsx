import { useRef, useState, type Dispatch, type ReactNode, type Ref, type SetStateAction } from "react";
import { Button, Input, InputNumber, Popover, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, History, ImagePlus, ScanText, SlidersHorizontal, Sparkles, Wand2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ReferenceSizeBadge } from "@/components/image-tools/reference-image-tool";
import { ModelPicker } from "@/components/model-picker";
import { useCanvasTheme } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { formatDuration } from "@/lib/image-utils";
import { computeMediaSize, inferMediaRatio, inferMediaScale } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import { previewUrlFor } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";
import type { ReferenceImage } from "@/types/image";
import { PromptAssistPanel, type PromptAssistMode } from "./prompt-assist-panel";

type UpdateConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

// Ratios by what people make with them; 21:9 / 9:21 stay in 全部设置.
const RATIOS = [
    { value: "1:1", use: "square" },
    { value: "3:4", use: "xiaohongshu" },
    { value: "9:16", use: "phone" },
    { value: "2:3", use: "poster" },
    { value: "4:3", use: "slide" },
    { value: "16:9", use: "cover" },
    { value: "3:2", use: "photo" },
    { value: "auto", use: "auto" },
] as const;
const SCALES = ["1k", "2k", "4k"] as const;
const COUNTS = [1, 2, 4] as const;

function RatioIcon({ ratio, className }: { ratio: string; className?: string }) {
    const [w, h] = ratio === "auto" ? [12, 12] : ratio.split(":").map(Number);
    const scale = 14 / Math.max(w, h);
    return <i className={cn("inline-block shrink-0 rounded-[2px] border-[1.5px] border-current", ratio === "auto" && "border-dashed", className)} style={{ width: Math.round(w * scale), height: Math.round(h * scale) }} />;
}

function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs transition",
                active
                    ? "border-(--skin-accent) bg-(--skin-accent)/10 text-stone-900 dark:text-stone-100"
                    : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-700 dark:hover:text-stone-100",
            )}
        >
            {children}
        </button>
    );
}

export function WorkbenchComposer({
    textareaRef,
    prompt,
    onPromptChange,
    references,
    setReferences,
    onAddFiles,
    onOpenReferenceTool,
    config,
    model,
    updateConfig,
    openConfigDialog,
    running,
    elapsedMs,
    onGenerate,
    onOpenInspiration,
    onOpenLogs,
}: {
    textareaRef: Ref<TextAreaRef>;
    prompt: string;
    onPromptChange: (value: string) => void;
    references: ReferenceImage[];
    setReferences: Dispatch<SetStateAction<ReferenceImage[]>>;
    onAddFiles: (files: FileList | File[] | null | undefined) => void;
    onOpenReferenceTool: (item: ReferenceImage) => void;
    config: AiConfig;
    model: string;
    updateConfig: UpdateConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    running: boolean;
    elapsedMs: number;
    onGenerate: () => void;
    onOpenInspiration: () => void;
    onOpenLogs: () => void;
}) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [assist, setAssist] = useState<PromptAssistMode | null>(null);
    const [dragging, setDragging] = useState(false);
    const account = useMainAccountStore((state) => state.account);

    const size = config.size || "1:1";
    const ratio = inferMediaRatio(size);
    const scale = inferMediaScale(size);
    const count = Math.max(1, Math.min(10, Number(config.count) || 1));
    const setRatio = (value: string) => updateConfig("size", computeMediaSize(scale, value));
    const setScale = (value: string) => updateConfig("size", computeMediaSize(value, ratio === "auto" ? "1:1" : ratio));
    const advancedChanged = (config.quality && config.quality !== "auto") || config.background === "transparent";
    const ratioUse = RATIOS.find((item) => item.value === ratio)?.use;

    const ratioPanel = (
        <div className="w-[336px]">
            <div className="mb-2 text-xs text-stone-500">{t("studio.params.ratio")}</div>
            <div className="grid grid-cols-4 gap-1.5">
                {RATIOS.map((item) => (
                    <button
                        key={item.value}
                        type="button"
                        onClick={() => setRatio(item.value)}
                        className={cn(
                            "flex h-[68px] flex-col items-center justify-center gap-1 rounded-lg border text-xs transition",
                            ratio === item.value ? "border-(--skin-accent) bg-(--skin-accent)/10" : "border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700",
                        )}
                    >
                        <RatioIcon ratio={item.value} />
                        <span>{item.value === "auto" ? t("settingsPanels.common.auto") : item.value}</span>
                        <span className="text-[10.5px] text-stone-400">{t(`studio.params.uses.${item.use}`)}</span>
                    </button>
                ))}
            </div>
            <div className="mb-2 mt-4 text-xs text-stone-500">{t("studio.params.clarity")}</div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-900">
                {SCALES.map((value) => (
                    <button
                        key={value}
                        type="button"
                        disabled={ratio === "auto"}
                        onClick={() => setScale(value)}
                        className={cn("h-8 rounded-md text-xs transition disabled:opacity-40", scale === value && ratio !== "auto" ? "bg-white shadow-sm dark:bg-stone-700" : "text-stone-500")}
                    >
                        {t(`studio.params.scales.${value}`)}
                    </button>
                ))}
            </div>
            <p className="mt-2 text-[11.5px] text-stone-400">{ratio === "auto" ? t("studio.params.autoHint") : t("studio.params.clarityHint")}</p>
        </div>
    );

    const countPanel = (
        <div className="w-[220px]">
            <div className="mb-2 text-xs text-stone-500">{t("studio.params.count")}</div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-900">
                {COUNTS.map((value) => (
                    <button key={value} type="button" onClick={() => updateConfig("count", String(value))} className={cn("h-8 rounded-md text-xs transition", count === value ? "bg-white shadow-sm dark:bg-stone-700" : "text-stone-500")}>
                        {t("studio.params.countValue", { count: value })}
                    </button>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
                {t("studio.params.countCustom")}
                <InputNumber size="small" min={1} max={10} value={count} onChange={(value) => updateConfig("count", String(value || 1))} className="w-20" />
            </div>
            <p className="mt-2 text-[11.5px] text-stone-400">{t("studio.params.countHint")}</p>
        </div>
    );

    const advancedPanel = (
        <div className="w-[340px] space-y-3">
            <div>
                <div className="mb-1.5 text-xs text-stone-500">{t("workbench.model")}</div>
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("imageModel", value)} capability="image" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </div>
            <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" maxCount={10} />
        </div>
    );

    const sizeLabel = ratio === "auto" ? t("settingsPanels.common.auto") : `${ratio}${ratioUse && ratioUse !== "auto" ? ` ${t(`studio.params.uses.${ratioUse}`)}` : ""}`;

    return (
        <div className="relative mx-auto w-full max-w-[920px]">
            {assist ? (
                <div className="absolute inset-x-0 bottom-full z-20 mb-2">
                    <PromptAssistPanel
                        key={assist}
                        mode={assist}
                        idea={prompt}
                        references={references}
                        onClose={() => setAssist(null)}
                        onApply={(text, reference) => {
                            onPromptChange(text);
                            if (reference) setReferences((value) => [...value, reference]);
                            setAssist(null);
                        }}
                    />
                </div>
            ) : null}
            <div
                className={cn("rounded-2xl border bg-card px-3 pb-2.5 pt-3 shadow-lg transition sm:px-4", dragging ? "border-(--skin-accent)" : "border-stone-200 dark:border-stone-700")}
                onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes("Files")) return;
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    if (!event.dataTransfer.files.length) return;
                    event.preventDefault();
                    setDragging(false);
                    onAddFiles(event.dataTransfer.files);
                }}
                data-testid="workbench-composer"
            >
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {references.map((item, index) => (
                        <div key={item.id} className="group relative size-14 shrink-0 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
                            <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} className="size-full object-cover" />
                            <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                            <ReferenceSizeBadge item={item} onOpen={() => onOpenReferenceTool(item)} />
                            <button
                                type="button"
                                className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 max-sm:opacity-100"
                                onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                aria-label={t("imageWorkbench.removeReference")}
                                data-testid="reference-remove"
                            >
                                <X className="size-3" />
                            </button>
                            {references.length > 1 ? (
                                <div className="absolute inset-x-0.5 bottom-0.5 flex justify-between opacity-0 transition group-hover:opacity-100">
                                    <button
                                        type="button"
                                        disabled={index === 0}
                                        className="flex size-4 items-center justify-center rounded-full bg-white/85 text-stone-700 disabled:invisible"
                                        onClick={() => setReferences((value) => moveItem(value, index, -1))}
                                        aria-label={t("studio.composer.moveLeft")}
                                    >
                                        <ArrowLeft className="size-2.5" />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={index === references.length - 1}
                                        className="flex size-4 items-center justify-center rounded-full bg-white/85 text-stone-700 disabled:invisible"
                                        onClick={() => setReferences((value) => moveItem(value, index, 1))}
                                        aria-label={t("studio.composer.moveRight")}
                                    >
                                        <ArrowRight className="size-2.5" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ))}
                    <button
                        type="button"
                        className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-stone-300 text-[10.5px] text-stone-500 transition hover:border-stone-400 hover:text-stone-800 dark:border-stone-700 dark:hover:text-stone-200"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="reference-add"
                    >
                        <ImagePlus className="size-4" />
                        {t("studio.composer.addReference")}
                    </button>
                    <span className="min-w-0 text-xs leading-snug text-stone-400">{references.length ? t("studio.composer.referenceHint") : t("studio.composer.referenceEmpty")}</span>
                </div>
                <Input.TextArea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    onPaste={(event) => {
                        const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                        if (!files.length) return;
                        event.preventDefault();
                        onAddFiles(files);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            onGenerate();
                        }
                    }}
                    variant="borderless"
                    autoSize={{ minRows: 2, maxRows: 8 }}
                    placeholder={references.length ? t("studio.composer.placeholderWithReference") : t("imageWorkbench.promptPlaceholder")}
                    className="!px-0.5 !text-[15px] !leading-relaxed"
                    data-testid="workbench-prompt"
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto max-sm:flex-wrap max-sm:overflow-visible">
                        <Popover content={ratioPanel} trigger="click" placement="topLeft">
                            <span>
                                <Chip>
                                    <RatioIcon ratio={ratio} />
                                    {sizeLabel}
                                    {ratio !== "auto" && scale !== "auto" ? <span className="text-stone-400">· {t(`studio.params.scalesShort.${scale}`)}</span> : null}
                                    <ChevronDown className="size-3 opacity-60" />
                                </Chip>
                            </span>
                        </Popover>
                        <Popover content={countPanel} trigger="click" placement="top">
                            <span>
                                <Chip>
                                    {t("studio.params.countValue", { count })}
                                    <ChevronDown className="size-3 opacity-60" />
                                </Chip>
                            </span>
                        </Popover>
                        <Popover content={advancedPanel} trigger="click" placement="top">
                            <span>
                                <Chip>
                                    <SlidersHorizontal className="size-3.5" />
                                    <span className="max-sm:hidden">{t("studio.params.all")}</span>
                                    {advancedChanged ? <span className="size-1.5 rounded-full bg-(--skin-accent)" /> : null}
                                </Chip>
                            </span>
                        </Popover>
                        <span className="mx-0.5 h-4 w-px shrink-0 bg-stone-200 dark:bg-stone-800" />
                        <Tooltip title={t("studio.assist.writeTip")}>
                            <span>
                                <Chip active={assist === "write"} onClick={() => setAssist(assist === "write" ? null : "write")}>
                                    <Wand2 className="size-3.5" />
                                    {t("studio.assist.write")}
                                </Chip>
                            </span>
                        </Tooltip>
                        <Tooltip title={t("studio.assist.describeTip")}>
                            <span>
                                <Chip active={assist === "describe"} onClick={() => setAssist(assist === "describe" ? null : "describe")}>
                                    <ScanText className="size-3.5" />
                                    {t("studio.assist.describe")}
                                </Chip>
                            </span>
                        </Tooltip>
                        <Tooltip title={t("studio.composer.library")}>
                            <span>
                                <Chip onClick={onOpenInspiration}>
                                    <BookOpen className="size-3.5" />
                                    <span className="max-md:hidden">{t("studio.composer.library")}</span>
                                </Chip>
                            </span>
                        </Tooltip>
                        <span className="lg:hidden">
                            <Chip onClick={onOpenLogs}>
                                <History className="size-3.5" />
                            </Chip>
                        </span>
                    </div>
                    {account ? (
                        <span className="hidden shrink-0 text-right text-[11.5px] leading-tight text-stone-400 md:block">
                            {t("studio.composer.balance", { balance: account.balance.toFixed(2) })}
                            <br />
                            {t("studio.composer.noChargeOnFail")}
                        </span>
                    ) : null}
                    <Button type="primary" size="large" className="!h-10 shrink-0 !rounded-xl" icon={<Sparkles className="size-4" />} loading={running} disabled={!prompt.trim()} onClick={onGenerate} data-testid="workbench-generate">
                        {running ? formatDuration(elapsedMs) : t("studio.composer.generate")}
                    </Button>
                </div>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    onAddFiles(event.target.files);
                    event.target.value = "";
                }}
            />
        </div>
    );
}

function moveItem<T>(items: T[], index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}
