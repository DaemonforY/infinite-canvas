import { App } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";
import type { Prompt } from "@/services/api/prompts";
import { useAssetStore } from "@/stores/use-asset-store";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";

/** What a user can do with a library prompt: draw with it, copy it, favorite it, keep it as an asset. */
export function usePromptActions() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const toggleFavorite = usePromptLibraryStore((state) => state.toggleFavorite);
    const markUsed = usePromptLibraryStore((state) => state.markUsed);

    return {
        /** Opens the image (or video) workbench with the prompt filled in; the user still clicks generate. */
        draw: (item: Prompt) => {
            markUsed(item);
            const video = item.traits.scenes[0] === "video";
            if (video) useWorkbenchAgentStore.getState().dispatchVideo({ prompt: item.prompt, run: false });
            else useWorkbenchAgentStore.getState().dispatchImage({ prompt: item.prompt, run: false });
            navigate(video ? "/video" : "/image");
            if (item.traits.needsReference) message.info(t("prompts.needsReferenceHint"), 5);
            else message.success(t("prompts.filledIn"));
        },
        copy: (item: Prompt) => {
            markUsed(item);
            copyText(item.prompt, t("common.promptCopied"));
        },
        toggleFavorite: (item: Prompt) => {
            const added = toggleFavorite(item);
            message.success(added ? t("prompts.favorited") : t("prompts.unfavorited"));
        },
        saveAsset: (item: Prompt) => {
            addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
            message.success(t("common.addedToAssets"));
        },
    };
}
