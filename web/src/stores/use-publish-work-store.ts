import { create } from "zustand";

export type PublishWorkPayload = {
    /** Images to publish: any URL the canvas can fetch (data:, blob:, remote). Empty: pick files. */
    images?: string[];
    prompt?: string;
    model?: string;
    params?: Record<string, unknown>;
    title?: string;
    source: "canvas" | "image_workbench" | "tools";
    remixOf?: number;
};

type PublishWorkStore = {
    payload: PublishWorkPayload | null;
    open: (payload: PublishWorkPayload) => void;
    close: () => void;
};

/** Opens the shared "发布作品" dialog from any image surface. */
export const usePublishWorkStore = create<PublishWorkStore>()((set) => ({
    payload: null,
    open: (payload) => set({ payload }),
    close: () => set({ payload: null }),
}));
