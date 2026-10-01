import { create } from "zustand";

import { getMyCommunity, type CommunityProfile } from "@/services/api/community";

type CommunityMeStore = {
    /** undefined: not loaded; null: signed in without a public profile yet. */
    profile: CommunityProfile | null | undefined;
    unread: number;
    refresh: () => Promise<void>;
    setProfile: (profile: CommunityProfile | null) => void;
    clear: () => void;
};

let inflight: Promise<void> | null = null;

/** The signed-in viewer's community profile and unread notification count. */
export const useCommunityMeStore = create<CommunityMeStore>((set) => ({
    profile: undefined,
    unread: 0,
    refresh: () => {
        inflight ??= getMyCommunity()
            .then((me) => set({ profile: me.profile, unread: me.unread_notifications }))
            .catch(() => set({ profile: undefined, unread: 0 }))
            .finally(() => {
                inflight = null;
            });
        return inflight;
    },
    setProfile: (profile) => set({ profile }),
    clear: () => set({ profile: undefined, unread: 0 }),
}));
