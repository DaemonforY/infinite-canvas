import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { ALL_PROMPTS_OPTION, fetchPrompts, filterPromptList, promptKey, serverPromptToPrompt, type Prompt, type PromptModelFilter, type PromptSort } from "@/services/api/prompts";
import { fetchRecommendations, listMyPrompts } from "@/services/api/main-site-prompts";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { interleave, localTasteScenes } from "@/lib/prompt-recommend";
import type { PromptScene } from "@/lib/prompt-taxonomy";
import { useConfigStore } from "@/stores/use-config-store";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";

export const PROMPT_PAGE_SIZE = 24;
const FOR_YOU_LIMIT = 48;
const MINE_PAGE_SIZE = 60;

export type PromptTab = "all" | "forYou" | "mine" | "favorites" | "recent";

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
    sort: "popular",
    source: ALL_PROMPTS_OPTION,
    ...overrides,
});

export const MY_PROMPTS_QUERY_KEY = "my-prompts";
export const FOR_YOU_QUERY_KEY = "prompt-for-you";

export type ForYouResult = { items: Prompt[]; basis: "history" | "popular"; scenes: PromptScene[] };

/** "For you": the main site's profile when an account is connected, else the local recents / favorites. */
async function fetchForYou(apiKey: string, kind: "image" | "video", recent: Prompt[], favorites: Prompt[]): Promise<ForYouResult> {
    if (apiKey) {
        try {
            const res = await fetchRecommendations(apiKey, kind, FOR_YOU_LIMIT);
            return { items: res.items.map(serverPromptToPrompt), basis: res.basis, scenes: res.scenes.map((s) => s.scene as PromptScene) };
        } catch (error) {
            console.warn("[prompts] recommendations unavailable, using local history", error);
        }
    }
    const used = new Set([...recent, ...favorites].map(promptKey));
    const scenes = localTasteScenes(recent, favorites);
    if (!scenes.length) {
        const popular = await fetchPrompts({ sort: "popular", pageSize: FOR_YOU_LIMIT, scene: kind === "video" ? "video" : ALL_PROMPTS_OPTION });
        return { items: popular.items, basis: "popular", scenes: [] };
    }
    const lists = await Promise.all(scenes.map((scene) => fetchPrompts({ scene, sort: "popular", pageSize: FOR_YOU_LIMIT }).then((res) => res.items.filter((item) => !used.has(promptKey(item))))));
    return { items: interleave(lists, promptKey, FOR_YOU_LIMIT), basis: "history", scenes };
}

/** Library list for the prompts page and the picker dialog: the catalog, for-you, mine, favorites or recents. */
export function usePromptList(state: PromptBrowserState, enabled = true, kind: "image" | "video" = "image") {
    const [debouncedKeyword, setDebouncedKeyword] = useState(state.keyword);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(state.keyword), 300);
        return () => clearTimeout(timer);
    }, [state.keyword]);

    const favorites = usePromptLibraryStore((s) => s.favorites);
    const recent = usePromptLibraryStore((s) => s.recent);
    const config = useConfigStore((s) => s.config);
    const apiKey = useMemo(() => findMainSiteApiKey(config), [config]);
    const remote = state.tab === "all";

    const query = useInfiniteQuery({
        queryKey: ["prompts", debouncedKeyword, state.scene, state.model, state.sort, state.source],
        queryFn: ({ pageParam }) => fetchPrompts({ keyword: debouncedKeyword, scene: state.scene, model: state.model, sort: state.sort, category: state.source, page: pageParam, pageSize: PROMPT_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
        enabled: enabled && remote,
    });
    const firstPage = query.data?.pages[0];

    // The profile only needs to be rebuilt when the history changes, not on every keystroke.
    const historyKey = useMemo(() => [...recent.slice(0, 10), ...favorites.slice(0, 10)].map(promptKey).join("|"), [recent, favorites]);
    const forYou = useQuery({
        queryKey: [FOR_YOU_QUERY_KEY, apiKey, kind, apiKey ? "" : historyKey],
        queryFn: () => fetchForYou(apiKey, kind, recent, favorites),
        enabled: enabled && state.tab === "forYou",
        staleTime: 5 * 60 * 1000,
    });

    const mine = useInfiniteQuery({
        queryKey: [MY_PROMPTS_QUERY_KEY, apiKey],
        queryFn: ({ pageParam }) => listMyPrompts(apiKey, { page: pageParam, page_size: MINE_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
        enabled: enabled && Boolean(apiKey) && state.tab === "mine",
    });
    const mineItems = useMemo(() => mine.data?.pages.flatMap((page) => page.items.map(serverPromptToPrompt)) || [], [mine.data?.pages]);

    const remoteItems = useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data?.pages]);
    const localItems = useMemo(() => {
        if (remote) return [];
        const source = state.tab === "favorites" ? favorites : state.tab === "recent" ? recent : state.tab === "mine" ? mineItems : forYou.data?.items || [];
        return filterPromptList(source, { keyword: debouncedKeyword, scene: state.scene, model: state.model });
    }, [remote, state.tab, state.scene, state.model, favorites, recent, mineItems, forYou.data?.items, debouncedKeyword]);

    const active = remote ? query : state.tab === "mine" ? mine : null;
    return {
        query,
        /** The query backing the visible list (infinite scroll), if any. */
        active,
        remote,
        apiKey,
        items: remote ? remoteItems : localItems,
        total: remote ? firstPage?.total || 0 : localItems.length,
        loading: remote ? query.isLoading : state.tab === "forYou" ? forYou.isLoading : state.tab === "mine" ? mine.isLoading && Boolean(apiKey) : false,
        error: (remote ? query.error : state.tab === "forYou" ? forYou.error : state.tab === "mine" ? mine.error : null) as Error | null,
        sources: firstPage?.sourceOptions || [],
        sceneCounts: firstPage?.sceneCounts || {},
        favoriteCount: favorites.length,
        recentCount: recent.length,
        forYou: forYou.data,
        mineCount: mine.data?.pages[0]?.total,
    };
}
