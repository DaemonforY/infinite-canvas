import { useEffect } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { canvasShareUrl, normalizeReferralCode } from "@/lib/referral";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/**
 * Share link to a canvas page, carrying the signed-in user's invite code; copy() puts it on the clipboard.
 * syncAddressBar (for the page being shown): also puts the code in the address bar, so links copied
 * from there or shared with the browser's own share button carry it too.
 */
export function useShareLink(path: string, { syncAddressBar = false } = {}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const signedIn = useMainAccountStore((state) => state.status === "signedIn");
    const code = useMainAccountStore((state) => (state.status === "signedIn" ? normalizeReferralCode(state.account?.aff_code) : ""));
    const [params, setParams] = useSearchParams();
    const url = canvasShareUrl(path, code);
    const invited = Boolean(code);

    useEffect(() => {
        if (!syncAddressBar || !code || params.get("aff") === code) return;
        const next = new URLSearchParams(params);
        next.set("aff", code);
        setParams(next, { replace: true, preventScrollReset: true });
    }, [code, params, setParams, syncAddressBar]);

    const copy = () => {
        void navigator.clipboard?.writeText(url);
        message.success(t(invited ? "community.copiedWithInvite" : "community.copied"));
    };
    return { url, invited, signedIn, copy };
}
