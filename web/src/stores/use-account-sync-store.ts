import { create } from "zustand";

export type AccountSyncStatus = "off" | "syncing" | "synced" | "error";

/** Status of syncing favorites / drafts with the main-site account, shown next to those features. */
export const useAccountSyncStore = create<{ status: AccountSyncStatus; lastSyncedAt: number; error: string; set: (patch: Partial<{ status: AccountSyncStatus; lastSyncedAt: number; error: string }>) => void }>((set) => ({
    status: "off",
    lastSyncedAt: 0,
    error: "",
    set: (patch) => set(patch),
}));
