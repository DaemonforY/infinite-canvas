import { create } from "zustand";

import { fetchMainSiteAccount, signOutMainSite, type MainSiteAccount } from "@/services/api/main-site-account";

type AccountStatus = "unknown" | "signedOut" | "signedIn";

type MainAccountStore = {
    status: AccountStatus;
    account: MainSiteAccount | null;
    /** Re-reads the account from the main site (keeps the last state on network errors). */
    refresh: () => Promise<void>;
    signOut: () => Promise<void>;
};

let inflight: Promise<void> | null = null;

export const useMainAccountStore = create<MainAccountStore>((set) => ({
    status: "unknown",
    account: null,
    refresh: () => {
        inflight ??= fetchMainSiteAccount()
            .then((account) => set(account ? { status: "signedIn", account } : { status: "signedOut", account: null }))
            .catch(() => set((state) => (state.status === "unknown" ? { status: "signedOut" } : state)))
            .finally(() => {
                inflight = null;
            });
        return inflight;
    },
    signOut: async () => {
        await signOutMainSite();
        set({ status: "signedOut", account: null });
    },
}));
