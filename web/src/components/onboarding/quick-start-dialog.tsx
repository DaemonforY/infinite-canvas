import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, App, Button, Divider, Input, Modal, Spin } from "antd";
import { KeyRound, Link2, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_API_BASE_URL, MAIN_SITE_NAME, mainSiteLink } from "@/constant/runtime-config";
import { createConnectState, openConnectPopup, parseConnectMessage, testApiKey } from "@/services/api/main-site-connect";
import { useConfigStore } from "@/stores/use-config-store";

/**
 * First-run setup: shown instead of the full configuration dialog while no channel has an API key.
 * One click connects the user's main-site account (popup + postMessage); pasting a key is the fallback.
 */
export function QuickStartDialog() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const open = useConfigStore((state) => state.isQuickStartOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const closeQuickStart = useConfigStore((state) => state.closeQuickStart);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    const [waiting, setWaiting] = useState(false);
    const [popupBlocked, setPopupBlocked] = useState(false);
    const [pasted, setPasted] = useState("");
    const [testing, setTesting] = useState(false);
    const [pasteError, setPasteError] = useState("");
    const stateRef = useRef("");

    const site = MAIN_SITE_NAME;

    const finish = useCallback(
        (apiKey: string, viaConnect: boolean) => {
            const result = importChannelCredentials({ baseUrl: MAIN_SITE_API_BASE_URL, apiKey });
            if (result.status !== "created" && result.status !== "updated") {
                message.error(t("quickStart.saveFailed"));
                return;
            }
            message.success(t(viaConnect ? "quickStart.connected" : "quickStart.saved", { site }));
            if (shouldPromptContinue) message.info(t("quickStart.continueHint"), 4);
            clearPromptContinue();
            setWaiting(false);
            setPasted("");
            closeQuickStart();
        },
        [clearPromptContinue, closeQuickStart, importChannelCredentials, message, shouldPromptContinue, site, t],
    );

    // Listen for the key only while a connect request is pending.
    useEffect(() => {
        if (!waiting) return;
        const onMessage = (event: MessageEvent) => {
            const key = parseConnectMessage(event, stateRef.current);
            if (key) finish(key.apiKey, true);
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [finish, waiting]);

    useEffect(() => {
        if (open) return;
        setWaiting(false);
        setPopupBlocked(false);
        setPasteError("");
    }, [open]);

    const connect = () => {
        stateRef.current = createConnectState();
        const popup = openConnectPopup(stateRef.current);
        setPopupBlocked(!popup);
        setWaiting(Boolean(popup));
    };

    const savePasted = async () => {
        const key = pasted.trim();
        if (!key) return;
        setTesting(true);
        setPasteError("");
        try {
            const result = await testApiKey(key);
            if (!result.ok) {
                setPasteError(t(result.reason === "invalid" ? "quickStart.keyInvalid" : result.reason === "network" ? "quickStart.keyNetwork" : "quickStart.keyHttp", { status: result.status ?? "", site }));
                return;
            }
            if (!result.imageCapable) message.warning(t("quickStart.keyNoImageModels"), 6);
            finish(key, false);
        } finally {
            setTesting(false);
        }
    };

    const close = () => {
        clearPromptContinue();
        closeQuickStart();
    };

    return (
        <Modal open={open} onCancel={close} footer={null} width={520} destroyOnHidden title={t("quickStart.title", { site })}>
            <div className="space-y-4" data-testid="quick-start-dialog">
                <p className="text-sm leading-6 text-stone-600 dark:text-stone-400">{t("quickStart.description", { site })}</p>

                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                    <Button type="primary" size="large" block icon={<Link2 className="size-4" />} onClick={connect} data-testid="quick-start-connect">
                        {t("quickStart.connect", { site })}
                    </Button>
                    <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{t("quickStart.connectHint")}</p>
                    {waiting ? (
                        <div className="mt-3 flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
                            <Spin size="small" />
                            <span>{t("quickStart.waiting")}</span>
                            <Button type="link" size="small" className="!px-1" onClick={connect}>
                                {t("quickStart.reopen")}
                            </Button>
                        </div>
                    ) : null}
                    {popupBlocked ? (
                        <Alert
                            className="mt-3"
                            type="warning"
                            showIcon
                            message={t("quickStart.popupBlocked")}
                            action={
                                <Button size="small" href={mainSiteLink("/keys", "quick-start-blocked")} target="_blank" rel="noopener noreferrer">
                                    {t("quickStart.openKeysPage")}
                                </Button>
                            }
                        />
                    ) : null}
                </div>

                <Divider plain className="!my-2 text-xs text-stone-400">
                    {t("quickStart.or")}
                </Divider>

                <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-stone-800 dark:text-stone-200" htmlFor="quick-start-key">
                        <KeyRound className="size-4" />
                        {t("quickStart.pasteLabel")}
                    </label>
                    <div className="flex gap-2">
                        <Input.Password
                            id="quick-start-key"
                            value={pasted}
                            onChange={(event) => setPasted(event.target.value)}
                            onPressEnter={() => void savePasted()}
                            placeholder={t("quickStart.pastePlaceholder")}
                            autoComplete="off"
                            status={pasteError ? "error" : undefined}
                        />
                        <Button onClick={() => void savePasted()} loading={testing} disabled={!pasted.trim()} data-testid="quick-start-save">
                            {t("quickStart.testAndSave")}
                        </Button>
                    </div>
                    {pasteError ? <p className="mt-1.5 text-xs text-red-500">{pasteError}</p> : null}
                    <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
                        {t("quickStart.pasteHint", { site })}{" "}
                        <a className="underline" href={mainSiteLink("/keys", "quick-start")} target="_blank" rel="noopener noreferrer">
                            {t("quickStart.openKeysPage")}
                        </a>
                    </p>
                </div>

                <div className="flex justify-end border-t border-stone-100 pt-3 dark:border-stone-800">
                    <Button
                        type="text"
                        size="small"
                        icon={<Settings2 className="size-3.5" />}
                        onClick={() => {
                            closeQuickStart();
                            openConfigDialog(shouldPromptContinue, "channels", { advanced: true });
                        }}
                    >
                        {t("quickStart.advanced")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
