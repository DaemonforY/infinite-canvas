import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { createConnectState, openConnectPopup, parseConnectMessage } from "@/services/api/main-site-connect";
import { useCommunityMeStore } from "@/stores/use-community-me-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/** "登录": opens the main site's connect popup and applies its answer (session, optional key). */
export function useMainSiteSignIn() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const refresh = useMainAccountStore((state) => state.refresh);
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);
    const [waiting, setWaiting] = useState(false);
    const stateRef = useRef("");
    const site = MAIN_SITE_NAME;

    useEffect(() => {
        if (!waiting) return;
        const onMessage = (event: MessageEvent) => {
            const reply = parseConnectMessage(event, stateRef.current);
            if (!reply) return;
            setWaiting(false);
            if (reply.apiKey) importChannelCredentials({ baseUrl: reply.baseUrl, apiKey: reply.apiKey });
            void refresh().then(() => {
                if (useMainAccountStore.getState().status === "signedIn") {
                    void useCommunityMeStore.getState().refresh();
                    message.success(t(reply.apiKey ? "account.signedIn" : "account.signedInNoKey", { site }));
                } else message.warning(t("account.cookieBlocked", { site }), 8);
            });
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [importChannelCredentials, message, refresh, site, t, waiting]);

    const signIn = () => {
        stateRef.current = createConnectState();
        const popup = openConnectPopup(stateRef.current);
        if (!popup) {
            message.warning(t("quickStart.popupBlocked"));
            return;
        }
        setWaiting(true);
    };

    return { signIn, waiting };
}
