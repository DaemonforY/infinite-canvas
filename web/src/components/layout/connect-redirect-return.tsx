import { useEffect } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_API_BASE_URL, MAIN_SITE_NAME } from "@/constant/runtime-config";
import { fetchConnectKey, takeConnectRedirectReturn } from "@/services/api/main-site-connect";
import { useCommunityMeStore } from "@/stores/use-community-me-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/** Back from the main site's full-page sign-in (#hivegpt_connect=…): take the key, refresh the account. */
export function ConnectRedirectReturn() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);

    useEffect(() => {
        if (!takeConnectRedirectReturn()) return;
        void (async () => {
            const apiKey = await fetchConnectKey().catch(() => "");
            if (apiKey) importChannelCredentials({ baseUrl: MAIN_SITE_API_BASE_URL, apiKey });
            await useMainAccountStore.getState().refresh();
            if (useMainAccountStore.getState().status !== "signedIn") {
                message.warning(t("account.cookieBlocked", { site: MAIN_SITE_NAME }), 8);
                return;
            }
            void useCommunityMeStore.getState().refresh();
            message.success(t(apiKey ? "account.signedIn" : "account.signedInNoKey", { site: MAIN_SITE_NAME }));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
