import { useEffect, useRef, useState, type CSSProperties } from "react";
import { App, Button, Checkbox, Dropdown, Modal } from "antd";
import { CreditCard, Globe, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isMainSiteBaseUrl, MAIN_SITE_NAME, mainSiteLink } from "@/constant/runtime-config";
import { accountDisplayName, latestSubscription } from "@/services/api/main-site-account";
import { createConnectState, openConnectPopup, parseConnectMessage } from "@/services/api/main-site-connect";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { useConfigStore } from "@/stores/use-config-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/** Top-bar account entry: "登录" when signed out, the avatar with balance / subscription / links when signed in. */
export function AccountMenu({ style }: { style?: CSSProperties }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const status = useMainAccountStore((state) => state.status);
    const account = useMainAccountStore((state) => state.account);
    const refresh = useMainAccountStore((state) => state.refresh);
    const signOut = useMainAccountStore((state) => state.signOut);
    const config = useConfigStore((state) => state.config);
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [waiting, setWaiting] = useState(false);
    const [confirmOut, setConfirmOut] = useState(false);
    const [removeKey, setRemoveKey] = useState(true);
    const stateRef = useRef("");
    const site = MAIN_SITE_NAME;
    const hasKey = Boolean(findMainSiteApiKey(config));

    useEffect(() => {
        if (status === "unknown") void refresh();
        const onFocus = () => void refresh();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [refresh, status]);

    useEffect(() => {
        if (!waiting) return;
        const onMessage = (event: MessageEvent) => {
            const reply = parseConnectMessage(event, stateRef.current);
            if (!reply) return;
            setWaiting(false);
            if (reply.apiKey) importChannelCredentials({ baseUrl: reply.baseUrl, apiKey: reply.apiKey });
            void refresh().then(() => {
                if (useMainAccountStore.getState().status === "signedIn") message.success(t(reply.apiKey ? "account.signedIn" : "account.signedInNoKey", { site }));
                else message.warning(t("account.cookieBlocked", { site }), 8);
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

    const doSignOut = async () => {
        await signOut();
        if (removeKey)
            updateConfig(
                "channels",
                (config.channels || []).map((channel) => (isMainSiteBaseUrl(channel.baseUrl) ? { ...channel, apiKey: "" } : channel)),
            );
        setConfirmOut(false);
        message.success(t("account.signedOut"));
    };

    if (status !== "signedIn" || !account) {
        return (
            <Button size="small" type="primary" icon={<LogIn className="size-3.5" />} loading={waiting} onClick={signIn} data-testid="account-sign-in">
                {t("account.signIn")}
            </Button>
        );
    }

    const name = accountDisplayName(account);
    const sub = latestSubscription(account);
    const items = [
        {
            key: "summary",
            disabled: true,
            label: (
                <div className="grid gap-0.5 py-1 text-stone-700 dark:text-stone-200" data-testid="account-summary">
                    <span className="font-medium">{name}</span>
                    <span className="text-xs text-stone-500">{account.email}</span>
                    <span className="mt-1 text-xs">{t("account.balance", { amount: account.balance.toFixed(2) })}</span>
                    <span className="text-xs">{sub ? t("account.subscription", { name: sub.group_name, date: sub.expires_at.slice(0, 10) }) : t("account.noSubscription")}</span>
                    {!hasKey ? <span className="text-xs text-amber-600">{t("account.noKey")}</span> : null}
                </div>
            ),
        },
        { type: "divider" as const },
        {
            key: "topup",
            icon: <CreditCard className="size-4" />,
            label: (
                <a href={mainSiteLink("/purchase", "account-menu")} target="_blank" rel="noopener noreferrer">
                    {t("account.topUp")}
                </a>
            ),
        },
        {
            key: "sites",
            icon: <Globe className="size-4" />,
            label: (
                <a href={mainSiteLink("/sites", "account-menu")} target="_blank" rel="noopener noreferrer">
                    {t("account.sites")}
                </a>
            ),
        },
        {
            key: "profile",
            icon: <Settings className="size-4" />,
            label: (
                <a href={mainSiteLink("/profile", "account-menu")} target="_blank" rel="noopener noreferrer">
                    {t("account.settings", { site })}
                </a>
            ),
        },
        { type: "divider" as const },
        { key: "signout", icon: <LogOut className="size-4" />, label: t("account.signOut"), onClick: () => setConfirmOut(true) },
    ];

    return (
        <>
            <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
                <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-xs font-semibold text-violet-800 ring-1 ring-black/5 dark:bg-violet-900/50 dark:text-violet-100"
                    style={style}
                    aria-label={t("account.menu", { name })}
                    title={name}
                    data-testid="account-avatar"
                >
                    {account.avatar_url ? <img src={account.avatar_url} alt="" className="size-full object-cover" /> : name.trim() ? Array.from(name.trim())[0].toUpperCase() : <UserRound className="size-4" />}
                </button>
            </Dropdown>
            <Modal open={confirmOut} title={t("account.signOutTitle")} okText={t("account.signOut")} cancelText={t("common.cancel")} onOk={() => void doSignOut()} onCancel={() => setConfirmOut(false)} destroyOnHidden>
                <p className="text-sm">{t("account.signOutHint", { site })}</p>
                {hasKey ? (
                    <Checkbox checked={removeKey} onChange={(event) => setRemoveKey(event.target.checked)}>
                        {t("account.removeKey", { site })}
                    </Checkbox>
                ) : null}
            </Modal>
        </>
    );
}
