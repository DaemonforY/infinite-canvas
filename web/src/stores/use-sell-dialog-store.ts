import { create } from "zustand";

import type { Listing } from "@/services/api/main-site-market";

/** A prompt chosen for a listing (from 「我的」). */
export type SellPick = { id: number; title: string; prompt: string; coverUrl?: string };

export type SellDialogPayload = { listing?: Listing; picks?: SellPick[] };

type SellDialogStore = {
    payload: SellDialogPayload | null;
    open: (payload: SellDialogPayload) => void;
    close: () => void;
};

/** 上架出售: opened from 「我的」 multi-select or from 市场 → 我在卖. */
export const useSellDialogStore = create<SellDialogStore>()((set) => ({
    payload: null,
    open: (payload) => set({ payload }),
    close: () => set({ payload: null }),
}));
