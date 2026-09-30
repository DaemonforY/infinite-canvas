import { create } from "zustand";
import { persist } from "zustand/middleware";

import { promptKey, type Prompt } from "@/services/api/prompts";

// Favorites and recently used prompts. Entries are stored as snapshots so they survive a source
// being disabled, refreshed or removed.

const MAX_FAVORITES = 500;
const MAX_RECENT = 30;

type PromptLibraryStore = {
    favorites: Prompt[];
    recent: Prompt[];
    toggleFavorite: (prompt: Prompt) => boolean;
    markUsed: (prompt: Prompt) => void;
    clearRecent: () => void;
};

export const usePromptLibraryStore = create<PromptLibraryStore>()(
    persist(
        (set, get) => ({
            favorites: [],
            recent: [],
            toggleFavorite: (prompt) => {
                const key = promptKey(prompt);
                const exists = get().favorites.some((item) => promptKey(item) === key);
                set((state) => ({
                    favorites: exists ? state.favorites.filter((item) => promptKey(item) !== key) : [prompt, ...state.favorites].slice(0, MAX_FAVORITES),
                }));
                return !exists;
            },
            markUsed: (prompt) => {
                const key = promptKey(prompt);
                set((state) => ({ recent: [prompt, ...state.recent.filter((item) => promptKey(item) !== key)].slice(0, MAX_RECENT) }));
            },
            clearRecent: () => set({ recent: [] }),
        }),
        { name: "infinite-canvas:prompt_library_v1", partialize: (state) => ({ favorites: state.favorites, recent: state.recent }) },
    ),
);

export function useIsFavoritePrompt(prompt: Prompt | null | undefined) {
    return usePromptLibraryStore((state) => (prompt ? state.favorites.some((item) => promptKey(item) === promptKey(prompt)) : false));
}
