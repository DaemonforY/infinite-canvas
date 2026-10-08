import { useSyncExternalStore } from "react";
import { Button, Tooltip } from "antd";
import { AlertCircle, Copy, Download, LoaderCircle, Maximize2, PenLine, RefreshCw, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/lib/image-utils";
import { inferMediaRatio, inferMediaScale, parseAspectRatio } from "@/lib/media-size";
import { WATERMARK_TEXT } from "@/lib/watermark";
import { cn } from "@/lib/utils";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { modelOptionName } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { GeneratedImage, GenerationLog, GenerationResult } from "./generation-log";

/** One round in the feed: a saved log, or the batch that is generating right now. */
export type FeedBatch = {
    id: string;
    prompt: string;
    label?: string;
    references: ReferenceImage[];
    size: string;
    quality: string;
    model: string;
    time: string;
    cells: GenerationResult[];
    log?: GenerationLog;
    running?: boolean;
    elapsedMs?: number;
};

export type FeedHandlers = {
    onOpenImage: (batch: FeedBatch, imageIndex: number) => void;
    onEditImage: (image: GeneratedImage) => void;
    onSaveImage: (image: GeneratedImage, name: string) => void;
    onRetry: (batch: FeedBatch, cellIndex: number) => void;
    onReuse: (batch: FeedBatch) => void;
    onRerun: (batch: FeedBatch) => void;
    onCopy: (batch: FeedBatch) => void;
};

function cellAspect(batch: FeedBatch, image?: GeneratedImage) {
    if (image?.width && image.height) return `${image.width} / ${image.height}`;
    const ratio = parseAspectRatio(inferMediaRatio(batch.size, "1:1"));
    return ratio ? `${ratio.width} / ${ratio.height}` : "1 / 1";
}

export function FeedBatchView({ batch, watermark, handlers }: { batch: FeedBatch; watermark: boolean; handlers: FeedHandlers }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const successImages = batch.cells.filter((cell) => cell.status === "success" && cell.image).map((cell) => cell.image as GeneratedImage);
    const failed = batch.cells.filter((cell) => cell.status === "failed").length;
    const ratio = inferMediaRatio(batch.size, "1:1");
    const scale = inferMediaScale(batch.size);
    const sizeTag = ratio === "auto" ? t("settingsPanels.common.auto") : scale === "auto" ? ratio : `${ratio} · ${t(`studio.params.scalesShort.${scale}`)}`;
    const tags = [sizeTag, t("studio.params.countValue", { count: batch.cells.length }), modelOptionName(batch.model), batch.time.replace(/:\d{2}$/, "")].filter(Boolean);

    return (
        <section className="mx-auto w-full max-w-[920px]" id={`batch-${batch.id}`} data-testid="feed-batch">
            <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                    {batch.references.length ? (
                        <div className="mb-1.5 flex items-center gap-1.5">
                            {batch.references.slice(0, 6).map((ref) => (
                                <img key={ref.id} src={previewUrlFor(ref.storageKey) || ref.dataUrl} alt="" className="size-7 rounded-md object-cover" />
                            ))}
                            <span className="text-xs text-stone-400">{t("studio.feed.references", { count: batch.references.length })}</span>
                        </div>
                    ) : null}
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-900 dark:text-stone-100" title={batch.prompt}>
                        {batch.label || batch.prompt}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {tags.map((tag) => (
                            <span key={tag} className="rounded-md border border-stone-200 px-1.5 text-[11px] leading-5 text-stone-500 dark:border-stone-800">
                                {tag}
                            </span>
                        ))}
                        {failed && !batch.running ? <span className="rounded-md border border-red-200 px-1.5 text-[11px] leading-5 text-red-500 dark:border-red-900">{t("studio.feed.failedCount", { count: failed })}</span> : null}
                        {batch.running ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-(--skin-accent)/10 px-1.5 text-[11px] leading-5 text-stone-700 dark:text-stone-200">
                                <LoaderCircle className="size-3 animate-spin" />
                                {t("studio.feed.running", { time: formatDuration(batch.elapsedMs || 0) })}
                            </span>
                        ) : null}
                    </div>
                </div>
                {!batch.running ? (
                    <div className="flex shrink-0 gap-0.5">
                        <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => handlers.onCopy(batch)}>
                            <span className="max-sm:hidden">{t("studio.feed.copy")}</span>
                        </Button>
                        <Button size="small" type="text" icon={<PenLine className="size-3.5" />} onClick={() => handlers.onReuse(batch)} data-testid="batch-reuse">
                            {t("studio.feed.reuse")}
                        </Button>
                        <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} onClick={() => handlers.onRerun(batch)} data-testid="batch-rerun">
                            {t("studio.feed.rerun")}
                        </Button>
                    </div>
                ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
                {batch.cells.map((cell, index) => {
                    const aspect = { aspectRatio: cellAspect(batch, cell.image) };
                    if (cell.status === "pending")
                        return (
                            <div
                                key={cell.id}
                                style={aspect}
                                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-stone-200 bg-[linear-gradient(110deg,transparent_30%,rgba(120,113,108,0.12)_50%,transparent_70%)] bg-[length:200%_100%] text-xs text-stone-500 animate-[shimmer_1.6s_linear_infinite] dark:border-stone-800"
                            >
                                <LoaderCircle className="size-5 animate-spin" />
                                {t("workbench.generating")}
                            </div>
                        );
                    if (cell.status === "failed")
                        return (
                            <div
                                key={cell.id}
                                style={aspect}
                                className="flex min-h-40 flex-col gap-2 overflow-hidden rounded-xl border border-red-200 bg-red-50/60 p-3 text-xs leading-relaxed text-stone-600 dark:border-red-950 dark:bg-red-950/20 dark:text-stone-300"
                                data-testid="feed-failed"
                            >
                                <span className="flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                                    <AlertCircle className="size-3.5" />
                                    {t("workbench.failed")}
                                </span>
                                <span className="line-clamp-5">{cell.error || t("studio.feed.errorUnknown")}</span>
                                <Button size="small" className="mt-auto self-start" icon={<RefreshCw className="size-3" />} onClick={() => handlers.onRetry(batch, index)}>
                                    {t("workbench.retry")}
                                </Button>
                            </div>
                        );
                    const image = cell.image as GeneratedImage;
                    const imageIndex = successImages.indexOf(image);
                    return (
                        <div key={cell.id} style={aspect} className="group relative cursor-zoom-in overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-900" onClick={() => handlers.onOpenImage(batch, imageIndex)} data-testid="feed-image">
                            <img src={previewUrlFor(image.storageKey) || image.dataUrl} alt={t("imageWorkbench.resultAlt", { count: index + 1 })} className="size-full object-cover" loading="lazy" />
                            {watermark ? <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/30 px-1.5 py-px text-[10px] font-medium text-white/95">{WATERMARK_TEXT}</span> : null}
                            <div className={cn("absolute inset-x-0 bottom-0 flex items-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 pt-10 opacity-0 transition group-hover:opacity-100", "max-sm:hidden")}>
                                <button
                                    type="button"
                                    className="flex h-7 items-center gap-1 rounded-md bg-black/70 px-2 text-xs text-white backdrop-blur hover:bg-black/85"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handlers.onEditImage(image);
                                    }}
                                    data-testid="feed-edit-image"
                                >
                                    <PenLine className="size-3.5" />
                                    {t("studio.feed.editThis")}
                                </button>
                                <Tooltip title={t("studio.save.download")}>
                                    <button
                                        type="button"
                                        className="ml-auto flex size-7 items-center justify-center rounded-md bg-black/70 text-white backdrop-blur hover:bg-black/85"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handlers.onSaveImage(image, `image-${index + 1}`);
                                        }}
                                        aria-label={t("studio.save.download")}
                                    >
                                        <Download className="size-3.5" />
                                    </button>
                                </Tooltip>
                                <span className="flex size-7 items-center justify-center rounded-md bg-black/70 text-white">
                                    <Maximize2 className="size-3.5" />
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
