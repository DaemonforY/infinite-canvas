// "For you" without a main-site account: the scenes the user reaches for most, read from the local
// recently-used and favorite prompts. With an account the main site builds the profile instead
// (from usage on every device). Pure functions — unit-tested in tests/prompt-recommend.test.ts.

import type { PromptScene } from "./prompt-taxonomy";

type Tasted = { traits: { scenes: PromptScene[] } };

/** Top scenes, most used first: newer recents weigh more, favorites count double. */
export function localTasteScenes(recent: Tasted[], favorites: Tasted[], max = 3): PromptScene[] {
    const weights = new Map<PromptScene, number>();
    const add = (item: Tasted, weight: number) => {
        item.traits.scenes.forEach((scene, index) => {
            if (scene === "other") return;
            weights.set(scene, (weights.get(scene) || 0) + weight * (index === 0 ? 1 : 0.5));
        });
    };
    recent.forEach((item, index) => add(item, 1 / (1 + index * 0.1)));
    favorites.forEach((item) => add(item, 2));
    return [...weights.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, max)
        .map(([scene]) => scene);
}

/** Interleaves per-scene lists so one scene does not fill the page. */
export function interleave<T>(lists: T[][], key: (item: T) => string, limit: number): T[] {
    const out: T[] = [];
    const seen = new Set<string>();
    for (let round = 0; out.length < limit && lists.some((list) => round < list.length); round += 1) {
        for (const list of lists) {
            const item = list[round];
            if (!item || seen.has(key(item))) continue;
            seen.add(key(item));
            out.push(item);
            if (out.length >= limit) break;
        }
    }
    return out;
}
