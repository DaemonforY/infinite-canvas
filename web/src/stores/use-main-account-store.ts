import { create } from "zustand";

import { forgetOwnReferral } from "@/lib/referral";
import { fetchMainSiteAccount, fetchWatermarkOff, signOutMainSite, type MainSiteAccount } from "@/services/api/main-site-account";

type AccountStatus = "unknown" | "signedOut" | "signedIn";

type MainAccountStore = {
    status: AccountStatus;
    account: MainSiteAccount | null;
    /** The main site turned the watermark off for everyone (read once per page load by loadSite). */
    watermarkOff: boolean;
    loadSite: () => Promise<void>;
    /** Re-reads the account from the main site (keeps the last state on network errors). */
    refresh: () => Promise<void>;
    signOut: () => Promise<void>;
};

let inflight: Promise<void> | null = null;
let siteLoad: Promise<void> | null = null;

export const useMainAccountStore = create<MainAccountStore>((set) => ({
    status: "unknown",
    account: null,
    watermarkOff: false,
    loadSite: () => {
        siteLoad ??= fetchWatermarkOff().then((watermarkOff) => set({ watermarkOff }));
        return siteLoad;
    },
    refresh: () => {
        inflight ??= fetchMainSiteAccount()
            .then((account) => {
                if (account) forgetOwnReferral(account.aff_code);
                set(account ? { status: "signedIn", account } : { status: "signedOut", account: null });
            })
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
