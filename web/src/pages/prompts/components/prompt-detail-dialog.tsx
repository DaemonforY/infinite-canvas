import { BookmarkPlus, Copy, ExternalLink, FileText, Flame, FolderPlus, ImagePlus, Pencil, Star, Wand2 } from "lucide-react";
import { Alert, Button, Modal, Space } from "antd";
import { useTranslation } from "react-i18next";

import { PromptBadges } from "@/components/prompts/prompt-badges";
import { meaningfulDescription } from "@/lib/prompt-taxonomy";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";
import { useIsFavoritePrompt } from "@/stores/use-prompt-library-store";

export function PromptDetailDialog({
    prompt,
    onClose,
    onDraw,
    onCopy,
    onFavorite,
    onSaveAsset,
    onSaveMine,
}: {
    prompt: Prompt | null;
    onClose: () => void;
    onDraw?: (prompt: Prompt) => void;
    onCopy: (prompt: Prompt) => void;
    onFavorite?: (prompt: Prompt) => void;
    onSaveAsset?: (prompt: Prompt) => void;
    /** Own prompt: edit it; library prompt: save a copy to "我的" to tweak. */
    onSaveMine?: (prompt: Prompt) => void;
}) {
    const { i18n, t } = useTranslation();
    const favorite = useIsFavoritePrompt(prompt);
    const description = meaningfulDescription(prompt?.description);
    const video = prompt?.traits.scenes[0] === "video";

    return (
        <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={760} centered styles={{ body: { height: "calc(85vh - 55px)", overflow: "hidden" } }}>
            {prompt ? (
                <div className="flex h-full min-h-0 flex-col" data-testid="prompt-detail">
                    <div className="shrink-0 space-y-3 pb-4">
                        {prompt.coverUrl ? (
                            <img src={prompt.coverUrl} alt={prompt.title} className="h-48 w-full rounded-lg bg-stone-100 object-contain dark:bg-stone-900 sm:h-60" />
                        ) : (
                            <div className="grid h-48 w-full place-items-center rounded-lg bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600 sm:h-56">
                                <FileText className="size-9" />
                            </div>
                        )}
                        {prompt.referenceImageUrls.length > 1 ? (
                            <div className="grid grid-cols-6 gap-2">
                                {prompt.referenceImageUrls
                                    .filter((url) => url !== prompt.coverUrl)
                                    .slice(0, 6)
                                    .map((url) => (
                                        <img key={url} src={url} alt="" className="aspect-square w-full rounded-md object-cover" loading="lazy" />
                                    ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-y border-stone-200 py-4 pr-2 dark:border-stone-800">
                        <PromptBadges item={prompt} max={4} />
                        {prompt.curatedTags?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {prompt.curatedTags.map((tag) => (
                                    <span key={tag} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {prompt.traits.needsReference ? <Alert className="mt-3" type="info" showIcon icon={<ImagePlus className="size-4" />} message={t("prompts.needsReferenceHint")} /> : null}
                        {description ? <p className="mt-4 text-sm leading-6 text-stone-500 dark:text-stone-400">{description}</p> : null}
                        {prompt.preview ? <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{prompt.preview}</pre> : null}
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                            {prompt.useCount ? (
                                <span className="inline-flex items-center gap-0.5">
                                    <Flame className="size-3" />
                                    {t("prompts.useCount", { count: prompt.useCount })}
                                </span>
                            ) : null}
                            {prompt.author ? <span>{t("prompts.author", { author: prompt.author })}</span> : null}
                            <span>{t("prompts.sourceLabel", { source: prompt.category })}</span>
                            {prompt.updatedAt || prompt.createdAt ? <span>{t("common.updated", { date: formatPromptDate(prompt.updatedAt || prompt.createdAt, i18n.resolvedLanguage) })}</span> : null}
                            {prompt.githubUrl ? (
                                <a href={prompt.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-stone-800 dark:hover:text-stone-200">
                                    {t("prompts.viewSource")}
                                    <ExternalLink className="size-3" />
                                </a>
                            ) : null}
                        </div>
                    </div>
                    <div className="shrink-0 pt-4">
                        <Space wrap>
                            {onDraw ? (
                                <Button type="primary" icon={<Wand2 className="size-4" />} onClick={() => onDraw(prompt)} data-testid="prompt-detail-draw">
                                    {video ? t("prompts.useToVideo") : t("prompts.useToDraw")}
                                </Button>
                            ) : null}
                            <Button icon={<Copy className="size-4" />} onClick={() => onCopy(prompt)}>
                                {t("common.copyPrompt")}
                            </Button>
                            {onFavorite ? (
                                <Button icon={<Star className={favorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />} onClick={() => onFavorite(prompt)}>
                                    {favorite ? t("prompts.unfavorite") : t("prompts.favorite")}
                                </Button>
                            ) : null}
                            {onSaveMine ? (
                                <Button icon={prompt.mine ? <Pencil className="size-4" /> : <BookmarkPlus className="size-4" />} onClick={() => onSaveMine(prompt)} data-testid="prompt-detail-save-mine">
                                    {prompt.mine ? t("myPrompts.edit") : t("myPrompts.saveCopy")}
                                </Button>
                            ) : null}
                            {onSaveAsset && !prompt.mine ? (
                                <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                    {t("common.addToAssets")}
                                </Button>
                            ) : null}
                        </Space>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
