import { type UIEvent, useEffect, useState } from "react";
import { App, Empty, Modal, Spin } from "antd";
import { useTranslation } from "react-i18next";

import { promptKey, type Prompt } from "@/services/api/prompts";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import { PromptCard } from "./prompt-card";
import { PromptFilters } from "./prompt-filters";
import { initialPromptBrowserState, usePromptList, type PromptBrowserState } from "./use-prompt-list";

/** Library picker used by the image / video workbenches and canvas nodes. Picking fills the prompt. */
export function PromptSelectDialog({ open, onOpenChange, onSelect, kind = "image" }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void; kind?: "image" | "video" }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [state, setState] = useState<PromptBrowserState>(() => initialPromptBrowserState(kind === "video" ? { scene: "video" } : undefined));
    const list = usePromptList(state, open);
    const { query } = list;
    const favorites = usePromptLibraryStore((s) => s.favorites);
    const toggleFavorite = usePromptLibraryStore((s) => s.toggleFavorite);
    const markUsed = usePromptLibraryStore((s) => s.markUsed);
    const favoriteKeys = new Set(favorites.map(promptKey));

    const selectPrompt = (item: Prompt) => {
        markUsed(item);
        onSelect(item.prompt);
        onOpenChange(false);
        if (item.traits.needsReference) message.info(t("prompts.needsReferenceHint"), 5);
    };

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (list.remote && query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <Modal title={t("prompts.library")} open={open} onCancel={() => onOpenChange(false)} footer={null} width={960} centered>
            <div className="flex h-[66dvh] min-h-0 flex-col gap-3" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <PromptFilters compact state={state} onChange={(patch) => setState((current) => ({ ...current, ...patch }))} sources={list.sources} sceneCounts={list.sceneCounts} favoriteCount={list.favoriteCount} recentCount={list.recentCount} />
                <p className="text-xs text-stone-500 dark:text-stone-400">{t("prompts.pickHint")}</p>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                    {list.remote && query.isLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {list.items.map((item) => (
                            <PromptCard key={promptKey(item)} item={item} compact favorite={favoriteKeys.has(promptKey(item))} onOpen={() => selectPrompt(item)} onFavorite={() => toggleFavorite(item)} />
                        ))}
                    </div>
                    {!(list.remote && query.isLoading) && list.items.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={state.tab === "favorites" && !list.favoriteCount ? t("prompts.emptyFavorites") : t("prompts.empty")} className="py-8" />
                    ) : null}
                    {query.isFetchingNextPage ? (
                        <div className="py-4 text-center">
                            <Spin size="small" />
                        </div>
                    ) : null}
                </div>
            </div>
        </Modal>
    );
}
