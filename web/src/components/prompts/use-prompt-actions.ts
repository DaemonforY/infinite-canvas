import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";
import { deleteMyPrompt } from "@/services/api/main-site-prompts";
import type { Prompt } from "@/services/api/prompts";
import { currentMainSiteKey, reportFavorite, reportUse } from "@/services/api/prompt-usage";
import { useMyPromptEditorStore } from "@/stores/use-my-prompt-editor-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { FOR_YOU_QUERY_KEY, MY_PROMPTS_QUERY_KEY } from "./use-prompt-list";

/** What a user can do with a library prompt: draw with it, copy it, favorite it, keep it, save it as their own. */
export function usePromptActions() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const openEditor = useMyPromptEditorStore((state) => state.open);
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
            reportUse(item);
            const video = item.traits.scenes[0] === "video";
            if (video) useWorkbenchAgentStore.getState().dispatchVideo({ prompt: item.prompt, run: false });
            else useWorkbenchAgentStore.getState().dispatchImage({ prompt: item.prompt, run: false });
            navigate(video ? "/video" : "/image");
            if (item.traits.needsReference) message.info(t("prompts.needsReferenceHint"), 5);
            else message.success(t("prompts.filledIn"));
        },
        copy: (item: Prompt) => {
            markUsed(item);
            reportUse(item);
            copyText(item.prompt, t("common.promptCopied"));
        },
        toggleFavorite: (item: Prompt) => {
            const added = toggleFavorite(item);
            reportFavorite(item, added);
            message.success(added ? t("prompts.favorited") : t("prompts.unfavorited"));
        },
        saveAsset: (item: Prompt) => {
            addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
            message.success(t("common.addedToAssets"));
        },
        /** Opens the editor: edits the user's own prompt, or starts a new one from a library prompt. */
        saveMine: (item: Prompt) => {
            if (item.mine) openEditor({ item });
            else openEditor({ prompt: item.prompt, title: item.title, kind: item.traits.scenes[0] === "video" ? "video" : "image" });
        },
        deleteMine: (item: Prompt) => {
            const key = currentMainSiteKey();
            if (!key || !item.serverId) return;
            modal.confirm({
                title: t("myPrompts.deleteTitle"),
                content: t("myPrompts.deleteConfirm", { title: item.title }),
                okText: t("common.delete"),
                okButtonProps: { danger: true },
                cancelText: t("common.cancel"),
                onOk: async () => {
                    try {
                        await deleteMyPrompt(key, item.serverId!);
                        message.success(t("myPrompts.deleted"));
                        void queryClient.invalidateQueries({ queryKey: [MY_PROMPTS_QUERY_KEY] });
                        void queryClient.invalidateQueries({ queryKey: [FOR_YOU_QUERY_KEY] });
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : String(error));
                    }
                },
            });
        },
    };
}
