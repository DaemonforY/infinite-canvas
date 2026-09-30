// Reports library usage to the main site when the user has connected a main-site key: what they
// draw with feeds the site-wide "most used" order and their own "for you" list. Fire and forget.

import { findMainSiteApiKey } from "./main-site-contests";
import { reportPromptFavorite, reportPromptUse } from "./main-site-prompts";
import type { Prompt } from "./prompts";
import { useConfigStore } from "@/stores/use-config-store";

export function currentMainSiteKey(): string {
    return findMainSiteApiKey(useConfigStore.getState().config);
}

export function reportUse(item: Prompt) {
    const key = currentMainSiteKey();
    if (!key || !item.serverId) return;
    void reportPromptUse(key, item.serverId).catch(() => undefined);
}

export function reportFavorite(item: Prompt, favorited: boolean) {
    const key = currentMainSiteKey();
    if (!key || !item.serverId) return;
    void reportPromptFavorite(key, item.serverId, favorited).catch(() => undefined);
}
