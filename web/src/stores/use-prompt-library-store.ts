import { create } from "zustand";
import { persist } from "zustand/middleware";

import { emptyFavoritesDoc, favoritesFromDoc, mergeFavoritesDocs, pruneFavoritesDoc, type FavoritesDoc } from "@/lib/account-sync";
import { promptTraits } from "@/lib/prompt-taxonomy";
import { promptKey, type Prompt } from "@/services/api/prompts";

// Favorites and recently used prompts. Entries are stored as snapshots so they survive a source
// being disabled, refreshed or removed. Favorites are kept as a timestamped document (with
// removal tombstones) so they can be merged with the copy on the user's account
// (see components/layout/account-sync.tsx).

const MAX_RECENT = 30;

type PromptLibraryStore = {
    favoriteDoc: FavoritesDoc<Prompt>;
    /** Live favorites, newest first; derived from favoriteDoc. */
    favorites: Prompt[];
    recent: Prompt[];
    toggleFavorite: (prompt: Prompt) => boolean;
    /** Replaces the local favorites with a merged document (sync). */
    applyFavoriteDoc: (doc: FavoritesDoc<Prompt>) => void;
    markUsed: (prompt: Prompt) => void;
    clearRecent: () => void;
};

/** Drops heavy fields before a prompt is stored as a favorite (the account copy is capped at 1MB). */
export function slimPrompt(prompt: Prompt): Prompt {
    return {
        ...prompt,
        prompt: prompt.prompt.slice(0, 8000),
        description: (prompt.description || "").slice(0, 500),
        preview: "",
        referenceImageUrls: (prompt.referenceImageUrls || []).slice(0, 4),
        tags: (prompt.tags || []).slice(0, 12),
    };
}

export const usePromptLibraryStore = create<PromptLibraryStore>()(
    persist(
        (set, get) => ({
            favoriteDoc: emptyFavoritesDoc<Prompt>(),
            favorites: [],
            recent: [],
            toggleFavorite: (prompt) => {
                const key = promptKey(prompt);
                const current = get().favoriteDoc.items[key];
                const adding = !current || Boolean(current.removed);
                const at = Math.max(Date.now(), (current?.at || 0) + 1);
                const doc = pruneFavoritesDoc({ v: 1, items: { ...get().favoriteDoc.items, [key]: adding ? { at, prompt: slimPrompt(prompt) } : { at, removed: true } } });
                set({ favoriteDoc: doc, favorites: favoritesFromDoc(doc) });
                return adding;
            },
            applyFavoriteDoc: (doc) => {
                const clean = sanitizeFavoriteDoc(doc);
                set({ favoriteDoc: clean, favorites: favoritesFromDoc(clean) });
            },
            markUsed: (prompt) => {
                const key = promptKey(prompt);
                set((state) => ({ recent: [slimPrompt(prompt), ...state.recent.filter((item) => promptKey(item) !== key)].slice(0, MAX_RECENT) }));
            },
            clearRecent: () => set({ recent: [] }),
        }),
        {
            name: "infinite-canvas:prompt_library_v1",
            partialize: (state) => ({ favoriteDoc: state.favoriteDoc, recent: state.recent }),
            merge: (persisted, current) => {
                const saved = (persisted || {}) as { favoriteDoc?: FavoritesDoc<Prompt>; favorites?: Prompt[]; recent?: Prompt[] };
                let doc = saved.favoriteDoc?.items ? saved.favoriteDoc : emptyFavoritesDoc<Prompt>();
                // First version stored a plain array; keep its order as timestamps.
                if (Array.isArray(saved.favorites) && saved.favorites.length) {
                    const base = Date.now();
                    const legacy: FavoritesDoc<Prompt> = { v: 1, items: Object.fromEntries(saved.favorites.map((item, index) => [promptKey(item), { at: base - index, prompt: slimPrompt(item) }])) };
                    doc = mergeFavoritesDocs(doc, legacy);
                }
                return { ...current, favoriteDoc: doc, favorites: favoritesFromDoc(doc), recent: Array.isArray(saved.recent) ? saved.recent : [] };
            },
        },
    ),
);

/**
 * Favorites coming from the account were written by another device (possibly an older version):
 * drop entries that are not usable prompts and fill in what the UI relies on.
 */
function sanitizeFavoriteDoc(doc: FavoritesDoc<Prompt>): FavoritesDoc<Prompt> {
    const items: FavoritesDoc<Prompt>["items"] = {};
    for (const [key, entry] of Object.entries(doc.items)) {
        if (entry.removed) {
            items[key] = entry;
            continue;
        }
        const raw = entry.prompt as Partial<Prompt> | undefined;
        if (!raw || typeof raw.prompt !== "string" || !raw.prompt.trim() || typeof raw.id !== "string") continue;
        const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [];
        const prompt: Prompt = {
            ...(raw as Prompt),
            title: typeof raw.title === "string" ? raw.title : "",
            description: typeof raw.description === "string" ? raw.description : "",
            coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl : "",
            referenceImageUrls: Array.isArray(raw.referenceImageUrls) ? raw.referenceImageUrls.filter((url): url is string => typeof url === "string") : [],
            preview: "",
            tags,
            createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
            updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
            sourceId: typeof raw.sourceId === "string" ? raw.sourceId : "synced",
            category: typeof raw.category === "string" ? raw.category : "",
            githubUrl: typeof raw.githubUrl === "string" ? raw.githubUrl : "",
            traits: raw.traits && Array.isArray(raw.traits.scenes) ? raw.traits : promptTraits({ title: raw.title, prompt: raw.prompt, description: raw.description, tags, imageModel: raw.imageModel }),
        };
        items[key] = { at: entry.at, prompt };
    }
    return { v: 1, items };
}

export function useIsFavoritePrompt(prompt: Prompt | null | undefined) {
    return usePromptLibraryStore((state) => {
        if (!prompt) return false;
        const entry = state.favoriteDoc.items[promptKey(prompt)];
        return Boolean(entry && !entry.removed);
    });
}
