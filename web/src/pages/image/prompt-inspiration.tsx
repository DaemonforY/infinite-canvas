import { useMemo, useState } from "react";
import { Button, Empty, Spin } from "antd";
import { useTranslation } from "react-i18next";

import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptActions } from "@/components/prompts/use-prompt-actions";
import { initialPromptBrowserState, usePromptList, type PromptBrowserState } from "@/components/prompts/use-prompt-list";
import { ALL_PROMPTS_OPTION, promptKey, type Prompt } from "@/services/api/prompts";
import type { PromptScene } from "@/lib/prompt-taxonomy";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import { cn } from "@/lib/utils";

// The workbench's inspiration wall is the prompt library: pick an effect, 「用这个画」 fills the composer.

type InspirationTab = "forYou" | "popular" | "featured" | "favorites" | "recent";

const TABS: InspirationTab[] = ["forYou", "popular", "featured", "favorites", "recent"];
const SCENES: PromptScene[] = ["poster", "ecommerce", "social", "portrait", "photo", "illustration", "3d", "brand", "infographic", "creative"];

const SCENE_OPTIONS: (PromptScene | typeof ALL_PROMPTS_OPTION)[] = [ALL_PROMPTS_OPTION, ...SCENES];

function browserState(tab: InspirationTab, scene: PromptScene | typeof ALL_PROMPTS_OPTION): PromptBrowserState {
    if (tab === "popular") return initialPromptBrowserState({ tab: "all", sort: "popular", scene });
    if (tab === "featured") return initialPromptBrowserState({ tab: "all", sort: "recommended", scene });
    return initialPromptBrowserState({ tab, scene });
}

export function PromptInspiration({ onDraw, className }: { onDraw: (item: Prompt) => void; className?: string }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<InspirationTab>("forYou");
    const [scene, setScene] = useState<PromptScene | typeof ALL_PROMPTS_OPTION>(ALL_PROMPTS_OPTION);
    const list = usePromptList(browserState(tab, scene), true, "image");
    const actions = usePromptActions();
    const favorites = usePromptLibraryStore((state) => state.favorites);
    const favoriteKeys = useMemo(() => new Set(favorites.map(promptKey)), [favorites]);
    const items = useMemo(() => list.items.filter((item) => item.traits.scenes[0] !== "video"), [list.items]);

    return (
        <div className={className}>
            <div className="flex flex-wrap justify-center gap-1" role="tablist">
                {TABS.map((value) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={tab === value}
                        className={cn("h-8 rounded-lg px-3 text-sm transition", tab === value ? "bg-stone-200 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-50" : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-200")}
                        onClick={() => setTab(value)}
                    >
                        {t(`studio.inspiration.tabs.${value}`)}
                    </button>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {SCENE_OPTIONS.map((value) => (
                    <button
                        key={value}
                        type="button"
                        className={cn(
                            "h-7 rounded-full border px-3 text-xs transition",
                            scene === value ? "border-(--skin-accent) bg-(--skin-accent)/10 text-stone-900 dark:text-stone-100" : "border-stone-200 text-stone-500 hover:text-stone-900 dark:border-stone-800 dark:hover:text-stone-200",
                        )}
                        onClick={() => setScene(value)}
                    >
                        {value === ALL_PROMPTS_OPTION ? t("common.all") : t(`prompts.scenes.${value}`)}
                    </button>
                ))}
            </div>
            {tab === "featured" ? <p className="mt-3 text-center text-xs text-stone-400">{t("studio.inspiration.featuredHint")}</p> : null}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {items.map((item) => (
                    <PromptCard key={promptKey(item)} item={item} compact favorite={favoriteKeys.has(promptKey(item))} onOpen={() => onDraw(item)} onFavorite={() => actions.toggleFavorite(item)} />
                ))}
            </div>
            {list.loading ? (
                <div className="flex justify-center py-10">
                    <Spin />
                </div>
            ) : !items.length ? (
                <Empty className="py-10" image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === "favorites" ? t("prompts.emptyFavorites") : tab === "recent" ? t("prompts.emptyRecent") : t("prompts.empty")} />
            ) : list.active?.hasNextPage ? (
                <div className="mt-4 flex justify-center">
                    <Button loading={list.active.isFetchingNextPage} onClick={() => void list.active?.fetchNextPage()}>
                        {t("studio.inspiration.more")}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
