import { create } from "zustand";

export type ContestSubmitPayload = {
    /** Any URL the canvas can fetch: data:, blob: or remote. */
    imageUrl: string;
    prompt?: string;
    title?: string;
};

type ContestSubmitStore = {
    payload: ContestSubmitPayload | null;
    open: (payload: ContestSubmitPayload) => void;
    close: () => void;
};

/** Opens the single shared "submit to contest" dialog from any image surface. */
export const useContestSubmitStore = create<ContestSubmitStore>()((set) => ({
    payload: null,
    open: (payload) => set({ payload }),
    close: () => set({ payload: null }),
}));
