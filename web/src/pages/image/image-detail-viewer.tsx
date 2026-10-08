import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "antd";
import { BookmarkPlus, Brush, ChevronLeft, ChevronRight, Copy, Crown, Download, Expand, FolderPlus, Palette, PenLine, RotateCcw, Scissors, Send, Sparkles, Trophy, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatBytes } from "@/lib/image-utils";
import { WATERMARK_TEXT } from "@/lib/watermark";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import type { GeneratedImage } from "./generation-log";
import { isWeChatBrowser, membershipLink } from "./use-save-image";
import type { FeedBatch } from "./workbench-feed";

export type DetailActions = {
    onSay: (image: GeneratedImage) => void;
    onMask: (image: GeneratedImage) => void;
    onOutpaint: (image: GeneratedImage) => void;
    onUpscale: (image: GeneratedImage) => void;
    onRemoveBg: (image: GeneratedImage) => void;
    onRerun: (batch: FeedBatch) => void;
    onCopyPrompt: (batch: FeedBatch) => void;
    onSaveMine: (image: GeneratedImage, batch: FeedBatch) => void;
    onSave: (image: GeneratedImage, name: string) => void;
    onSaveAsset: (image: GeneratedImage, batch: FeedBatch) => void;
    onPublish: (image: GeneratedImage, batch: FeedBatch) => void;
    onContest: (image: GeneratedImage, batch: FeedBatch) => void;
    onOpenEditor: (image: GeneratedImage) => void;
};

function BigAction({ icon, label, onClick, testId }: { icon: ReactNode; label: string; onClick: () => void; testId?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-stone-200 text-xs text-stone-800 transition hover:border-(--skin-accent) hover:bg-(--skin-accent)/10 dark:border-stone-700 dark:text-stone-100 [&_svg]:text-(--skin-accent)"
        >
            {icon}
            {label}
        </button>
    );
}

function ListAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-1.5 text-left text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-50"
        >
            {icon}
            {label}
        </button>
    );
}

export function ImageDetailViewer({ batch, index, onIndexChange, onClose, watermark, actions }: { batch: FeedBatch; index: number; onIndexChange: (index: number) => void; onClose: () => void; watermark: boolean; actions: DetailActions }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const images = batch.cells.filter((cell) => cell.status === "success" && cell.image).map((cell) => cell.image as GeneratedImage);
    const image = images[Math.min(index, images.length - 1)];
    const wechat = isWeChatBrowser();

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
            if (event.key === "ArrowRight" && index < images.length - 1) onIndexChange(index + 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [images.length, index, onClose, onIndexChange]);

    if (!image) return null;
    const run = (fn: () => void) => () => {
        fn();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-stone-950/95 lg:flex-row" role="dialog" aria-modal="true" data-testid="image-detail">
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 pb-20 max-lg:min-h-[52vh] lg:p-10 lg:pb-24" onClick={onClose}>
                <div className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
                    <img src={image.dataUrl || previewUrlFor(image.storageKey)} alt="" className="max-h-[calc(100vh-11rem)] max-w-full rounded-lg object-contain max-lg:max-h-[46vh]" />
                    {watermark ? <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded bg-black/30 px-2 py-0.5 text-xs font-medium text-white/95">{WATERMARK_TEXT}</span> : null}
                </div>
                {index > 0 ? (
                    <button
                        type="button"
                        className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                        onClick={(event) => (event.stopPropagation(), onIndexChange(index - 1))}
                        aria-label={t("studio.detail.prev")}
                    >
                        <ChevronLeft className="size-5" />
                    </button>
                ) : null}
                {index < images.length - 1 ? (
                    <button
                        type="button"
                        className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                        onClick={(event) => (event.stopPropagation(), onIndexChange(index + 1))}
                        aria-label={t("studio.detail.next")}
                    >
                        <ChevronRight className="size-5" />
                    </button>
                ) : null}
                {images.length > 1 ? (
                    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2" onClick={(event) => event.stopPropagation()}>
                        {images.map((item, itemIndex) => (
                            <button key={item.id} type="button" onClick={() => onIndexChange(itemIndex)} className={`size-12 overflow-hidden rounded-md transition ${itemIndex === index ? "ring-2 ring-(--skin-accent)" : "opacity-50 hover:opacity-80"}`}>
                                <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt="" className="size-full object-cover" />
                            </button>
                        ))}
                    </div>
                ) : null}
                <button type="button" className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 lg:hidden" onClick={onClose} aria-label={t("common.cancel")}>
                    <X className="size-5" />
                </button>
            </div>

            <aside className="flex max-h-[48vh] w-full shrink-0 flex-col gap-4 overflow-y-auto bg-card p-4 text-stone-900 dark:text-stone-100 lg:max-h-none lg:w-[380px] lg:p-5">
                <div className="order-first flex items-center gap-2">
                    <span className="font-medium">{t("studio.detail.position", { index: index + 1, total: images.length })}</span>
                    <span className="text-xs text-stone-400">
                        {image.width}×{image.height} · {formatBytes(image.bytes)}
                    </span>
                    <button type="button" className="ml-auto hidden size-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 lg:flex" onClick={onClose} aria-label={t("common.cancel")}>
                        <X className="size-4" />
                    </button>
                </div>

                {/* Saving is what most people came for: first on phones, above the list on desktop. */}
                <div className="max-lg:order-1 lg:order-4">
                    <Button type="primary" block size="large" className="!rounded-xl" icon={<Download className="size-4" />} onClick={() => actions.onSave(image, `image-${index + 1}`)} data-testid="detail-save">
                        {wechat ? t("studio.save.toAlbum") : watermark ? t("studio.save.downloadMarked") : t("studio.save.downloadOriginal")}
                    </Button>
                </div>

                <div className="order-2">
                    <div className="mb-2 text-xs text-stone-500">{t("studio.detail.continue")}</div>
                    <div className="grid grid-cols-3 gap-1.5">
                        <BigAction icon={<PenLine className="size-[18px]" />} label={t("studio.detail.say")} onClick={run(() => actions.onSay(image))} testId="detail-say" />
                        <BigAction icon={<Brush className="size-[18px]" />} label={t("studio.detail.mask")} onClick={run(() => actions.onMask(image))} testId="detail-mask" />
                        <BigAction icon={<Expand className="size-[18px]" />} label={t("studio.detail.outpaint")} onClick={run(() => actions.onOutpaint(image))} />
                        <BigAction icon={<Sparkles className="size-[18px]" />} label={t("studio.detail.upscale")} onClick={run(() => actions.onUpscale(image))} />
                        <BigAction icon={<Scissors className="size-[18px]" />} label={t("studio.detail.removeBg")} onClick={run(() => actions.onRemoveBg(image))} />
                        <BigAction icon={<RotateCcw className="size-[18px]" />} label={t("studio.detail.rerun")} onClick={run(() => actions.onRerun(batch))} />
                    </div>
                </div>

                <div className="order-3">
                    <div className="mb-2 text-xs text-stone-500">{t("workbench.prompt")}</div>
                    <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-100 px-3 py-2.5 text-[13px] leading-relaxed dark:bg-stone-900">{batch.prompt}</div>
                    <div className="mt-2 flex gap-1.5">
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => actions.onCopyPrompt(batch)}>
                            {t("common.copy")}
                        </Button>
                        <Button size="small" icon={<BookmarkPlus className="size-3.5" />} onClick={() => actions.onSaveMine(image, batch)}>
                            {t("myPrompts.saveShort")}
                        </Button>
                    </div>
                </div>

                {watermark ? (
                    <div
                        className="order-3 flex items-center gap-3 rounded-xl border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-stone-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-stone-300"
                        data-testid="watermark-notice"
                    >
                        <span>
                            {t("studio.watermark.notice", { mark: WATERMARK_TEXT })}
                            <br />
                            <span className="text-stone-400">{t("studio.watermark.memberHint")}</span>
                        </span>
                        <a
                            href={membershipLink("detail")}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-400/60 px-2.5 py-1.5 font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/10"
                        >
                            <Crown className="size-3.5" />
                            {t("studio.watermark.remove")}
                        </a>
                    </div>
                ) : null}

                <div className="order-5 -mt-2">
                    <ListAction icon={<FolderPlus className="size-4" />} label={t("common.addToAssets")} onClick={() => actions.onSaveAsset(image, batch)} />
                    <ListAction icon={<Send className="size-4" />} label={t("studio.detail.publish")} onClick={() => actions.onPublish(image, batch)} />
                    <ListAction icon={<Trophy className="size-4" />} label={t("contestSubmit.action")} onClick={() => actions.onContest(image, batch)} />
                    <ListAction icon={<Palette className="size-4" />} label={t("studio.detail.editor")} onClick={() => actions.onOpenEditor(image)} />
                </div>
            </aside>
        </div>
    );
}
