import { type UIEvent, useEffect, useState } from "react";
import { App, Button, Empty, Spin } from "antd";
import { useTranslation } from "react-i18next";

import { AccountSyncBadge } from "@/components/layout/account-sync-badge";
import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptFilters } from "@/components/prompts/prompt-filters";
import { usePromptActions } from "@/components/prompts/use-prompt-actions";
import { initialPromptBrowserState, usePromptList, type PromptBrowserState } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { promptKey, type Prompt } from "@/services/api/prompts";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";

export default function PromptsPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [state, setState] = useState<PromptBrowserState>(() => initialPromptBrowserState());
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const favorites = usePromptLibraryStore((s) => s.favorites);
    const clearRecent = usePromptLibraryStore((s) => s.clearRecent);
    const actions = usePromptActions();
    const list = usePromptList(state);
    const { query } = list;
    const favoriteKeys = new Set(favorites.map(promptKey));

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const update = (patch: Partial<PromptBrowserState>) => setState((current) => ({ ...current, ...patch }));
    const filtered = state.keyword.trim() !== "" || state.scene !== "all" || state.model !== "all" || state.source !== "all";

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (list.remote && query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 240) void query.fetchNextPage();
    };

    const emptyText = state.tab === "favorites" && !list.favoriteCount ? t("prompts.emptyFavorites") : state.tab === "recent" && !list.recentCount ? t("prompts.emptyRecent") : t("prompts.empty");

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:py-8" onScroll={handleListScroll}>
                <div className="mx-auto max-w-7xl">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">{t("prompts.title")}</h1>
                            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("prompts.subtitle")}</p>
                            <AccountSyncBadge className="mt-1.5" />
                        </div>
                        <div className="text-sm text-stone-500 dark:text-stone-400" data-testid="prompt-total">
                            {t("prompts.total", { count: list.total })}
                            {state.tab === "recent" && list.recentCount ? (
                                <Button type="link" size="small" onClick={clearRecent}>
                                    {t("prompts.clearRecent")}
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <div className="-mx-4 mt-5 bg-background/95 px-4 pb-3 pt-1 backdrop-blur sm:sticky sm:top-0 sm:z-10 sm:-mx-6 sm:px-6">
                        <PromptFilters state={state} onChange={update} sources={list.sources} sceneCounts={list.sceneCounts} favoriteCount={list.favoriteCount} recentCount={list.recentCount} />
                    </div>

                    {list.remote && query.isLoading ? (
                        <div className="flex h-60 items-center justify-center">
                            <Spin />
                        </div>
                    ) : (
                        <div className="mt-3">
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="prompt-grid">
                                {list.items.map((item) => (
                                    <PromptCard
                                        key={promptKey(item)}
                                        item={item}
                                        favorite={favoriteKeys.has(promptKey(item))}
                                        onOpen={() => setSelectedPrompt(item)}
                                        onDraw={() => actions.draw(item)}
                                        onCopy={() => actions.copy(item)}
                                        onFavorite={() => actions.toggleFavorite(item)}
                                        onSaveAsset={() => actions.saveAsset(item)}
                                    />
                                ))}
                            </div>
                            {list.items.length === 0 ? (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} className="py-16">
                                    {filtered ? <Button onClick={() => setState((current) => initialPromptBrowserState({ tab: current.tab }))}>{t("prompts.resetFilters")}</Button> : null}
                                </Empty>
                            ) : null}
                        </div>
                    )}
                    {list.remote ? (
                        <div className="mt-6 text-center text-xs text-stone-500 dark:text-stone-400">{query.isFetchingNextPage ? t("prompts.loading") : query.hasNextPage ? t("prompts.loadMore") : list.items.length > 0 ? t("prompts.end") : null}</div>
                    ) : null}
                </div>
            </main>

            <PromptDetailDialog
                prompt={selectedPrompt}
                onClose={() => setSelectedPrompt(null)}
                onDraw={(item) => {
                    setSelectedPrompt(null);
                    actions.draw(item);
                }}
                onCopy={actions.copy}
                onFavorite={actions.toggleFavorite}
                onSaveAsset={actions.saveAsset}
            />
        </div>
    );
}
