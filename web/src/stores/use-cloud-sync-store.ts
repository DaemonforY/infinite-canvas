import { create } from "zustand";
import { persist } from "zustand/middleware";

import { syncAppData, type AppSyncDomainKey, type AppSyncProgressEvent, type AppSyncResult } from "@/services/app-sync";
import { cloudTransport, getCloudUsage, type CloudUsage } from "@/services/api/main-site-cloud";
import { useMainAccountStore } from "@/stores/use-main-account-store";

// HiveGPT cloud sync of this device's canvases, assets and workbench records. Turned on per
// account (local data is not tied to an account, so another person signing in on this browser
// does not sync it into theirs without asking).

export type CloudDomainProgress = { stage: string; current?: number; total?: number; status?: AppSyncProgressEvent["status"] };

type CloudSyncStore = {
    /** User ids that turned cloud sync on, on this device. */
    enabledFor: number[];
    /** Last successful sync per user id (ISO time). */
    lastSyncedAt: Record<number, string>;
    /** The account this device last synced with. */
    lastUserId: number;
    syncing: boolean;
    stage: string;
    error: string;
    progress: Partial<Record<AppSyncDomainKey, CloudDomainProgress>>;
    usage: CloudUsage | null;
    setEnabled: (userId: number, on: boolean) => void;
    /** Runs a sync for the signed-in user; null when not signed in or already running. Throws on failure. */
    sync: () => Promise<AppSyncResult | null>;
    refreshUsage: () => Promise<void>;
};

export const useCloudSyncStore = create<CloudSyncStore>()(
    persist(
        (set, get) => ({
            enabledFor: [],
            lastSyncedAt: {},
            lastUserId: 0,
            syncing: false,
            stage: "",
            error: "",
            progress: {},
            usage: null,
            setEnabled: (userId, on) => set((state) => ({ enabledFor: on ? Array.from(new Set([...state.enabledFor, userId])) : state.enabledFor.filter((id) => id !== userId) })),
            sync: async () => {
                const account = useMainAccountStore.getState();
                const userId = account.status === "signedIn" ? account.account?.user_id || 0 : 0;
                if (!userId || get().syncing) return null;
                set({ syncing: true, stage: "", error: "", progress: {} });
                try {
                    const result = await syncAppData(cloudTransport(), (event) =>
                        set((state) => ({
                            stage: event.stage,
                            progress: event.domain ? { ...state.progress, [event.domain]: { stage: event.stage, current: event.current, total: event.total, status: event.status } } : state.progress,
                        })),
                    );
                    set((state) => ({ lastSyncedAt: { ...state.lastSyncedAt, [userId]: result.syncedAt }, lastUserId: userId }));
                    void get().refreshUsage();
                    return result;
                } catch (error) {
                    set({ error: error instanceof Error ? error.message : String(error) });
                    void get().refreshUsage();
                    throw error;
                } finally {
                    set({ syncing: false });
                }
            },
            refreshUsage: async () => {
                try {
                    set({ usage: await getCloudUsage() });
                } catch {
                    // Usage is informational; the sync itself reports errors.
                }
            },
        }),
        {
            name: "infinite-canvas:cloud_sync",
            partialize: (state) => ({ enabledFor: state.enabledFor, lastSyncedAt: state.lastSyncedAt, lastUserId: state.lastUserId }),
        },
    ),
);

/** Whether the signed-in user turned cloud sync on, on this device. */
export function useCloudSyncEnabled(): boolean {
    const userId = useMainAccountStore((state) => (state.status === "signedIn" ? state.account?.user_id || 0 : 0));
    return useCloudSyncStore((state) => userId > 0 && state.enabledFor.includes(userId));
}
