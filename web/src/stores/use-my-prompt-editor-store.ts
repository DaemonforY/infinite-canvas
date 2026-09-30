import { create } from "zustand";

import type { Prompt } from "@/services/api/prompts";

export type MyPromptEditorPayload = {
    /** Editing one of the user's own prompts. */
    item?: Prompt;
    prompt?: string;
    title?: string;
    /** A picture to use as the cover (e.g. the image just generated): data:, blob: or remote URL. */
    imageUrl?: string;
    kind?: "image" | "video";
};

type MyPromptEditorStore = {
    payload: MyPromptEditorPayload | null;
    open: (payload: MyPromptEditorPayload) => void;
    close: () => void;
};

/** Opens the single shared "save to my prompts" dialog from the library or a workbench. */
export const useMyPromptEditorStore = create<MyPromptEditorStore>()((set) => ({
    payload: null,
    open: (payload) => set({ payload }),
    close: () => set({ payload: null }),
}));
