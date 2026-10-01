import { App } from "antd";
import { useTranslation } from "react-i18next";

import { canvasShareUrl } from "@/lib/referral";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/** Share link to a canvas page, carrying the signed-in user's invite code; copy() puts it on the clipboard. */
export function useShareLink(path: string) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const code = useMainAccountStore((state) => (state.status === "signedIn" ? state.account?.aff_code || "" : ""));
    const url = canvasShareUrl(path, code);
    const invited = url.includes("aff=");
    const copy = () => {
        void navigator.clipboard?.writeText(url);
        message.success(t(invited ? "community.copiedWithInvite" : "community.copied"));
    };
    return { url, invited, copy };
}
