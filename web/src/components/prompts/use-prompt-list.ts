import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { ALL_PROMPTS_OPTION, fetchPrompts, filterPromptList, type PromptModelFilter, type PromptSort } from "@/services/api/prompts";
import type { PromptScene } from "@/lib/prompt-taxonomy";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";

export const PROMPT_PAGE_SIZE = 24;

export type PromptTab = "all" | "favorites" | "recent";

export type PromptBrowserState = {
    tab: PromptTab;
    keyword: string;
    scene: PromptScene | typeof ALL_PROMPTS_OPTION;
    model: PromptModelFilter;
    sort: PromptSort;
    source: string;
};

export const initialPromptBrowserState = (overrides?: Partial<PromptBrowserState>): PromptBrowserState => ({
    tab: "all",
    keyword: "",
    scene: ALL_PROMPTS_OPTION,
    model: ALL_PROMPTS_OPTION,
    sort: "recommended",
    source: ALL_PROMPTS_OPTION,
    ...overrides,
});

/** Library list for the prompts page and the picker dialog: remote sources, favorites or recents. */
export function usePromptList(state: PromptBrowserState, enabled = true) {
    const [debouncedKeyword, setDebouncedKeyword] = useState(state.keyword);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(state.keyword), 300);
        return () => clearTimeout(timer);
    }, [state.keyword]);

    const favorites = usePromptLibraryStore((s) => s.favorites);
    const recent = usePromptLibraryStore((s) => s.recent);
    const remote = state.tab === "all";

    const query = useInfiniteQuery({
        queryKey: ["prompts", debouncedKeyword, state.scene, state.model, state.sort, state.source],
        queryFn: ({ pageParam }) => fetchPrompts({ keyword: debouncedKeyword, scene: state.scene, model: state.model, sort: state.sort, category: state.source, page: pageParam, pageSize: PROMPT_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
        enabled: enabled && remote,
    });
    const firstPage = query.data?.pages[0];

    const remoteItems = useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data?.pages]);
    const localItems = useMemo(
        () => (remote ? [] : filterPromptList(state.tab === "favorites" ? favorites : recent, { keyword: debouncedKeyword, scene: state.scene, model: state.model })),
        [remote, state.tab, state.scene, state.model, favorites, recent, debouncedKeyword],
    );

    return {
        query,
        remote,
        items: remote ? remoteItems : localItems,
        total: remote ? firstPage?.total || 0 : localItems.length,
        sources: firstPage?.categories || [],
        sceneCounts: firstPage?.sceneCounts || {},
        favoriteCount: favorites.length,
        recentCount: recent.length,
    };
}
