import { create } from "zustand";

import type { Prompt } from "@/services/api/prompts";

export type PromptVariableRequest = { item: Prompt; action: "draw" | "copy" };

type PromptVariableStore = {
    request: PromptVariableRequest | null;
    open: (request: PromptVariableRequest) => void;
    close: () => void;
};

/** The {变量} fill-in dialog, opened when a template prompt is drawn with or copied. */
export const usePromptVariableStore = create<PromptVariableStore>()((set) => ({
    request: null,
    open: (request) => set({ request }),
    close: () => set({ request: null }),
}));
